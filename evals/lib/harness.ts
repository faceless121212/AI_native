// Runs eval cases through the real `reply` handler and pipeline IN-PROCESS (auth → consent → chips
// → redaction → prompt → quota → provider stream → line parser → post-check → SSE), with an
// in-memory store (supabase/functions/_shared/testing/memory-store.ts): no database, no real user
// data, nothing persisted. Each case gets a fresh test user with AI consent and 18+.
//
// Providers: `fake` (deterministic canned lines) or a live provider built by the same config code
// the Edge Function uses (_shared/llm/config.ts, APP_ENV=staging rules: unsafe SDK env refused,
// Bedrock EU-only), with keys read from this process's environment.
import { withErrors } from '../../supabase/functions/_shared/http.ts';
import {
  createProviders,
  type EnvReader,
  readLlmConfig,
} from '../../supabase/functions/_shared/llm/config.ts';
import { FakeProvider } from '../../supabase/functions/_shared/llm/fake.ts';
import { MemoryProviderHealth } from '../../supabase/functions/_shared/llm/health.ts';
import type {
  LiveProviderName,
  LlmProvider,
} from '../../supabase/functions/_shared/llm/provider.ts';
import { DEFAULT_TIMING } from '../../supabase/functions/_shared/llm/runner.ts';
import { CURRENT_AI_POLICY_VERSION } from '../../supabase/functions/_shared/policy.ts';
import { RateLimiter } from '../../supabase/functions/_shared/rate-limit.ts';
import { redact } from '../../supabase/functions/_shared/redact.ts';
import {
  type ReplyRequest,
  SseEventPayloads,
  type SseEventName,
} from '../../supabase/functions/_shared/schemas.ts';
import { readSse } from '../../supabase/functions/_shared/sse.ts';
import { MemoryStore } from '../../supabase/functions/_shared/testing/memory-store.ts';
import { handleReplyRoute, type ReplyDeps } from '../../supabase/functions/reply/handler.ts';
import type { EvalCase } from './cases.ts';

export const EVAL_PROVIDERS = ['fake', 'anthropic', 'bedrock', 'mistral'] as const;
export type EvalProvider = (typeof EVAL_PROVIDERS)[number];

export async function makeProviders(
  provider: EvalProvider,
  env: EnvReader,
): Promise<LlmProvider[]> {
  if (provider === 'fake') return [new FakeProvider()];
  const overrides: Record<string, string> = {
    APP_ENV: 'staging',
    LLM_MODE: 'live',
    LLM_PROVIDER_PRIMARY: provider satisfies LiveProviderName,
    LLM_PROVIDER_FALLBACK: '',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SB_REGION: '',
  };
  const config = readLlmConfig((name) => overrides[name] ?? env(name));
  if (!config.ok) {
    // Names only, never values.
    throw new Error(
      `Provider config refused: ${config.code}${config.detail ? ` (${config.detail})` : ''}`,
    );
  }
  return await createProviders(config.config);
}

export interface CaseRun {
  /** Request text actually sent (with the fake marker, if any). */
  sentText: string;
  /** What the prompt saw after redaction (for the placeholder check). */
  redactedText: string;
  httpStatus: number;
  errorCode: string | null;
  cards: { index: number; variant: string; text: string }[];
  meta: { lang: string; crisis: boolean; refused: boolean } | null;
  /** All meta events (the pipeline may upgrade crisis with a second one). */
  metas: { crisis: boolean; refused: boolean }[];
  done: boolean;
  /** Wall clock from request to first card / to end of stream. */
  msFirstCard: number | null;
  msTotal: number;
  tokensIn: number;
  tokensOut: number;
  costMicroEur: number;
  status: string | null;
  refunded: boolean;
  safetyFlags: string[];
  crisisCounted: boolean;
  /** Pipeline log events of this request (codes only, never text). */
  logEvents: Record<string, unknown>[];
  /** JSON of everything the store kept about this request, for the no-text check. */
  storedJson: string;
}

export class Harness {
  private readonly store = new MemoryStore();
  private readonly deps: ReplyDeps;
  private readonly handler: (req: Request) => Promise<Response>;

  constructor(
    providers: readonly LlmProvider[],
    private readonly provider: EvalProvider,
  ) {
    this.store.rateLimit = 1000;
    this.deps = {
      auth: this.store,
      repo: this.store,
      llm: { ok: true, providers },
      health: new MemoryProviderHealth(),
      rateLimiter: new RateLimiter(1000),
      timing: DEFAULT_TIMING,
    };
    this.handler = withErrors('reply', (req) => handleReplyRoute(req, this.deps));
  }

  async run(c: EvalCase): Promise<CaseRun> {
    const user = this.store.addUser();
    await this.store.patchProfile(user.userId, { ageConfirmed: true });
    await this.store.grantAiConsent(user.userId, CURRENT_AI_POLICY_VERSION);

    const scenario = this.provider === 'fake' ? (c.fake ?? 'metafirst') : null;
    const sentText = scenario ? `${c.text} [[fake:${scenario}]]` : c.text;
    const body: ReplyRequest = {
      kind: c.kind,
      text: sentText,
      langHint: c.lang,
      relationship: c.chips.relationship,
      closeness: c.chips.closeness,
      tone: c.chips.tone,
      flirt: c.chips.flirt,
      formality: c.chips.formality,
      iAm: c.chips.iAm,
      theyAre: c.chips.theyAre,
      uiLang: c.chips.uiLang,
      source: 'app',
      clientRequestId: crypto.randomUUID(),
    };

    const logEvents: Record<string, unknown>[] = [];
    const originals = { info: console.info, error: console.error };
    const capture = (...args: unknown[]) => {
      for (const a of args) {
        try {
          const parsed = typeof a === 'string' ? JSON.parse(a) : null;
          if (parsed && typeof parsed === 'object') logEvents.push(parsed);
        } catch {
          // not a structured log line
        }
      }
    };
    console.info = capture;
    console.error = capture;

    const crisisBefore = [...this.store.crisisDaily.values()].reduce((a, b) => a + b, 0);
    const started = performance.now();
    let msFirstCard: number | null = null;
    const run: CaseRun = {
      sentText,
      redactedText: redact(c.text).text,
      httpStatus: 0,
      errorCode: null,
      cards: [],
      meta: null,
      metas: [],
      done: false,
      msFirstCard: null,
      msTotal: 0,
      tokensIn: 0,
      tokensOut: 0,
      costMicroEur: 0,
      status: null,
      refunded: false,
      safetyFlags: [],
      crisisCounted: false,
      logEvents,
      storedJson: '',
    };
    try {
      const res = await this.handler(
        new Request('http://localhost/reply', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` },
          body: JSON.stringify(body),
        }),
      );
      run.httpStatus = res.status;
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        run.errorCode = err.error ?? `http_${res.status}`;
      } else {
        for await (const msg of readSse(res.body)) {
          const name = msg.event as SseEventName;
          const schema = SseEventPayloads[name];
          if (!schema) continue;
          const data = schema.parse(JSON.parse(msg.data)) as Record<string, unknown>;
          if (name === 'card') {
            msFirstCard ??= performance.now() - started;
            run.cards.push({
              index: Number(data.index),
              variant: String(data.variant),
              text: String(data.text),
            });
          } else if (name === 'meta') {
            const m = {
              lang: String(data.lang),
              crisis: Boolean(data.crisis),
              refused: Boolean(data.refused),
            };
            run.metas.push(m);
            run.meta = {
              lang: m.lang,
              crisis: (run.meta?.crisis ?? false) || m.crisis,
              refused: (run.meta?.refused ?? false) || m.refused,
            };
          } else if (name === 'done') run.done = true;
          else if (name === 'error') run.errorCode = String(data.error);
        }
      }
    } finally {
      run.msTotal = performance.now() - started;
      run.msFirstCard = msFirstCard;
      // Post-stream work (finish row, crisis count) runs in the same promise chain; give it a tick.
      await new Promise((r) => setTimeout(r, 0));
      console.info = originals.info;
      console.error = originals.error;
    }

    const stored = [...this.store.requests.values()].find((r) => r.userId === user.userId);
    if (stored) {
      run.status = stored.finish?.status ?? stored.status;
      run.tokensIn = stored.finish?.tokensIn ?? 0;
      run.tokensOut = stored.finish?.tokensOut ?? 0;
      run.costMicroEur = stored.finish?.costMicroEur ?? 0;
      run.refunded = stored.refundedAt !== null;
      run.safetyFlags = [...(stored.finish?.safetyFlags ?? [])];
    }
    const crisisAfter = [...this.store.crisisDaily.values()].reduce((a, b) => a + b, 0);
    run.crisisCounted = crisisAfter > crisisBefore;
    run.storedJson = JSON.stringify({
      request: stored ?? null,
      credits: this.store.credits.filter((x) => x.userId === user.userId),
      crisisDaily: [...this.store.crisisDaily.entries()],
    });
    return run;
  }
}
