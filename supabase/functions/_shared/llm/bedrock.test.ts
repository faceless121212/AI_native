// Bedrock adapter against canned InvokeModelWithResponseStream responses: AWS binary event-stream
// frames ({"bytes": base64(<Claude stream event>)}), encoded with the same codec AWS SDKs use.
import { assert, assertEquals, assertFalse, assertMatch, assertRejects } from 'jsr:@std/assert@1';
import { BedrockProvider } from './bedrock.ts';
import { ProviderError } from './provider.ts';
import { claudeEvents, drain, fakeFetch, PROMPT } from './testing/claude-fixtures.ts';
import { eventStream } from './testing/bedrock-fixtures.ts';

const MODEL = 'eu.anthropic.claude-haiku-5-5-v1:0';
function provider(f: typeof fetch) {
  return new BedrockProvider({
    region: 'eu-central-1',
    accessKeyId: 'AKIATESTNOTREAL',
    secretAccessKey: 'test-secret-not-real',
    model: MODEL,
    fetch: f,
  });
}

Deno.test(
  'bedrock: InvokeModelWithResponseStream on the EU profile, SigV4, event-stream decoded',
  async () => {
    const { fetch, requests } = fakeFetch(() =>
      eventStream(claudeEvents(['R1|Hal', 'lo\n'], { inputTokens: 200, outputTokens: 30 }), 13),
    );
    const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
    assertEquals(await drain(stream), 'R1|Hallo\n');
    assertEquals(stream.outcome, {
      tokensIn: 200,
      tokensOut: 30,
      stop: 'end',
      refusalCategory: null,
    });

    const req = requests[0]!;
    const url = new URL(req.url);
    assertEquals(url.host, 'bedrock-runtime.eu-central-1.amazonaws.com');
    assertEquals(decodeURIComponent(url.pathname), `/model/${MODEL}/invoke-with-response-stream`);
    assertMatch(
      req.headers.get('authorization') ?? '',
      /^AWS4-HMAC-SHA256 Credential=AKIATESTNOTREAL\/\d{8}\/eu-central-1\/bedrock\/aws4_request/,
    );
    assertFalse('model' in req.body, 'model goes in the path, not the body');
    assert(
      typeof req.body.anthropic_version === 'string',
      'SDK sets anthropic_version in the body',
    );
    assertEquals(req.body.max_tokens, 600);
    assertEquals(req.body.system, 'SYSTEM PROMPT');
    assertEquals(req.body.thinking, { type: 'disabled' });
    assertEquals(req.body.output_config, { effort: 'low' });
    for (const banned of ['temperature', 'top_p', 'top_k', 'stream'])
      assertFalse(banned in req.body, banned);
  },
);

Deno.test('bedrock: refusal stop reason', async () => {
  const { fetch } = fakeFetch(() =>
    eventStream(
      claudeEvents([], {
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: null, explanation: null },
      }),
    ),
  );
  const stream = provider(fetch).stream(PROMPT, { signal: new AbortController().signal });
  await drain(stream);
  assertEquals([stream.outcome.stop, stream.outcome.refusalCategory], ['refusal', 'unspecified']);
});

Deno.test('bedrock: HTTP errors → ProviderError (403 auth, 429 throttling, 503)', async () => {
  for (const [status, kind] of [
    [403, 'auth'],
    [429, 'rate'],
    [503, 'server'],
    [400, 'bad_request'],
  ] as const) {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { message: 'ECHO' },
        { status, headers: { 'x-amzn-errortype': 'SomeException' } },
      ),
    );
    const err = await assertRejects(
      () => drain(provider(fetch).stream(PROMPT, { signal: new AbortController().signal })),
      ProviderError,
    );
    assertEquals([err.provider, err.kind, err.status], ['bedrock', kind, status]);
    assert(!err.message.includes('ECHO'));
  }
});

Deno.test(
  'bedrock: ignores ANTHROPIC_BEDROCK_BASE_URL and ANTHROPIC_LOG from the environment',
  async () => {
    const saved = ['ANTHROPIC_BEDROCK_BASE_URL', 'ANTHROPIC_LOG'].map(
      (n) => [n, Deno.env.get(n)] as const,
    );
    Deno.env.set('ANTHROPIC_BEDROCK_BASE_URL', 'https://elsewhere.example');
    Deno.env.set('ANTHROPIC_LOG', 'debug');
    try {
      const { fetch, requests } = fakeFetch(() => eventStream(claudeEvents(['R1|x\n'])));
      const { captureConsole } = await import('../testing/helpers.ts');
      const { lines } = await captureConsole(() =>
        drain(
          provider(fetch).stream(
            { ...PROMPT, user: 'LOGMARKER' },
            { signal: new AbortController().signal },
          ),
        ),
      );
      assertEquals(new URL(requests[0]!.url).host, 'bedrock-runtime.eu-central-1.amazonaws.com');
      assertEquals(
        lines.filter((l) => l.includes('LOGMARKER')),
        [],
      );
    } finally {
      for (const [n, v] of saved) v === undefined ? Deno.env.delete(n) : Deno.env.set(n, v);
    }
  },
);
