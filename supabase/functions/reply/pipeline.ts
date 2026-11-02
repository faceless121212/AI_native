// The streaming part of `reply` (architecture §7 steps 8–11), after the request was authorised
// and charged. Produces the SSE body:
//   card* / meta (as they arrive) → quota → done        on success
//   [meta] → quota → error                              when no card could be sent (refunded),
//                                                       or AI was turned off mid-request
// Cards are post-checked and flushed as soon as their line is complete. Fewer than 2 surviving
// cards → one retry. Before a retry or a fallback, consent (and the device key) is checked again.
// Client disconnect aborts the provider call. Generation is wrapped so that, whatever throws, the
// refund (no card sent), the closing events and the request metadata still happen; on Supabase
// the work is registered with EdgeRuntime.waitUntil so it survives the client going away. A
// pg_cron sweeper refunds rows that still end up 'started'. Never any text in logs or rows.
import type { Analytics } from '../_shared/analytics.ts';
import { costMicroEur } from '../_shared/cost.ts';
import type { ProviderHealth } from '../_shared/llm/health.ts';
import { LineParser, type ModelMeta, type ParsedItem } from '../_shared/llm/lines.ts';
import type { LlmPrompt, LlmProvider, StopKind } from '../_shared/llm/provider.ts';
import {
  type ProviderCall,
  runChain,
  type RunnerTiming,
  type RunResult,
} from '../_shared/llm/runner.ts';
import { logError, logEvent } from '../_shared/log.ts';
import { postCheckCard } from '../_shared/postcheck.ts';
import type { QuotaSnapshot, ReplyRepo, RequestStatus, StoredSafetyFlag } from '../_shared/repo.ts';
import {
  type CardEvent,
  type ErrorCode,
  LANGS,
  type Lang,
  type LangHint,
  type MetaEvent,
  type QuotaEvent,
  type RequestSource,
  type SseEventName,
  SseEventPayloads,
} from '../_shared/schemas.ts';
import { formatSse } from '../_shared/sse.ts';

const FN = 'reply';

export interface PipelineDeps {
  providers: readonly LlmProvider[];
  health: ProviderHealth;
  repo: ReplyRepo;
  analytics: Analytics;
  timing: RunnerTiming;
  now: () => number;
  /** EdgeRuntime.waitUntil on Supabase: keeps the worker alive for the post-stream work. */
  waitUntil?: (work: Promise<unknown>) => void;
}

export interface PipelineInput {
  requestId: string;
  userId: string;
  /** Set for keyboard requests (device key auth): re-checked before a retry or fallback. */
  deviceKeyId: string | null;
  prompt: LlmPrompt;
  promptVersion: string;
  /** Language the cards should be in until META says otherwise. */
  expectedLang: Lang;
  quota: QuotaSnapshot;
  /** Flags known before the call (redacted, flirt_forced_off). */
  flags: Set<StoredSafetyFlag>;
  /**
   * Deterministic crisis check of the redacted input (_shared/crisis.ts). Only used to set
   * meta.crisis when the model's META is missing, the provider refused, or the stream ended
   * early. Never stored, logged or sent to analytics.
   */
  crisisBackstop: boolean;
  /** For the anonymous crisis_daily count only. */
  source: RequestSource;
  /** Request arrival, for ms_first / ms_total. */
  startedAt: number;
}

function toQuotaEvent(q: QuotaSnapshot): QuotaEvent {
  return { plan: q.plan, leftToday: q.leftToday, resetAt: q.resetAt, fairUseLeft: q.fairUseLeft };
}

export function replyStream(
  input: PipelineInput,
  deps: PipelineDeps,
  clientSignal: AbortSignal,
): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  clientSignal.addEventListener('abort', onClientAbort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send: Send = (event, data) => {
        if (closed || abort.signal.aborted) return false;
        // Contract check: a payload that doesn't match the schema is a bug and is never sent.
        // Never throws, so refund and metadata logging always run.
        const payload = SseEventPayloads[event].safeParse(data);
        if (!payload.success) {
          logEvent(FN, 'contract_violation', { event });
          return false;
        }
        try {
          controller.enqueue(encoder.encode(formatSse(event, payload.data)));
          return true;
        } catch {
          return false;
        }
      };
      const work = run(input, deps, abort.signal, send)
        .catch((err) => logError(FN, 'pipeline', err))
        .finally(() => {
          clientSignal.removeEventListener('abort', onClientAbort);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already cancelled by the client
            }
          }
        });
      deps.waitUntil?.(work);
      return work;
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
}

type Send = (event: SseEventName, data: unknown) => boolean;

async function run(input: PipelineInput, deps: PipelineDeps, signal: AbortSignal, send: Send) {
  const { prompt, requestId } = input;
  const kind = prompt.kind;
  const wanted = kind === 'reply' ? 3 : 2;
  const flags = new Set(input.flags);

  const delivered = new Map<number, CardEvent>();
  let meta: ModelMeta | null = null;
  let metaSent = false;
  let crisisSent = false;
  let firstCardAt: number | null = null;
  let deliveredThisProvider = 0;
  let dropped = 0;
  let invalid = 0;
  let parser = new LineParser(kind);
  const calls: ProviderCall[] = [];
  let lastResult: RunResult | null = null;
  let lastStop: StopKind | null = null;
  let providerRefused = false;
  let fallbackUsed = false;
  let stoppedAiOff = false;
  let internalError = false;
  let currentProvider: LlmProvider['name'] = deps.providers[0]?.name ?? 'fake';

  const modelMeta = (): ModelMeta | null => meta;
  const expectedLang = (): Lang => {
    const lang = modelMeta()?.lang;
    return lang && (LANGS as readonly string[]).includes(lang)
      ? (lang as Lang)
      : input.expectedLang;
  };
  const sendMeta = (crisis: boolean, refused: boolean) => {
    const event: MetaEvent = {
      requestId,
      lang: (modelMeta()?.lang ?? expectedLang()) as LangHint,
      crisis,
      refused,
    };
    if (send('meta', event)) {
      metaSent = true;
      crisisSent ||= crisis;
    }
  };

  const stillAllowed = async (): Promise<boolean> => {
    try {
      return await deps.repo.stillAllowed(input.userId, input.deviceKeyId);
    } catch (err) {
      logError(FN, 'still_allowed', err);
      return false; // fail closed
    }
  };

  const handle = (items: ParsedItem[]) => {
    for (const item of items) {
      if (item.type === 'invalid') {
        invalid++;
        continue;
      }
      if (item.type === 'meta') {
        if (metaSent) continue;
        meta = item.meta;
        sendMeta(item.meta.crisis, item.meta.refused);
        continue;
      }
      let index: number;
      let variant: CardEvent['variant'];
      if (kind === 'reply') {
        if (delivered.size >= 3) continue;
        index = delivered.size;
        variant = 'reply';
      } else {
        index = item.tag === 'L' ? 0 : 1;
        variant = item.tag === 'L' ? 'light' : 'rewrite';
        if (delivered.has(index)) continue;
      }
      const checked = postCheckCard(item.text, expectedLang());
      if (!checked.ok) {
        dropped++;
        flags.add('card_dropped');
        logEvent(FN, 'card_dropped', { reason: checked.reason });
        continue;
      }
      const card: CardEvent = { index, variant, text: checked.text };
      if (!send('card', card)) continue;
      delivered.set(index, card);
      deliveredThisProvider++;
      if (firstCardAt === null) {
        firstCardAt = deps.now();
        deps.analytics.track(input.userId, {
          name: 'reply_shown',
          props: { latency_ms: firstCardAt - input.startedAt, provider: currentProvider },
        });
      }
    }
  };

  // ---- generation (anything thrown here still gets the finalisation below)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0 && !(await stillAllowed())) {
        stoppedAiOff = true;
        break;
      }
      parser = new LineParser(kind);
      deliveredThisProvider = 0;
      const result = await runChain(deps.providers, prompt, {
        signal,
        health: deps.health,
        timing: deps.timing,
        consume: (chunk) => handle(parser.push(chunk)),
        committed: () => deliveredThisProvider > 0,
        restart: () => {
          parser = new LineParser(kind);
        },
        mayContinue: stillAllowed,
        onFallback: (from, to, reason) => {
          if (!to) return;
          fallbackUsed = true;
          currentProvider = to;
          deps.analytics.track(input.userId, { name: 'provider_fallback', props: { from, to } });
          logEvent(FN, 'provider_fallback', { from, to, reason });
        },
        onProviderError: (provider, code) => logEvent(FN, 'provider_error', { provider, code }),
      });
      calls.push(...result.calls);
      lastResult = result;

      if (result.status === 'stopped') {
        stoppedAiOff = true;
        break;
      }
      if (result.status === 'consumer_failed') {
        internalError = true;
        break;
      }
      if (result.status !== 'completed') break;

      currentProvider = result.provider.name;
      const stop = result.outcome.stop;
      lastStop = stop;
      handle(parser.end(stop === 'end' ? 'complete' : 'truncated'));
      if (stop === 'refusal') {
        providerRefused = true;
        logEvent(FN, 'provider_refusal', {
          provider: result.provider.name,
          category: result.outcome.refusalCategory,
        });
        break;
      }
      if (modelMeta()?.refused) break;
      if (delivered.size >= 2) break;
      if (attempt === 0) logEvent(FN, 'retry', { cards: delivered.size, dropped, invalid });
    }
  } catch (err) {
    internalError = true;
    logError(FN, 'generate', err);
  }

  // ---- finalisation: never throws
  const refused = providerRefused || (modelMeta()?.refused ?? false);
  let status: RequestStatus;
  let errorCode: ErrorCode | null = null;
  if (signal.aborted) status = 'cancelled';
  else if (stoppedAiOff) {
    status = delivered.size > 0 ? 'partial' : 'error';
    errorCode = 'ai_off';
  } else if (refused) status = 'refused';
  else if (delivered.size === 0) {
    status = 'error';
    errorCode =
      !internalError &&
      (lastResult?.status === 'all_failed' || lastResult?.status === 'failed_after_output')
        ? 'provider_down'
        : 'internal';
  } else status = delivered.size >= wanted ? 'ok' : 'partial';

  if (refused) flags.add('refused');

  // Crisis backstop: only when the model's own signal is missing or the answer was cut short.
  const endedEarly =
    internalError ||
    stoppedAiOff ||
    lastResult?.status !== 'completed' ||
    (lastStop !== null && lastStop !== 'end');
  const backstop = input.crisisBackstop && (!metaSent || providerRefused || endedEarly);
  if (status !== 'cancelled') {
    if (!metaSent && (refused || backstop)) sendMeta(backstop, refused);
    else if (metaSent && backstop && !crisisSent) sendMeta(true, refused); // upgrade only
  }

  // Refund when nothing reached the user: failure, AI turned off, cancel, or a refusal (provider
  // or model) before the first card (user decision: refusals are refunded).
  let quota = input.quota;
  if (
    delivered.size === 0 &&
    (status === 'error' || status === 'cancelled' || status === 'refused')
  ) {
    try {
      const refund = await deps.repo.refundReply(requestId);
      if (refund.status === 'ok' && refund.quota) quota = refund.quota;
      logEvent(FN, 'refunded', { status: refund.status });
    } catch (err) {
      logError(FN, 'refund', err);
    }
  }

  if (errorCode !== null) {
    send('quota', toQuotaEvent(quota));
    send('error', {
      error: errorCode,
      message:
        errorCode === 'provider_down'
          ? 'AI replies are having trouble. Try again in a minute.'
          : errorCode === 'ai_off'
            ? 'AI replies are off. Turn them on in the Replywise app.'
            : 'No usable replies this time. Try again.',
    });
  } else if (status !== 'cancelled') {
    send('quota', toQuotaEvent(quota));
    send('done', { requestId, cards: delivered.size });
  }

  // ---- metadata (never text)
  const tokensIn = calls.reduce((sum, c) => sum + c.outcome.tokensIn, 0);
  const tokensOut = calls.reduce((sum, c) => sum + c.outcome.tokensOut, 0);
  let cost = 0;
  let costUnknown = false;
  for (const c of calls) {
    const micro = costMicroEur(c.provider, c.model, c.outcome.tokensIn, c.outcome.tokensOut);
    if (micro === null) costUnknown = true;
    else cost += micro;
  }
  const finalCall = calls.at(-1) ?? null;
  const msTotal = deps.now() - input.startedAt;
  const msFirst = firstCardAt === null ? null : firstCardAt - input.startedAt;
  const storedFlags = [...flags];
  const lang: LangHint | null = modelMeta()?.lang ?? (delivered.size > 0 ? expectedLang() : null);

  try {
    await deps.repo.finishRequest(requestId, {
      status,
      lang,
      provider: finalCall?.provider ?? null,
      model: finalCall?.model ?? null,
      promptVersion: input.promptVersion,
      tokensIn,
      tokensOut,
      costMicroEur: cost,
      msFirst,
      msTotal,
      safetyFlags: storedFlags,
      cards: delivered.size,
      deliveredCards: [...delivered.keys()].sort((a, b) => a - b),
    });
  } catch (err) {
    logError(FN, 'finish', err);
  }

  // Crisis: one anonymous +1 per request whose meta.crisis reached the client (model or backstop).
  // Day, language and source only; no user, no request ID (crisis_daily).
  if (crisisSent) {
    try {
      await deps.repo.recordCrisis((modelMeta()?.lang ?? expectedLang()) as LangHint, input.source);
    } catch (err) {
      logError(FN, 'crisis_count', err);
    }
  }

  // Anonymous aggregate only: never keyed by the user (privacy review).
  for (const type of storedFlags) {
    deps.analytics.trackAnonymous({ name: 'safety_flag', props: { type } });
  }
  logEvent(FN, 'done', {
    status,
    provider: finalCall?.provider ?? null,
    model: finalCall?.model ?? null,
    calls: calls.length,
    fallback: fallbackUsed,
    cards: delivered.size,
    dropped,
    invalid,
    ms_first: msFirst,
    ms_total: msTotal,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_micro_eur: cost,
    cost_unknown: costUnknown,
  });
}
