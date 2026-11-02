import { assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1';
import { AnthropicProvider } from './anthropic.ts';
import { ProviderError } from './provider.ts';
import { claudeEvents, drain, fakeFetch, PROMPT, sseBody } from './testing/claude-fixtures.ts';

const SSE = { 'content-type': 'text/event-stream' };

function provider(f: typeof fetch) {
  return new AnthropicProvider({
    apiKey: 'test-key-not-real',
    model: 'claude-haiku-5-5',
    fetch: f,
  });
}

Deno.test('anthropic: streams text deltas via the SDK; usage from the final message', async () => {
  const { fetch, requests } = fakeFetch(
    () => new Response(sseBody(claudeEvents(['R1|Hal', 'lo\nMETA|{}\n']), 17), { headers: SSE }),
  );
  const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
  assertEquals(await drain(stream), 'R1|Hallo\nMETA|{}\n');
  assertEquals(stream.outcome, {
    tokensIn: 321,
    tokensOut: 45,
    stop: 'end',
    refusalCategory: null,
  });

  const req = requests[0]!;
  assertEquals(req.url, 'https://api.anthropic.com/v1/messages');
  assertEquals(req.headers.get('authorization'), 'Bearer test-key-not-real');
  assertEquals(req.body.model, 'claude-haiku-5-5');
  assertEquals(req.body.stream, true);
  assertEquals(req.body.max_tokens, 600);
  assertEquals(req.body.system, 'SYSTEM PROMPT');
  assertEquals(req.body.messages, [{ role: 'user', content: 'USER TURN' }]);
  assertEquals(req.body.thinking, { type: 'disabled' });
  assertEquals(req.body.output_config, { effort: 'low' });
  for (const banned of ['temperature', 'top_p', 'top_k']) assertFalse(banned in req.body, banned);
});

Deno.test(
  'anthropic: stop_reason refusal → outcome refusal with category, explanation not kept',
  async () => {
    const details = {
      type: 'refusal',
      category: 'general_harms',
      explanation: 'SECRET-EXPLANATION',
    };
    const { fetch } = fakeFetch(
      () =>
        new Response(
          sseBody(claudeEvents(['R1|par'], { stopReason: 'refusal', stopDetails: details })),
          { headers: SSE },
        ),
    );
    const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
    await drain(stream);
    assertEquals(stream.outcome.stop, 'refusal');
    assertEquals(stream.outcome.refusalCategory, 'general_harms');
    assertFalse(JSON.stringify(stream.outcome).includes('SECRET'));
  },
);

Deno.test('anthropic: max_tokens stop is reported', async () => {
  const { fetch } = fakeFetch(
    () =>
      new Response(sseBody(claudeEvents(['R1|a'], { stopReason: 'max_tokens' })), { headers: SSE }),
  );
  const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
  await drain(stream);
  assertEquals(stream.outcome.stop, 'max_tokens');
});

Deno.test('anthropic: HTTP errors → typed ProviderError without the provider message', async () => {
  for (const [status, kind] of [
    [401, 'auth'],
    [429, 'rate'],
    [400, 'bad_request'],
    [500, 'server'],
    [529, 'server'],
  ] as const) {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { type: 'error', error: { type: 'x_error', message: 'ECHOED USER TEXT' } },
        { status },
      ),
    );
    const err = await assertRejects(
      () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
      ProviderError,
    );
    assertEquals([err.kind, err.status, err.provider], [kind, status, 'anthropic']);
    assertFalse(err.message.includes('ECHOED'));
  }
});

Deno.test('anthropic: error event inside the stream → server error', async () => {
  const events = [
    claudeEvents(['R1|x'])[0]!,
    { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
  ];
  const { fetch } = fakeFetch(() => new Response(sseBody(events), { headers: SSE }));
  const err = await assertRejects(
    () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'server');
});

Deno.test('anthropic: network failure and abort', async () => {
  const failing = (() =>
    Promise.reject(new TypeError('connection refused'))) as unknown as typeof fetch;
  let err = await assertRejects(
    () => drain(provider(failing).stream(PROMPT, { signal: new AbortController().signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'network');

  const ac = new AbortController();
  ac.abort();
  const { fetch } = fakeFetch(() => new Response(sseBody(claudeEvents(['x'])), { headers: SSE }));
  err = await assertRejects(
    () => drain(provider(fetch).stream(PROMPT, { signal: ac.signal })),
    ProviderError,
  );
  assertEquals(err.kind, 'aborted');
});

Deno.test('anthropic: stopping iteration early aborts the HTTP request', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of claudeEvents(['R1|a', 'b']).slice(0, 3)) {
        c.enqueue(enc.encode(`event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`));
      }
      // never closes
    },
  });
  const { fetch, requests } = fakeFetch(() => new Response(body, { headers: SSE }));
  const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
  for await (const chunk of stream) {
    assertEquals(chunk, 'R1|a');
    break;
  }
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(requests[0]!.signal.aborted, true);
});

Deno.test(
  'anthropic: ignores ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_LOG from the environment',
  async () => {
    const saved = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_LOG'].map(
      (n) => [n, Deno.env.get(n)] as const,
    );
    Deno.env.set('ANTHROPIC_BASE_URL', 'https://elsewhere.example');
    Deno.env.set('ANTHROPIC_AUTH_TOKEN', 'env-token');
    Deno.env.set('ANTHROPIC_LOG', 'debug');
    try {
      const { fetch, requests } = fakeFetch(
        () => new Response(sseBody(claudeEvents(['R1|x\n'])), { headers: SSE }),
      );
      const { captureConsole } = await import('../testing/helpers.ts');
      const { lines } = await captureConsole(() =>
        drain(
          provider(fetch).stream(
            { ...PROMPT, user: 'LOGMARKER' },
            { signal: new AbortController().signal },
          ),
        ),
      );
      assertEquals(new URL(requests[0]!.url).origin, 'https://api.anthropic.com');
      assertEquals(requests[0]!.headers.get('authorization'), 'Bearer test-key-not-real');
      assertEquals(
        lines.filter((l) => l.includes('LOGMARKER')),
        [],
      );
    } finally {
      for (const [n, v] of saved) v === undefined ? Deno.env.delete(n) : Deno.env.set(n, v);
    }
  },
);
