import { assertEquals } from 'jsr:@std/assert@1';
import { authenticate } from '../_shared/auth.ts';
import { generateDeviceKey, hashDeviceKey } from '../_shared/device-key.ts';
import { withErrors } from '../_shared/http.ts';
import { ConsentResponse, ErrorResponse } from '../_shared/schemas.ts';
import type { AiPolicy } from '../_shared/policy.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, captureConsole, device, jsonRequest } from '../_shared/testing/helpers.ts';
import { handleConsent } from './handler.ts';

// Two published versions so "new version" paths can be tested; the real list is in policy.ts.
const POLICY: AiPolicy = {
  accepted: ['2026-11-01', '2026-12-01'],
  current: '2026-12-01',
  minimum: '2026-11-01',
};

function setup(policy: AiPolicy = POLICY) {
  const store = new MemoryStore(undefined, policy.minimum);
  const handler = withErrors('consent', (req) =>
    handleConsent(req, { auth: store, repo: store, policy }),
  );
  return { store, handler };
}

async function adultUser(store: MemoryStore) {
  const user = store.addUser();
  await store.patchProfile(user.userId, { ageConfirmed: true });
  return user;
}

const grant = (token: string, policyVersion = '2026-11-01') =>
  jsonRequest('POST', { action: 'grant', policyVersion }, bearer(token));
const withdraw = (token: string) => jsonRequest('POST', { action: 'withdraw' }, bearer(token));

Deno.test('consent: only POST', async () => {
  const { handler } = setup();
  const res = await handler(new Request('http://localhost/', { method: 'GET' }));
  assertEquals(res.status, 405);
  assertEquals(res.headers.get('allow'), 'POST');
});

Deno.test('consent: 401 without a session, and device keys are not accepted', async () => {
  const { handler } = setup();
  assertEquals((await handler(jsonRequest('POST', { action: 'withdraw' }))).status, 401);
  const res = await handler(
    jsonRequest('POST', { action: 'withdraw' }, device(generateDeviceKey())),
  );
  assertEquals(res.status, 401);
  assertEquals(ErrorResponse.parse(await res.json()).error, 'unauthorized');
});

Deno.test('consent: 400 on an invalid body', async () => {
  const { store, handler } = setup();
  const { token } = await adultUser(store);
  assertEquals(
    (await handler(jsonRequest('POST', { action: 'grant' }, bearer(token)))).status,
    400,
  );
  assertEquals((await handler(jsonRequest('POST', { action: 'nope' }, bearer(token)))).status, 400);
});

Deno.test(
  'consent: only server-known policy versions (400 unknown_policy_version, nothing stored)',
  async () => {
    const { store, handler } = setup();
    const { token } = await adultUser(store);
    for (const version of ['v1', '2026-11-02', '2099-01-01', 'latest']) {
      const res = await handler(grant(token, version));
      assertEquals(res.status, 400, version);
      assertEquals((await res.json()).error, 'unknown_policy_version', version);
    }
    assertEquals(store.consents.length, 0);
    assertEquals(store.credits.length, 0);
  },
);

Deno.test('consent: a known version below the minimum is refused', async () => {
  const { store, handler } = setup({ ...POLICY, minimum: '2026-12-01' });
  const { token } = await adultUser(store);
  const res = await handler(grant(token, '2026-11-01'));
  assertEquals([res.status, (await res.json()).error], [400, 'unknown_policy_version']);
  assertEquals((await handler(grant(token, '2026-12-01'))).status, 200);
});

Deno.test('consent: unknown keys in the body are rejected (strict)', async () => {
  const { store, handler } = setup();
  const { token } = await adultUser(store);
  const res = await handler(
    jsonRequest('POST', { action: 'withdraw', policyVersion: '2026-11-01' }, bearer(token)),
  );
  assertEquals(res.status, 400);
});

Deno.test('consent: grant needs age confirmation (403 age_required, nothing stored)', async () => {
  const { store, handler } = setup();
  const { token } = store.addUser();
  const res = await handler(grant(token));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'age_required');
  assertEquals(store.consents.length, 0);
  assertEquals(store.credits.length, 0);
});

Deno.test(
  'consent: starter credits once — first grant, regrant, new version, withdraw + regrant',
  async () => {
    const { store, handler } = setup();
    const { userId, token } = await adultUser(store);

    const first = ConsentResponse.parse(await (await handler(grant(token))).json());
    assertEquals(first.action === 'grant' && first.starterCreditsGranted, true);
    assertEquals(first.action === 'grant' && first.aiEnabled, true);

    for (const req of [
      grant(token),
      grant(token, '2026-12-01'),
      withdraw(token),
      grant(token, '2026-12-01'),
    ]) {
      const body = ConsentResponse.parse(await (await handler(req)).json());
      if (body.action === 'grant') assertEquals(body.starterCreditsGranted, false);
    }
    const starter = store.credits.filter((c) => c.userId === userId && c.reason === 'starter');
    assertEquals(starter, [{ userId, delta: 10, reason: 'starter' }]);
  },
);

Deno.test('consent: concurrent first grants add starter credits exactly once', async () => {
  const { store, handler } = setup();
  const { userId, token } = await adultUser(store);
  const bodies = await Promise.all(
    Array.from({ length: 10 }, async () =>
      ConsentResponse.parse(await (await handler(grant(token))).json()),
    ),
  );
  assertEquals(bodies.filter((b) => b.action === 'grant' && b.starterCreditsGranted).length, 1);
  assertEquals(store.credits.filter((c) => c.userId === userId).length, 1);
});

Deno.test(
  'consent: withdraw turns AI off and revokes every device key (keyboard gets 401)',
  async () => {
    const { store, handler } = setup();
    const { userId, token } = await adultUser(store);
    await handler(grant(token));
    const keys = [generateDeviceKey(), generateDeviceKey()];
    await store.createDeviceKey(userId, await hashDeviceKey(keys[0]!), 'ios');
    await store.createDeviceKey(userId, await hashDeviceKey(keys[1]!), 'android');

    const res = await handler(withdraw(token));
    assertEquals(res.status, 200);
    const body = ConsentResponse.parse(await res.json());
    assertEquals(body.action, 'withdraw');
    assertEquals(body.aiEnabled, false);
    assertEquals(body.action === 'withdraw' && body.revokedDeviceKeys, 2);
    assertEquals(store.aiAllowed(userId), false);

    for (const key of keys) {
      const r = new Request('http://localhost/', { headers: device(key) });
      const err = await authenticate(r, store, { allow: ['device'] }).catch((e) => e);
      assertEquals(err.status, 401);
    }
  },
);

Deno.test('consent: logs no request body, token or policy text', async () => {
  const { store, handler } = setup();
  const { token } = await adultUser(store);
  const { lines } = await captureConsole(async () => {
    await handler(grant(token, 'policy-2026-secret'));
    await handler(grant(token));
    await handler(withdraw(token));
    await handler(jsonRequest('POST', '{"oops', bearer(token)));
  });
  for (const line of lines) {
    assertEquals(line.includes(token), false);
    assertEquals(line.includes('policy-2026-secret'), false);
    assertEquals(line.includes('oops'), false);
  }
});
