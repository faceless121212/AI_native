// Direct Claude API (api.anthropic.com) via the official SDK. Development and staging only: the
// direct API has no EU-only processing option (inference_geo is "global" or "us"), so config.ts
// always refuses it in production (docs/processors.md).
import Anthropic from '@anthropic-ai/sdk';
import { claudeParams, claudeStream } from './claude.ts';
import type { LlmPrompt, LlmProvider, ProviderStream, StreamOptions } from './provider.ts';
import { PROVIDER_REQUEST_TIMEOUT_MS } from './settings.ts';
import { SILENT_LOGGER } from './sdk-logging.ts';

/** Fixed: never taken from ANTHROPIC_BASE_URL (config.ts refuses that variable outside local). */
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Tests inject canned HTTP responses. */
  fetch?: typeof fetch;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      // Explicit, so ANTHROPIC_AUTH_TOKEN from the environment is never picked up.
      authToken: null,
      baseURL: ANTHROPIC_BASE_URL,
      // The SDK logs request details at debug level (ANTHROPIC_LOG): never.
      logLevel: 'off',
      logger: SILENT_LOGGER,
      // The pipeline falls back instead; SDK retries would blow the first-token budget.
      maxRetries: 0,
      timeout: PROVIDER_REQUEST_TIMEOUT_MS,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream {
    return claudeStream(this.name, this.client, claudeParams(this.model, prompt), opts);
  }
}
