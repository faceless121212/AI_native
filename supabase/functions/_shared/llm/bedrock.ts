// Claude on Amazon Bedrock through the EU cross-region inference profile (model ID starts with
// "eu.", source region BEDROCK_REGION = eu-central-1). Uses the official Bedrock SDK, which calls
// InvokeModelWithResponseStream (`/model/<id>/invoke-with-response-stream`) with SigV4 and
// decodes the AWS event stream into the same MessageStream events as the direct API.
// Not runnable from this environment (no AWS keys); tested against canned event-stream bytes.
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { claudeParams, type ClaudeMessagesClient, claudeStream } from './claude.ts';
import type { LlmPrompt, LlmProvider, ProviderStream, StreamOptions } from './provider.ts';
import { PROVIDER_REQUEST_TIMEOUT_MS } from './settings.ts';
import { SILENT_LOGGER } from './sdk-logging.ts';

/** Fixed per region: never taken from ANTHROPIC_BEDROCK_BASE_URL. */
export function bedrockBaseUrl(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com`;
}

export interface BedrockProviderOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** EU inference profile ID, from BEDROCK_MODEL_ID. */
  model: string;
  fetch?: typeof fetch;
}

export class BedrockProvider implements LlmProvider {
  readonly name = 'bedrock' as const;
  readonly model: string;
  private readonly client: ClaudeMessagesClient;

  constructor(opts: BedrockProviderOptions) {
    this.model = opts.model;
    this.client = new AnthropicBedrock({
      awsRegion: opts.region,
      baseURL: bedrockBaseUrl(opts.region),
      logLevel: 'off',
      logger: SILENT_LOGGER,
      awsAccessKey: opts.accessKeyId,
      awsSecretKey: opts.secretAccessKey,
      // Never pick up AWS_BEARER_TOKEN_BEDROCK or a credential chain from the environment.
      apiKey: null,
      maxRetries: 0,
      timeout: PROVIDER_REQUEST_TIMEOUT_MS,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream {
    return claudeStream(this.name, this.client, claudeParams(this.model, prompt), opts);
  }
}
