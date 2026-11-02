// POST /reply        ReplyRequest → SSE (card, meta, quota, done | error)   Supabase JWT or device key
// POST /reply/event  ReplyFeedbackRequest → {recorded}                      Supabase JWT or device key
//
// Order (architecture §7): config → auth (401) → body (400) → consent + age (403 ai_off) →
// rate limit (429 rate) → providers available (503) → chips, redaction, prompt (pure, before
// charging so nothing can fail between charge and stream) → consume_reply (402 quota_empty,
// 429 fair_use/rate) → stream. Request text is never logged or stored.
import { type Analytics, noAnalytics } from '../_shared/analytics.ts';
import { authenticate, type AuthDeps } from '../_shared/auth.ts';
import { validateChips } from '../_shared/chips.ts';
import { looksLikeCrisis } from '../_shared/crisis.ts';
import { HttpError, httpError, jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import { readJson } from '../_shared/http.ts';
import type { ConfigErrorCode } from '../_shared/llm/config.ts';
import type { ProviderHealth } from '../_shared/llm/health.ts';
import type { LlmProvider } from '../_shared/llm/provider.ts';
import { DEFAULT_TIMING, type RunnerTiming } from '../_shared/llm/runner.ts';
import { logEvent } from '../_shared/log.ts';
import { buildPrompt, PROMPT_VERSION, randomTag, targetLang } from '../_shared/prompts/index.ts';
import type { RateLimiter } from '../_shared/rate-limit.ts';
import { redact } from '../_shared/redact.ts';
import type { ReplyRepo, StoredSafetyFlag } from '../_shared/repo.ts';
import {
  ReplyFeedbackRequest,
  type ReplyFeedbackResponse,
  ReplyRequest,
} from '../_shared/schemas.ts';
import { replyStream } from './pipeline.ts';

const FN = 'reply';

export type LlmSetup =
  | {
      ok: true;
      providers: readonly LlmProvider[];
      /** False when production runs outside eu-central-1 (config.ts regionAllowed) → 503. */
      regionOk?: boolean;
    }
  | { ok: false; code: ConfigErrorCode; detail: string | null };

export interface ReplyDeps {
  auth: AuthDeps;
  repo: ReplyRepo;
  llm: LlmSetup;
  health: ProviderHealth;
  rateLimiter: RateLimiter;
  analytics?: Analytics;
  timing?: RunnerTiming;
  now?: () => number;
  promptTag?: () => string;
  /** EdgeRuntime.waitUntil when running on Supabase. */
  waitUntil?: (work: Promise<unknown>) => void;
}

export function handleReplyRoute(req: Request, deps: ReplyDeps): Promise<Response> {
  const path = new URL(req.url).pathname;
  return /(?:^|\/)event\/?$/.test(path) ? handleReplyEvent(req, deps) : handleReply(req, deps);
}

function retryAfter(code: 'rate' | 'provider_down', message: string, seconds: number): HttpError {
  return new HttpError(code, message, { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) });
}

export async function handleReply(req: Request, deps: ReplyDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const analytics = deps.analytics ?? noAnalytics;

  if (!deps.llm.ok) {
    // Refuse to serve with an unsafe or incomplete provider setup. Codes and names only.
    logEvent(FN, 'config_error', { code: deps.llm.code, detail: deps.llm.detail });
    throw httpError('internal', 'The AI service is not configured.');
  }
  const providers = deps.llm.providers;
  if (deps.llm.regionOk === false) {
    // Production must run in Frankfurt; refuse rather than process elsewhere.
    logEvent(FN, 'wrong_region');
    throw new HttpError('provider_down', 'AI replies are having trouble. Try again in a minute.');
  }
  if (req.method !== 'POST') throw methodNotAllowed(['POST']);

  const { userId, method, deviceKeyId } = await authenticate(req, deps.auth, {
    allow: ['jwt', 'device'],
  });
  const body = await readJson(req, ReplyRequest);

  if (!(await deps.repo.checkAiAllowed(userId))) {
    throw httpError('ai_off', 'AI replies are off. Turn them on in the Replywise app.');
  }

  const wait = deps.rateLimiter.hit(userId);
  if (wait > 0) throw retryAfter('rate', 'Too many requests. Wait a moment.', wait);

  // Nobody to answer: refuse before charging.
  const downUntil = await Promise.all(providers.map((p) => deps.health.downUntil(p.name)));
  if (downUntil.every((d) => d !== null)) {
    const soonest = Math.min(...downUntil.map((d) => d!.getTime()));
    throw retryAfter(
      'provider_down',
      'AI replies are having trouble. Try again in a minute.',
      (soonest - now()) / 1000,
    );
  }

  // Pure preparation (can't fail after the charge).
  const flags = new Set<StoredSafetyFlag>();
  const chips = validateChips(body);
  if (chips.forced) flags.add('flirt_forced_off');
  const redacted = redact(body.text);
  if (redacted.total > 0) flags.add('redacted');
  const prompt = buildPrompt(
    {
      kind: body.kind,
      text: redacted.text,
      langHint: body.langHint,
      uiLang: body.uiLang,
      relationship: body.relationship,
      closeness: body.closeness,
      tone: chips.tone,
      flirt: chips.flirt,
      formality: body.formality,
      iAm: body.iAm,
      theyAre: body.theyAre,
    },
    (deps.promptTag ?? randomTag)(),
  );

  const consumed = await deps.repo.consumeReply(userId, {
    kind: body.kind,
    source: body.source,
    tone: chips.tone,
    relationship: body.relationship,
    closeness: body.closeness,
    formality: body.formality,
    flirt: chips.flirt,
    safetyFlags: [...flags],
  });
  switch (consumed.status) {
    case 'ai_off':
    case 'no_profile':
      throw httpError('ai_off', 'AI replies are off. Turn them on in the Replywise app.');
    case 'rate':
      throw retryAfter('rate', 'Too many requests. Wait a moment.', consumed.retryAfter);
    case 'quota_empty':
      analytics.track(userId, { name: 'quota_hit', props: { plan: consumed.quota.plan } });
      throw httpError('quota_empty', 'Out of free replies. More tomorrow.');
    case 'fair_use':
      analytics.track(userId, { name: 'quota_hit', props: { plan: consumed.quota.plan } });
      throw httpError('fair_use', 'Daily limit reached. Back tomorrow.');
    case 'ok':
      break;
  }

  analytics.track(userId, {
    name: 'reply_requested',
    props: {
      kind: body.kind,
      lang: body.langHint,
      tone: chips.tone,
      relationship: body.relationship,
      closeness: body.closeness,
      formality: body.formality,
      source: body.source,
    },
  });
  logEvent(FN, 'accepted', {
    kind: body.kind,
    source: body.source,
    auth: method,
    lang_hint: body.langHint,
    redactions: redacted.total,
    chips_forced: chips.forced,
  });

  const stream = replyStream(
    {
      requestId: consumed.requestId,
      userId,
      deviceKeyId,
      prompt,
      promptVersion: PROMPT_VERSION,
      expectedLang: targetLang(body.langHint, body.uiLang),
      quota: consumed.quota,
      flags,
      crisisBackstop: looksLikeCrisis(redacted.text),
      inputChars: Array.from(redacted.text).length,
      source: body.source,
      startedAt,
    },
    {
      providers,
      health: deps.health,
      repo: deps.repo,
      analytics,
      timing: deps.timing ?? DEFAULT_TIMING,
      now,
      ...(deps.waitUntil ? { waitUntil: deps.waitUntil } : {}),
    },
    req.signal,
  );

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': consumed.requestId,
    },
  });
}

export async function handleReplyEvent(req: Request, deps: ReplyDeps): Promise<Response> {
  if (req.method !== 'POST') throw methodNotAllowed(['POST']);
  const { userId } = await authenticate(req, deps.auth, { allow: ['jwt', 'device'] });
  const body = await readJson(req, ReplyFeedbackRequest);
  const result = await deps.repo.recordReplyEvent(
    userId,
    body.requestId,
    body.cardIndex,
    body.type,
  );
  if (result === 'not_found') throw httpError('not_found', 'Request or card not found.');
  if (result === 'ok') {
    const analytics = deps.analytics ?? noAnalytics;
    if (body.type === 'inserted') {
      analytics.track(userId, { name: 'reply_inserted', props: { card_index: body.cardIndex } });
    } else {
      analytics.track(userId, { name: 'reply_feedback', props: { rating: body.type } });
    }
  }
  logEvent(FN, 'event', { type: body.type, result });
  const response: ReplyFeedbackResponse = { recorded: result === 'ok' };
  return jsonResponse(response);
}
