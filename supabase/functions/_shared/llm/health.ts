// Provider circuit breaker (architecture §7 step 9): 3 failures (error or first-token timeout)
// within 60 s mark a provider down for 5 minutes. The state lives in provider_status so every
// Edge Function instance sees it; reads are cached briefly per instance.
import type { ProviderName } from './provider.ts';

export const FAILURE_THRESHOLD = 3;
export const FAILURE_WINDOW_MS = 60_000;
export const DOWN_FOR_MS = 5 * 60_000;
/** How long an instance trusts its cached provider_status read. */
export const STATUS_CACHE_MS = 10_000;

export interface ProviderHealth {
  /** down_until if the provider is down now, else null. */
  downUntil(name: ProviderName): Promise<Date | null>;
  /** Records a failure; resolves to down_until if this made (or kept) the provider down. */
  recordFailure(name: ProviderName): Promise<Date | null>;
}

/** Storage the cached health reads and writes (Supabase: provider_status + record_provider_failure). */
export interface ProviderStatusStore {
  readStatus(): Promise<Map<ProviderName, Date | null>>;
  recordFailure(name: ProviderName): Promise<Date | null>;
}

export class CachedProviderHealth implements ProviderHealth {
  private cache: { at: number; status: Map<ProviderName, Date | null> } | null = null;

  constructor(
    private readonly store: ProviderStatusStore,
    private readonly now: () => number = Date.now,
  ) {}

  async downUntil(name: ProviderName): Promise<Date | null> {
    if (!this.cache || this.now() - this.cache.at > STATUS_CACHE_MS) {
      this.cache = { at: this.now(), status: await this.store.readStatus() };
    }
    const until = this.cache.status.get(name) ?? null;
    return until && until.getTime() > this.now() ? until : null;
  }

  async recordFailure(name: ProviderName): Promise<Date | null> {
    const until = await this.store.recordFailure(name);
    if (this.cache) this.cache.status.set(name, until);
    return until;
  }
}

/** In-memory breaker with the same rules as record_provider_failure (tests, and fake mode). */
export class MemoryProviderHealth implements ProviderHealth, ProviderStatusStore {
  readonly failures = new Map<
    ProviderName,
    { count: number; windowStart: number | null; downUntil: number | null }
  >();

  constructor(private readonly now: () => number = Date.now) {}

  private row(name: ProviderName) {
    let row = this.failures.get(name);
    if (!row) {
      row = { count: 0, windowStart: null, downUntil: null };
      this.failures.set(name, row);
    }
    return row;
  }

  readStatus(): Promise<Map<ProviderName, Date | null>> {
    const status = new Map<ProviderName, Date | null>();
    for (const [name, row] of this.failures) {
      status.set(name, row.downUntil === null ? null : new Date(row.downUntil));
    }
    return Promise.resolve(status);
  }

  downUntil(name: ProviderName): Promise<Date | null> {
    const until = this.failures.get(name)?.downUntil ?? null;
    return Promise.resolve(until !== null && until > this.now() ? new Date(until) : null);
  }

  recordFailure(name: ProviderName): Promise<Date | null> {
    const row = this.row(name);
    const now = this.now();
    if (row.windowStart === null || row.windowStart <= now - FAILURE_WINDOW_MS) {
      row.count = 1;
      row.windowStart = now;
    } else {
      row.count++;
    }
    if (row.count >= FAILURE_THRESHOLD) {
      row.downUntil = now + DOWN_FOR_MS;
      row.count = 0;
      row.windowStart = null;
    }
    return Promise.resolve(
      row.downUntil !== null && row.downUntil > now ? new Date(row.downUntil) : null,
    );
  }

  /** Test helper. */
  markDown(name: ProviderName, untilMs: number): void {
    this.row(name).downUntil = untilMs;
  }
}
