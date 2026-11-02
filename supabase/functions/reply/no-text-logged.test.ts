// CLAUDE.md rule 5: request text is never logged or stored. Runs every pipeline path with a
// distinctive message, through the fake provider AND the real Anthropic / Bedrock / Mistral
// adapters (canned HTTP, ANTHROPIC_LOG=debug set), plus every pre-stream rejection and a store
// that throws errors carrying the text. Fails if any console line, stored row (requests, credit
// ledger, usage days, provider status, feedback) or analytics event contains the text, a
// fragment of it, or what redaction removed.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { AnthropicProvider } from '../_shared/llm/anthropic.ts';
import { BedrockProvider } from '../_shared/llm/bedrock.ts';
import { FakeProvider, type FakeScenario } from '../_shared/llm/fake.ts';
import type { LlmProvider } from '../_shared/llm/provider.ts';
import { MistralProvider } from '../_shared/llm/mistral.ts';
import { eventStream } from '../_shared/llm/testing/bedrock-fixtures.ts';
import { claudeEvents, fakeFetch, sseBody } from '../_shared/llm/testing/claude-fixtures.ts';
import { RateLimiter } from '../_shared/rate-limit.ts';
import type { ReplyRepo } from '../_shared/repo.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, captureConsole, jsonRequest } from '../_shared/testing/helpers.ts';
import { aiUser, readEvents, replyBody, replyRequest, setupReply } from './testing.ts';

const TEXT =
  'Zanzibarquokka told me the vault code: mail quokka.secret@example.org or call +44 7700 900123 [[fake:SCENARIO]]';
const FRAGMENTS = [
  'Zanzibarquokka',
  'vault code',
  'quokka.secret',
  'example.org',
  '7700 900123',
  '900123',
];

function leaks(haystack: string): string[] {
  return FRAGMENTS.filter((f) => haystack.toLowerCase().includes(f.toLowerCase()));
}

const SCENARIOS: FakeScenario[] = [
  'ok',
  'error',
  'error-after-card',
  'slow',
  'refusal',
  'refused',
  'crisis',
  'malformed',
  'explicit',
  'wronglang',
  'long',
  'truncated',
];

const MODEL_OUTPUT = [
  'R1|Klingt super! Wie war dein Wochenende?\n',
  'R2|Schön, dass du dich meldest.\nR3|Kaffee diese Woche?\n',
  'META|{"lang":"de","crisis":false,"refused":false}\n',
];

function realProviders(): LlmProvider[] {
  const anthropic = fakeFetch(
    () =>
      new Response(sseBody(claudeEvents(MODEL_OUTPUT)), {
        headers: { 'content-type': 'text/event-stream' },
      }),
  );
  const bedrock = fakeFetch(() => eventStream(claudeEvents(MODEL_OUTPUT)));
  const mistral = fakeFetch(() => {
    const lines: unknown[] = MODEL_OUTPUT.map((content) => ({
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    }));
    lines.push({ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] });
    const text = lines.map((l) => `data: ${JSON.stringify(l)}\n\n`).join('') + 'data: [DONE]\n\n';
    return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
  });
  return [
    new AnthropicProvider({
      apiKey: 'test-key-not-real',
      model: 'claude-haiku-5-5',
      fetch: anthropic.fetch,
    }),
    new BedrockProvider({
      region: 'eu-central-1',
      accessKeyId: 'AKIATESTNOTREAL',
      secretAccessKey: 'test-secret-not-real',
      model: 'eu.anthropic.claude-haiku-5-5-v1:0',
      fetch: bedrock.fetch,
    }),
    new MistralProvider({
      apiKey: 'test-key-not-real',
      model: 'mistral-small-latest',
      fetch: mistral.fetch,
    }),
  ];
}

/** A store whose writes after the charge fail with errors that carry the text. */
class ThrowingStore extends MemoryStore {
  override finishRequest(): Promise<void> {
    return Promise.reject(new Error(`finish failed for ${TEXT}`));
  }
  override refundReply(): ReturnType<ReplyRepo['refundReply']> {
    return Promise.reject(new Error(`refund failed for ${TEXT}`));
  }
}

Deno.test('reply: no request text in logs, stored rows or analytics on any path', async () => {
  const previousLog = Deno.env.get('ANTHROPIC_LOG');
  Deno.env.set('ANTHROPIC_LOG', 'debug'); // the SDKs would log request bodies at debug
  const store = new MemoryStore();
  const first = setupReply({ store });
  const analytics = first.analytics;
  let health = first.health;
  let handler = first.handler;
  const { token, userId } = await aiUser(store);
  // Many requests in a row: subscription quota, no rate limit.
  store.entitlements.push({ userId, product: 'annual', active: true, expiresAt: null });
  store.rateLimit = 1000;
  // One store and analytics sink; a fresh breaker per scenario (failing scenarios would otherwise
  // mark the providers down for the rest of the test).
  const use = (providers: LlmProvider[], s: MemoryStore = store) => {
    const next = setupReply({ providers, store: s, rateLimiter: new RateLimiter(1000) });
    next.deps.analytics = analytics;
    handler = next.handler;
    health = next.health;
  };
  const healthStates: string[] = [];

  const { lines } = await captureConsole(async () => {
    const primary = new FakeProvider({ name: 'anthropic', slowMs: 400 });
    const fallback = new FakeProvider({ name: 'mistral', slowMs: 400 });
    for (const scenario of SCENARIOS) {
      use([primary, fallback]);
      for (const kind of ['reply', 'polish'] as const) {
        const res = await handler(
          replyRequest(token, { text: TEXT.replace('SCENARIO', scenario), kind }),
        );
        assertEquals(res.status, 200, scenario);
        const id = res.headers.get('x-request-id')!;
        await readEvents(res);
        // Feedback rows too.
        await handler(
          jsonRequest(
            'POST',
            { requestId: id, cardIndex: 0, type: 'up' },
            bearer(token),
            '/reply/event',
          ),
        );
      }
      healthStates.push(JSON.stringify([...health.failures]));
    }

    // Real adapters (canned HTTP), each as the only provider.
    for (const provider of realProviders()) {
      use([provider]);
      const res = await handler(replyRequest(token, { text: TEXT }));
      const events = await readEvents(res);
      assertEquals(events.filter((e) => e.event === 'card').length, 3, provider.name);
    }

    // Pre-stream rejections with the text in the body.
    use([primary]);
    const bad = await handler(
      jsonRequest('POST', { kind: 'reply', text: TEXT, extra: TEXT }, bearer(token)),
    );
    assertEquals(bad.status, 400);
    assertEquals(leaks(JSON.stringify(await bad.json())), []);
    const huge = await handler(
      jsonRequest('POST', { ...replyBody(), text: TEXT.repeat(200) }, bearer(token)),
    );
    assertEquals(huge.status, 413);
    await huge.body?.cancel();
    const noConsent = store.addUser();
    assertEquals((await handler(replyRequest(noConsent.token, { text: TEXT }))).status, 403);
    const empty = await aiUser(store, { starter: false });
    for (let i = 0; i < 3; i++) await readEvents(await handler(replyRequest(empty.token)));
    assertEquals((await handler(replyRequest(empty.token, { text: TEXT }))).status, 402);
    const limited = setupReply({ providers: [primary], store, rateLimiter: new RateLimiter(0) });
    assertEquals((await limited.handler(replyRequest(token, { text: TEXT }))).status, 429);
    use([primary]);
    health.markDown('anthropic', Date.now() + 60_000);
    assertEquals((await handler(replyRequest(token, { text: TEXT }))).status, 503);
    const refused = setupReply({
      store,
      llm: { ok: false, code: 'non_eu_provider', detail: 'anthropic' },
    });
    assertEquals((await refused.handler(replyRequest(token, { text: TEXT }))).status, 500);
    const wrongRegion = setupReply({
      store,
      llm: { ok: true, providers: [primary], regionOk: false },
    });
    assertEquals((await wrongRegion.handler(replyRequest(token, { text: TEXT }))).status, 503);

    // A store whose post-stream writes throw (errors carry the text).
    const throwing = new ThrowingStore();
    const t = await aiUser(throwing);
    use([new FakeProvider({ script: ['error'] })], throwing);
    const res = await handler(replyRequest(t.token, { text: TEXT }));
    assertEquals(
      (await readEvents(res)).map((e) => e.event),
      ['quota', 'error'],
    );

    // Client disconnect mid-stream.
    use([new FakeProvider({ script: ['slow'], slowMs: 250 })]);
    const client = new AbortController();
    const slow = await handler(replyRequest(token, { text: TEXT }, { signal: client.signal }));
    client.abort();
    await slow.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  });
  if (previousLog === undefined) Deno.env.delete('ANTHROPIC_LOG');
  else Deno.env.set('ANTHROPIC_LOG', previousLog);

  assert(lines.length > 0, 'the pipeline logs metadata');
  assertEquals(lines.flatMap(leaks), [], 'console');
  assert(!lines.some((l) => /crisis/i.test(l)), 'no crisis signal in logs');
  assertEquals(leaks(JSON.stringify([...store.requests.values()])), [], 'ai_requests rows');
  assertEquals(leaks(JSON.stringify(store.credits)), [], 'credit_ledger');
  assertEquals(leaks(JSON.stringify([...store.usage])), [], 'usage_days');
  assertEquals(leaks(JSON.stringify(store.replyEvents)), [], 'reply_events');
  assertEquals(leaks(healthStates.join()), [], 'provider_status');
  assertEquals(leaks(JSON.stringify([analytics.events, analytics.anonymous])), [], 'analytics');
  assert(store.replyEvents.length > 0, 'feedback was recorded');
});
