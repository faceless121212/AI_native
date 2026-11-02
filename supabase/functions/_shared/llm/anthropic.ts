// Direct Claude API (api.anthropic.com) via the official SDK. Development and staging only: the
// direct API has no EU-only processing option (inference_geo is "global" or "us"), so config.ts
// refuses it in production unless ALLOW_NON_EU_PROVIDER=true (docs/processors.md).
import Anthropic from '@anthropic-ai/sdk';
import { claudeParams, claudeStream } from './claude.ts';
import type { LlmPrompt, LlmProvider, ProviderStream, StreamOptions } from './provider.ts';
import { PROVIDER_REQUEST_TIMEOUT_MS } from './settings.ts';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Tests inject canned HTTP responses. */
  fetch?: typeof fetch;
  baseURL?: string;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      // The pipeline falls back instead; SDK retries would blow the first-token budget.
      maxRetries: 0,
      timeout: PROVIDER_REQUEST_TIMEOUT_MS,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
  }

  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream {
    return claudeStream(this.name, this.client, claudeParams(this.model, prompt), opts);
  }
}
