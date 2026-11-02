// CLAUDE.md rule 5: request text is never logged or stored. Runs every pipeline path with a
// distinctive message and fails if any console line, stored request row or analytics event
// contains it (or a fragment of it, or what redaction removed).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { FakeProvider, type FakeScenario } from '../_shared/llm/fake.ts';
import { RateLimiter } from '../_shared/rate-limit.ts';
import { captureConsole, jsonRequest } from '../_shared/testing/helpers.ts';
import { aiUser, readEvents, replyRequest, setupReply } from './testing.ts';

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

Deno.test('reply: no request text in logs, stored rows or analytics on any path', async () => {
  // One store and analytics sink for all runs; a fresh breaker per scenario (failing scenarios
  // would otherwise mark the providers down for the rest of the test).
  const primary = new FakeProvider({ name: 'anthropic', slowMs: 400 });
  const fallback = new FakeProvider({ name: 'mistral', slowMs: 400 });
  const first = setupReply({ providers: [primary, fallback] });
  const { store, analytics } = first;
  let handler = first.handler;
  const { token, userId } = await aiUser(store);
  // Many requests in a row: subscription quota, no rate limit.
  store.entitlements.push({ userId, product: 'annual', active: true, expiresAt: null });
  store.rateLimit = 1000;
  const fresh = () => {
    const next = setupReply({
      providers: [primary, fallback],
      store,
      rateLimiter: new RateLimiter(1000),
    });
    next.deps.analytics = analytics;
    handler = next.handler;
  };

  const { lines } = await captureConsole(async () => {
    for (const scenario of SCENARIOS) {
      fresh();
      for (const kind of ['reply', 'polish'] as const) {
        const text = TEXT.replace('SCENARIO', scenario);
        const res = await handler(replyRequest(token, { text, kind }));
        assertEquals(res.status, 200, scenario);
        await readEvents(res);
      }
    }
    // Invalid body that contains the text: the 400 message names fields, not values.
    const bad = await handler(
      jsonRequest(
        'POST',
        { kind: 'reply', text: TEXT, extra: TEXT },
        { authorization: `Bearer ${token}` },
      ),
    );
    assertEquals(bad.status, 400);
    assertEquals(leaks(JSON.stringify(await bad.json())), []);
    // Client disconnect mid-stream.
    fresh();
    const client = new AbortController();
    const res = await handler(
      replyRequest(token, { text: TEXT.replace('SCENARIO', 'slow') }, { signal: client.signal }),
    );
    client.abort();
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
  });

  assert(lines.length > 0, 'the pipeline logs metadata');
  assertEquals(lines.flatMap(leaks), [], 'console');
  assertEquals(leaks(JSON.stringify([...store.requests.values()])), [], 'ai_requests rows');
  assertEquals(leaks(JSON.stringify(analytics.events)), [], 'analytics');
  // Providers did get the (redacted) text: proves the test text actually went through.
  assert(primary.calls.some((c) => c.user.includes('Zanzibarquokka')));
  assert(
    primary.calls.every((c) => !c.user.includes('quokka.secret') && !c.user.includes('900123')),
  );
});
