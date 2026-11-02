// Mistral AI La Plateforme (EU), streaming chat completions over HTTPS:
// POST https://api.mistral.ai/v1/chat/completions {stream: true} → SSE `data: {chunk}` … `data: [DONE]`.
// Not runnable from this environment (no key); tested against canned SSE responses.
import { z } from 'zod';
import { readSse } from '../sse.ts';
import {
  emptyOutcome,
  kindFromStatus,
  type LlmPrompt,
  type LlmProvider,
  ProviderError,
  type ProviderStream,
  type StopKind,
  type StreamOptions,
} from './provider.ts';
import { MISTRAL_SETTINGS, PROVIDER_REQUEST_TIMEOUT_MS } from './settings.ts';

export const MISTRAL_BASE_URL = 'https://api.mistral.ai';

export interface MistralProviderOptions {
  apiKey: string;
  /** From MISTRAL_MODEL. */
  model: string;
  fetch?: typeof fetch;
}

const Content = z.union([
  z.string(),
  z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()),
]);

const Chunk = z
  .object({
    choices: z
      .array(
        z
          .object({
            delta: z.object({ content: Content.nullish() }).loose().optional(),
            finish_reason: z.string().nullish(),
          })
          .loose(),
      )
      .optional(),
    usage: z
      .object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() })
      .loose()
      .nullish(),
  })
  .loose();

function stopKind(reason: string): StopKind {
  switch (reason) {
    case 'stop':
      return 'end';
    case 'length':
    case 'model_length':
      return 'max_tokens';
    default:
      return 'other';
  }
}

function textOf(content: z.infer<typeof Content> | null | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('');
}

export class MistralProvider implements LlmProvider {
  readonly name = 'mistral' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MistralProviderOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetch ?? fetch;
  }

  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream {
    const outcome = emptyOutcome();
    const provider = this.name;
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: true,
      max_tokens: prompt.maxTokens,
      temperature: MISTRAL_SETTINGS.temperature,
      top_p: MISTRAL_SETTINGS.topP,
    };
    const request = () =>
      this.fetchFn(`${MISTRAL_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([opts.signal, AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)]),
      });

    async function* run(): AsyncGenerator<string> {
      let res: Response;
      try {
        res = await request();
      } catch (err) {
        throw classify(err);
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => {});
        throw new ProviderError(provider, kindFromStatus(res.status), res.status);
      }
      const reader = res.body;
      let done = false;
      try {
        for await (const message of readSse(reader)) {
          if (message.data === '[DONE]') {
            done = true;
            break;
          }
          let json: unknown;
          try {
            json = JSON.parse(message.data);
          } catch {
            throw new ProviderError(provider, 'protocol');
          }
          const chunk = Chunk.safeParse(json);
          if (!chunk.success) throw new ProviderError(provider, 'protocol');
          if (chunk.data.usage) {
            outcome.tokensIn = chunk.data.usage.prompt_tokens;
            outcome.tokensOut = chunk.data.usage.completion_tokens;
          }
          for (const choice of chunk.data.choices ?? []) {
            const text = textOf(choice.delta?.content);
            if (text) yield text;
            if (choice.finish_reason) outcome.stop = stopKind(choice.finish_reason);
          }
        }
        if (!done && outcome.stop === null) throw new ProviderError(provider, 'protocol');
      } catch (err) {
        throw classify(err);
      } finally {
        await reader.cancel().catch(() => {});
      }
    }

    function classify(err: unknown): ProviderError {
      if (err instanceof ProviderError) return err;
      if (opts.signal.aborted) return new ProviderError(provider, 'aborted');
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return new ProviderError(provider, 'timeout');
      }
      return new ProviderError(provider, 'network');
    }

    const iterable = run();
    return { outcome, [Symbol.asyncIterator]: () => iterable };
  }
}
