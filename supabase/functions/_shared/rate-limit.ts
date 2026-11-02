// Per-user sliding-window rate limit, in memory per Edge Function instance (spec §9: 20/minute).
// consume_reply counts ai_requests in the last minute too, which covers several instances.

export const REPLY_RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60_000;
/** Cap on tracked users per instance; the oldest are evicted first. */
const MAX_KEYS = 20_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number = REPLY_RATE_LIMIT,
    readonly windowMs: number = RATE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns 0 when allowed, else the seconds until the next hit is allowed. */
  hit(key: string): number {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil(((recent[0] ?? now) + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return 0;
  }
}
