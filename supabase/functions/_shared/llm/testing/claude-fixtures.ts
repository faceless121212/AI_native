// Canned Claude Messages API stream events (the shapes the SDK parses), for adapter tests.

export function claudeEvents(
  texts: string[],
  opts: {
    stopReason?: string;
    stopDetails?: Record<string, unknown> | null;
    inputTokens?: number;
    outputTokens?: number;
  } = {},
): Array<Record<string, unknown>> {
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: opts.inputTokens ?? 321, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...texts.map((text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: {
        stop_reason: opts.stopReason ?? 'end_turn',
        stop_sequence: null,
        stop_details: opts.stopDetails ?? null,
      },
      usage: { output_tokens: opts.outputTokens ?? 45 },
    },
    { type: 'message_stop' },
  ];
}

export function sseBody(
  events: Array<Record<string, unknown>>,
  splitEvery = 0,
): ReadableStream<Uint8Array> {
  const text = events
    .map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      if (splitEvery <= 0) c.enqueue(bytes);
      else
        for (let i = 0; i < bytes.length; i += splitEvery)
          c.enqueue(bytes.slice(i, i + splitEvery));
      c.close();
    },
  });
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
  /** The request's abort signal (real fetch cancels the body when it fires). */
  signal: AbortSignal;
}

/** A fetch that records the request and answers with `respond()`. */
export function fakeFetch(respond: (req: CapturedRequest) => Response | Promise<Response>) {
  const requests: CapturedRequest[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    if (req.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const captured: CapturedRequest = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: JSON.parse(await req.text()),
      signal: init?.signal ?? req.signal,
    };
    requests.push(captured);
    return await respond(captured);
  };
  return { fetch: fn as typeof fetch, requests };
}

export async function drain(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

export const PROMPT = {
  system: 'SYSTEM PROMPT',
  user: 'USER TURN',
  maxTokens: 600,
  kind: 'reply',
  lang: 'de',
  formality: 'casual',
} as const;
