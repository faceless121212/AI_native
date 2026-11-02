// Runs one generation over the provider chain (architecture §7 step 9):
//  - providers marked down in provider_status are skipped;
//  - an error, or no first token within FIRST_TOKEN_TIMEOUT_MS, cancels the call and moves on to
//    the next provider (if one is configured); each counts as a failure for the breaker;
//  - the last provider in the chain gets a longer first-token limit (no one to fall back to);
//  - once output from a provider has produced a card, there is no fallback: an error then ends
//    the attempt with what was delivered.
// Works for any pair of providers and for a single provider.
import type { ProviderHealth } from './health.ts';
import {
  type LlmPrompt,
  type LlmProvider,
  ProviderError,
  type ProviderName,
  type StreamOutcome,
} from './provider.ts';

/** Architecture §7: fall back when the first token takes longer than 2.5 s. */
export const FIRST_TOKEN_TIMEOUT_MS = 2_500;
/** With nobody to fall back to, wait this long for the first token before failing. */
export const LAST_PROVIDER_FIRST_TOKEN_TIMEOUT_MS = 8_000;
/** Max silence between chunks once streaming. */
export const CHUNK_IDLE_TIMEOUT_MS = 10_000;

export interface RunnerTiming {
  firstTokenMs: number;
  lastProviderFirstTokenMs: number;
  chunkIdleMs: number;
}

export const DEFAULT_TIMING: RunnerTiming = {
  firstTokenMs: FIRST_TOKEN_TIMEOUT_MS,
  lastProviderFirstTokenMs: LAST_PROVIDER_FIRST_TOKEN_TIMEOUT_MS,
  chunkIdleMs: CHUNK_IDLE_TIMEOUT_MS,
};

export interface ProviderCall {
  provider: ProviderName;
  model: string;
  outcome: StreamOutcome;
  /** null = completed; else why the call ended early. */
  failure: 'error' | 'slow' | 'idle' | 'aborted' | null;
  errorCode: string | null;
}

export type RunResult =
  | { status: 'completed'; provider: LlmProvider; outcome: StreamOutcome; calls: ProviderCall[] }
  /** Error after this provider's output produced a card: what was delivered stands. */
  | { status: 'failed_after_output'; provider: LlmProvider; calls: ProviderCall[] }
  /** Every provider down, failing or too slow before producing a card. */
  | { status: 'all_failed'; allDown: boolean; calls: ProviderCall[] }
  | { status: 'aborted'; calls: ProviderCall[] };

export interface RunOptions {
  /** Client disconnect. */
  signal: AbortSignal;
  health: ProviderHealth;
  timing: RunnerTiming;
  /** Feeds a chunk to the parser. */
  consume(chunk: string): void;
  /** True once the current provider's output has produced a delivered card (no fallback then). */
  committed(): boolean;
  /** Called before switching to the next provider: drop partial parser state. */
  restart(): void;
  onFallback?(from: ProviderName, to: ProviderName | null, reason: 'error' | 'slow' | 'idle'): void;
  onProviderError?(provider: ProviderName, code: string): void;
}

const TIMEOUT = Symbol('timeout');

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<typeof TIMEOUT>((resolve) => {
    id = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(id));
}

export async function runChain(
  providers: readonly LlmProvider[],
  prompt: LlmPrompt,
  opts: RunOptions,
): Promise<RunResult> {
  const calls: ProviderCall[] = [];
  const available: LlmProvider[] = [];
  for (const p of providers) {
    if (!(await opts.health.downUntil(p.name))) available.push(p);
  }
  if (available.length === 0) return { status: 'all_failed', allDown: true, calls };

  for (let i = 0; i < available.length; i++) {
    const provider = available[i]!;
    const next = available[i + 1] ?? null;
    if (opts.signal.aborted) return { status: 'aborted', calls };

    const local = new AbortController();
    const signal = AbortSignal.any([opts.signal, local.signal]);
    const stream = provider.stream(prompt, { signal });
    const call: ProviderCall = {
      provider: provider.name,
      model: provider.model,
      outcome: stream.outcome,
      failure: null,
      errorCode: null,
    };
    calls.push(call);
    const iterator = stream[Symbol.asyncIterator]();

    const giveUp = async (reason: 'error' | 'slow' | 'idle', code: string) => {
      local.abort();
      call.failure = reason;
      call.errorCode = code;
      opts.onProviderError?.(provider.name, code);
      await opts.health.recordFailure(provider.name).catch(() => null);
    };

    let first = true;
    try {
      for (;;) {
        const limit = first
          ? next
            ? opts.timing.firstTokenMs
            : opts.timing.lastProviderFirstTokenMs
          : opts.timing.chunkIdleMs;
        const pending = iterator.next();
        const result = await withTimeout(pending, limit);
        if (result === TIMEOUT) {
          // The pending next() rejects once aborted; nobody awaits it any more.
          pending.catch(() => {});
          const reason = first ? 'slow' : 'idle';
          await giveUp(reason, reason === 'slow' ? 'first_token_timeout' : 'idle_timeout');
          if (opts.committed()) return { status: 'failed_after_output', provider, calls };
          opts.onFallback?.(provider.name, next?.name ?? null, reason);
          opts.restart();
          break;
        }
        if (result.done) return { status: 'completed', provider, outcome: stream.outcome, calls };
        first = false;
        opts.consume(result.value);
      }
    } catch (err) {
      if (opts.signal.aborted) {
        call.failure = 'aborted';
        return { status: 'aborted', calls };
      }
      const code = err instanceof ProviderError ? err.code : 'unexpected';
      await giveUp('error', code);
      if (opts.committed()) return { status: 'failed_after_output', provider, calls };
      opts.onFallback?.(provider.name, next?.name ?? null, 'error');
      opts.restart();
    }
  }
  return { status: 'all_failed', allDown: false, calls };
}
