import { assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1';
import { MistralProvider } from './mistral.ts';
import { ProviderError } from './provider.ts';
import { drain, fakeFetch, PROMPT } from './testing/claude-fixtures.ts';

function chunk(
  content: string | null,
  finish: string | null = null,
  usage?: Record<string, number>,
) {
  return {
    id: 'cmpl-test',
    object: 'chat.completion.chunk',
    model: 'mistral-small-latest',
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { role: 'assistant', content },
        finish_reason: finish,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

function sse(lines: unknown[], done = true, splitEvery = 0): Response {
  const text =
    lines.map((l) => `data: ${JSON.stringify(l)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      if (splitEvery <= 0) c.enqueue(bytes);
      else
        for (let i = 0; i < bytes.length; i += splitEvery)
          c.enqueue(bytes.slice(i, i + splitEvery));
      c.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

const provider = (f: typeof fetch) =>
  new MistralProvider({ apiKey: 'test-key-not-real', model: 'mistral-small-latest', fetch: f });

Deno.test(
  'mistral: streaming chat completions on the EU API; usage from the last chunk',
  async () => {
    const { fetch, requests } = fakeFetch(() =>
      sse(
        [
          chunk('R1|Sa'),
          chunk('lut\n'),
          chunk(null, 'stop', { prompt_tokens: 210, completion_tokens: 33, total_tokens: 243 }),
        ],
        true,
        11,
      ),
    );
    const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
    assertEquals(await drain(stream), 'R1|Salut\n');
    assertEquals(stream.outcome, {
      tokensIn: 210,
      tokensOut: 33,
      stop: 'end',
      refusalCategory: null,
    });
    const req = requests[0]!;
    assertEquals(req.url, 'https://api.mistral.ai/v1/chat/completions');
    assertEquals(req.headers.get('authorization'), 'Bearer test-key-not-real');
    assertEquals(req.body.model, 'mistral-small-latest');
    assertEquals(req.body.stream, true);
    assertEquals(req.body.max_tokens, 600);
    assertEquals(req.body.messages, [
      { role: 'system', content: 'SYSTEM PROMPT' },
      { role: 'user', content: 'USER TURN' },
    ]);
  },
);

Deno.test('mistral: content as an array of text chunks; length stop', async () => {
  const { fetch } = fakeFetch(() =>
    sse([
      {
        choices: [
          {
            index: 0,
            delta: { content: [{ type: 'text', text: 'L|ok' }] },
            finish_reason: 'length',
          },
        ],
      },
    ]),
  );
  const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
  assertEquals(await drain(stream), 'L|ok');
  assertEquals(stream.outcome.stop, 'max_tokens');
});

Deno.test('mistral: HTTP errors, broken streams and aborts → ProviderError', async () => {
  for (const [status, kind] of [
    [401, 'auth'],
    [429, 'rate'],
    [422, 'bad_request'],
    [503, 'server'],
  ] as const) {
    const { fetch } = fakeFetch(() => Response.json({ message: 'ECHO' }, { status }));
    const err = await assertRejects(
      () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
      ProviderError,
    );
    assertEquals([err.provider, err.kind, err.status], ['mistral', kind, status]);
    assertFalse(err.message.includes('ECHO'));
  }
  let { fetch } = fakeFetch(() => sse([chunk('R1|cut')], false));
  let err = await assertRejects(
    () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'protocol', 'stream ended without [DONE] or finish_reason');

  ({ fetch } = fakeFetch(
    () => new Response('data: {not json\n\n', { headers: { 'content-type': 'text/event-stream' } }),
  ));
  err = await assertRejects(
    () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'protocol');

  const failing = (() => Promise.reject(new TypeError('dns'))) as unknown as typeof fetch;
  err = await assertRejects(
    () => drain(provider(failing).stream(PROMPT, { signal: new AbortController().signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'network');

  const ac = new AbortController();
  ac.abort();
  ({ fetch } = fakeFetch(() => sse([chunk('x')])));
  err = await assertRejects(
    () => drain(provider(fetch).stream(PROMPT, { signal: ac.signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'aborted');
});
