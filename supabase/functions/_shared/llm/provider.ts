// LLM provider interface (backend rules: `{ stream(prompt, opts): AsyncIterable<string>; name; model }`).
// Only the `reply` Edge Function uses providers. A provider yields raw text deltas; the reply
// pipeline parses lines. After the iterator finishes (or is stopped), `outcome` holds token usage
// and why the model stopped. Nothing here may log or carry message text: ProviderError keeps only
// a kind and an HTTP status, never the provider's error message (it can echo input).
import type { Lang, ReplyKind } from '../schemas.ts';

export const PROVIDER_NAMES = ['bedrock', 'mistral', 'anthropic', 'fake'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** Providers that can be configured with LLM_PROVIDER_PRIMARY / LLM_PROVIDER_FALLBACK. */
export const LIVE_PROVIDER_NAMES = ['bedrock', 'mistral', 'anthropic'] as const;
export type LiveProviderName = (typeof LIVE_PROVIDER_NAMES)[number];

export interface LlmPrompt {
  system: string;
  /** The user turn: settings + the (redacted) message wrapped as data. */
  user: string;
  maxTokens: number;
  /** Not sent to real models; lets the fake provider answer in the right language and format. */
  kind: ReplyKind;
  lang: Lang;
  formality: 'casual' | 'formal';
}

export interface StreamOptions {
  /** Aborts the HTTP call (client disconnect, first-token timeout, fallback). */
  signal: AbortSignal;
}

/** 'end' = normal end; 'max_tokens' = cut off (last line incomplete); 'refusal' = provider-side refusal. */
export type StopKind = 'end' | 'max_tokens' | 'refusal' | 'other';

export interface StreamOutcome {
  tokensIn: number;
  tokensOut: number;
  stop: StopKind | null;
  /** Provider refusal category code (e.g. Anthropic stop_details.category); never explanation text. */
  refusalCategory: string | null;
}

export interface ProviderStream extends AsyncIterable<string> {
  /** Filled while streaming; final after iteration ends. */
  readonly outcome: StreamOutcome;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream;
}

export type ProviderErrorKind =
  | 'auth' // 401/403: key or IAM wrong
  | 'rate' // 429 from the provider
  | 'bad_request' // 400/404/413/422: our request or model ID is wrong
  | 'server' // 5xx, 529 overloaded
  | 'network' // connection failed
  | 'timeout' // provider-side timeout
  | 'aborted' // we aborted (disconnect, fallback)
  | 'protocol'; // unexpected stream content

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderName,
    readonly kind: ProviderErrorKind,
    readonly status: number | null = null,
  ) {
    super(`Provider ${provider} failed: ${kind}${status === null ? '' : ` (${status})`}`);
    this.name = 'ProviderError';
  }

  /** Short code for logs: kind and status only. */
  get code(): string {
    return this.status === null ? this.kind : `${this.kind}_${this.status}`;
  }
}

export function kindFromStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'server';
  return 'bad_request';
}

export function emptyOutcome(): StreamOutcome {
  return { tokensIn: 0, tokensOut: 0, stop: null, refusalCategory: null };
}
