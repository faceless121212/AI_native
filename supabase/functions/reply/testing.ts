// Test setup for the reply function: in-memory store, fake providers, fast timeouts.
import { MemoryAnalytics } from '../_shared/analytics.ts';
import { withErrors } from '../_shared/http.ts';
import { FakeProvider } from '../_shared/llm/fake.ts';
import { MemoryProviderHealth } from '../_shared/llm/health.ts';
import type { LlmProvider } from '../_shared/llm/provider.ts';
import type { RunnerTiming } from '../_shared/llm/runner.ts';
import { CURRENT_AI_POLICY_VERSION } from '../_shared/policy.ts';
import { RateLimiter } from '../_shared/rate-limit.ts';
import { type ReplyRequest, SseEventPayloads, type SseEventName } from '../_shared/schemas.ts';
import { readSse } from '../_shared/sse.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, jsonRequest } from '../_shared/testing/helpers.ts';
import { handleReplyRoute, type LlmSetup, type ReplyDeps } from './handler.ts';

/** Short timeouts so slow-provider tests run in milliseconds. */
export const FAST_TIMING: RunnerTiming = {
  firstTokenMs: 80,
  lastProviderFirstTokenMs: 300,
  chunkIdleMs: 300,
};

export function setupReply(
  opts: {
    providers?: LlmProvider[];
    llm?: LlmSetup;
    store?: MemoryStore;
    rateLimiter?: RateLimiter;
  } = {},
) {
  const store = opts.store ?? new MemoryStore();
  const health = new MemoryProviderHealth();
  const analytics = new MemoryAnalytics();
  const providers = opts.providers ?? [new FakeProvider()];
  const deps: ReplyDeps = {
    auth: store,
    repo: store,
    llm: opts.llm ?? { ok: true, providers },
    health,
    rateLimiter: opts.rateLimiter ?? new RateLimiter(),
    analytics,
    timing: FAST_TIMING,
  };
  const handler = withErrors('reply', (req) => handleReplyRoute(req, deps));
  return { store, health, analytics, handler, deps, providers };
}

/** Signed in, 18+ confirmed, AI consent granted (with the 10 starter credits unless starter=false). */
export async function aiUser(
  store: MemoryStore,
  opts: { starter?: boolean; timezone?: string } = {},
) {
  const user = store.addUser();
  await store.patchProfile(user.userId, { ageConfirmed: true });
  if (opts.timezone) store.profiles.get(user.userId)!.timezone = opts.timezone;
  if (opts.starter === false) {
    store.consents.push({
      userId: user.userId,
      policyVersion: CURRENT_AI_POLICY_VERSION,
      grantedAt: new Date().toISOString(),
      withdrawnAt: null,
    });
  } else {
    await store.grantAiConsent(user.userId, CURRENT_AI_POLICY_VERSION);
  }
  return user;
}

export function replyBody(overrides: Partial<ReplyRequest> = {}): ReplyRequest {
  return {
    kind: 'reply',
    text: 'Hey, wie war dein Wochenende?',
    langHint: 'de',
    relationship: 'friend',
    closeness: 3,
    tone: 'warm',
    flirt: 'off',
    formality: 'casual',
    iAm: 'woman',
    theyAre: 'man',
    uiLang: 'en',
    source: 'keyboard',
    clientRequestId: crypto.randomUUID(),
    ...overrides,
  };
}

export function replyRequest(
  token: string,
  overrides: Partial<ReplyRequest> = {},
  init: { signal?: AbortSignal } = {},
) {
  const req = jsonRequest('POST', replyBody(overrides), bearer(token));
  return init.signal ? new Request(req, { signal: init.signal }) : req;
}

export interface SseEvent {
  event: SseEventName;
  data: Record<string, unknown>;
}

/** Reads the whole SSE body; every payload is validated against its zod schema. */
export async function readEvents(res: Response): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const msg of readSse(res.body!)) {
    const name = msg.event as SseEventName;
    const schema = SseEventPayloads[name];
    if (!schema) throw new Error(`unknown event ${msg.event}`);
    events.push({
      event: name,
      data: schema.parse(JSON.parse(msg.data)) as Record<string, unknown>,
    });
  }
  return events;
}

export function names(events: SseEvent[]): string[] {
  return events.map((e) => e.event);
}

export function cardTexts(events: SseEvent[]): string[] {
  return events.filter((e) => e.event === 'card').map((e) => String(e.data.text));
}

/** Waits until `check` is true (for work that finishes after the response, e.g. cancel). */
export async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
