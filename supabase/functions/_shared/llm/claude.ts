// Shared streaming for Claude through the official SDKs: the direct API (@anthropic-ai/sdk) and
// Bedrock (@anthropic-ai/bedrock-sdk, InvokeModelWithResponseStream under the hood) expose the
// same `messages.stream()` MessageStream. We iterate the SDK's typed events (no hand-rolled SSE
// parsing), yield text deltas, and read usage and stop reason from the final message.
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_SETTINGS } from './settings.ts';
import {
  emptyOutcome,
  kindFromStatus,
  type LlmPrompt,
  ProviderError,
  type ProviderName,
  type ProviderStream,
  type StopKind,
  type StreamOptions,
} from './provider.ts';

type MessageStreamParams = Parameters<Anthropic['messages']['stream']>[0];
type MessageStream = ReturnType<Anthropic['messages']['stream']>;

/** What claudeStream needs from either SDK client. */
export interface ClaudeMessagesClient {
  messages: {
    stream(params: MessageStreamParams, options?: { signal?: AbortSignal }): MessageStream;
  };
}

/** Request body for one reply. Settings live in settings.ts; no temperature, no prefill. */
export function claudeParams(model: string, prompt: LlmPrompt): MessageStreamParams {
  return {
    model,
    max_tokens: prompt.maxTokens,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    thinking: { type: CLAUDE_SETTINGS.thinking },
    output_config: { effort: CLAUDE_SETTINGS.effort },
  };
}

function stopKind(reason: string | null | undefined): StopKind | null {
  switch (reason) {
    case null:
    case undefined:
      return null;
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

/** Maps SDK errors to ProviderError (kind + status only; the SDK message is dropped). */
export function toProviderError(provider: ProviderName, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError(provider, 'aborted');
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderError(provider, 'timeout');
  }
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError(provider, 'network');
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : null;
    // Errors inside the stream (e.g. overloaded_error) arrive without an HTTP status.
    return new ProviderError(provider, status === null ? 'server' : kindFromStatus(status), status);
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new ProviderError(provider, 'aborted');
  }
  return new ProviderError(provider, 'protocol');
}

export function claudeStream(
  provider: ProviderName,
  client: ClaudeMessagesClient,
  params: MessageStreamParams,
  opts: StreamOptions,
): ProviderStream {
  const outcome = emptyOutcome();

  async function* run(): AsyncGenerator<string> {
    let stream: MessageStream;
    try {
      stream = client.messages.stream(params, { signal: opts.signal });
    } catch (err) {
      throw toProviderError(provider, err);
    }
    let finished = false;
    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            outcome.tokensIn = event.message.usage.input_tokens;
            outcome.tokensOut = event.message.usage.output_tokens;
            break;
          case 'content_block_delta':
            if (event.delta.type === 'text_delta' && event.delta.text.length > 0) {
              yield event.delta.text;
            }
            break;
          case 'message_delta':
            // Cumulative counts: kept so an aborted stream still has usage.
            outcome.tokensOut = event.usage.output_tokens;
            if (typeof event.usage.input_tokens === 'number') {
              outcome.tokensIn = event.usage.input_tokens;
            }
            outcome.stop = stopKind(event.delta.stop_reason);
            break;
          default:
            break;
        }
      }
      const final = await stream.finalMessage();
      outcome.tokensIn = final.usage.input_tokens;
      outcome.tokensOut = final.usage.output_tokens;
      outcome.stop = stopKind(final.stop_reason) ?? outcome.stop;
      if (final.stop_reason === 'refusal') {
        outcome.refusalCategory = final.stop_details?.category ?? 'unspecified';
      }
      finished = true;
    } catch (err) {
      throw toProviderError(provider, err);
    } finally {
      // Consumer stopped early (fallback, disconnect) or error: cancel the HTTP call.
      if (!finished) stream.abort();
    }
  }

  const iterable = run();
  return {
    outcome,
    [Symbol.asyncIterator]: () => iterable,
  };
}
