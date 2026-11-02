import { assert, assertEquals } from 'jsr:@std/assert@1';
import { withErrors } from '../_shared/http.ts';
import { ProfileResponse } from '../_shared/schemas.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, captureConsole, jsonRequest } from '../_shared/testing/helpers.ts';
import { handleProfile } from './handler.ts';

const SERVER_NOW = new Date('2026-10-31T20:00:00.000Z');

function setup() {
  const store = new MemoryStore(() => SERVER_NOW);
  const handler = withErrors('profile', (req) => handleProfile(req, { auth: store, repo: store }));
  const { userId, token } = store.addUser();
  return { store, handler, userId, token };
}

const patch = (token: string, body: unknown) => jsonRequest('PATCH', body, bearer(token));

Deno.test("profile: GET returns the caller's profile", async () => {
  const { handler, userId, token } = setup();
  const res = await handler(new Request('http://localhost/', { headers: bearer(token) }));
  assertEquals(res.status, 200);
  const body = ProfileResponse.parse(await res.json());
  assertEquals(body.id, userId);
  assertEquals(body.aiEnabled, false);
  assertEquals(body.ageConfirmedAt, null);
});

Deno.test('profile: 401 without a session; 405 for other methods', async () => {
  const { handler } = setup();
  assertEquals((await handler(new Request('http://localhost/'))).status, 401);
  assertEquals((await handler(jsonRequest('POST', { uiLang: 'de' }))).status, 405);
});

Deno.test('profile: ageConfirmed sets age_confirmed_at from the server clock, once', async () => {
  const { store, handler, userId, token } = setup();
  const first = ProfileResponse.parse(
    await (await handler(patch(token, { ageConfirmed: true }))).json(),
  );
  assertEquals(first.ageConfirmedAt, SERVER_NOW.toISOString());
  store.profiles.get(userId)!.ageConfirmedAt = '2026-01-01T00:00:00.000Z';
  const again = ProfileResponse.parse(
    await (await handler(patch(token, { ageConfirmed: true }))).json(),
  );
  assertEquals(again.ageConfirmedAt, '2026-01-01T00:00:00.000Z');
});

Deno.test('profile: the client cannot send a timestamp or unknown fields', async () => {
  const { handler, token } = setup();
  for (const body of [
    { ageConfirmedAt: '2000-01-01T00:00:00Z' },
    { ageConfirmed: false },
    {},
    { uiLang: 'de', admin: true },
  ]) {
    const res = await handler(patch(token, body));
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});

Deno.test('profile: ui_lang and timezone', async () => {
  const { handler, token } = setup();
  const res = await handler(patch(token, { uiLang: 'fr', timezone: 'Europe/Paris' }));
  const body = ProfileResponse.parse(await res.json());
  assertEquals([body.uiLang, body.timezone], ['fr', 'Europe/Paris']);
  assertEquals('iAm' in body || 'theyAre' in body, false, 'gender stays on the phone');
});

Deno.test('profile: "I am" / "They are" are not accepted (they stay on the phone)', async () => {
  const { handler, token } = setup();
  for (const body of [{ iAm: 'woman' }, { theyAre: 'man' }, { uiLang: 'de', iAm: 'man' }]) {
    const res = await handler(patch(token, body));
    assertEquals(res.status, 400, JSON.stringify(body));
    await res.body?.cancel();
  }
});

Deno.test('profile: time zones are stored under their canonical name', async () => {
  const { handler, token } = setup();
  for (const [sent, stored] of [
    ['europe/berlin', 'Europe/Berlin'],
    ['utc', 'UTC'],
    ['Etc/UTC', 'UTC'],
    ['Europe/Rome', 'Europe/Rome'],
  ]) {
    const body = ProfileResponse.parse(
      await (await handler(patch(token, { timezone: sent }))).json(),
    );
    assertEquals(body.timezone, stored, sent);
  }
});

Deno.test('profile: unknown IANA time zone → 400', async () => {
  const { handler, token } = setup();
  for (const timezone of ['Mars/Olympus_Mons', 'Europe/Atlantis']) {
    const res = await handler(patch(token, { timezone }));
    assertEquals(res.status, 400, timezone);
  }
  assert((await handler(patch(token, { timezone: 'Europe/London' }))).ok);
});

Deno.test('profile: logs nothing about the request', async () => {
  const { handler, token } = setup();
  const { lines } = await captureConsole(() =>
    handler(patch(token, { timezone: 'Europe/Madrid', uiLang: 'es' })),
  );
  assertEquals(
    lines.filter((l) => l.includes('Europe/Madrid') || l.includes(token)),
    [],
  );
});
