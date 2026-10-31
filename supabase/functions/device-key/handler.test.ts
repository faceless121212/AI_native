import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { authenticate } from '../_shared/auth.ts';
import { hashDeviceKey } from '../_shared/device-key.ts';
import { withErrors } from '../_shared/http.ts';
import { DeviceKeyCreateResponse, DeviceKeyRevokeResponse } from '../_shared/schemas.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, captureConsole, device, jsonRequest } from '../_shared/testing/helpers.ts';
import { handleDeviceKey } from './handler.ts';

function setup() {
  const store = new MemoryStore();
  const handler = withErrors('device-key', (req) =>
    handleDeviceKey(req, { auth: store, repo: store }),
  );
  return { store, handler };
}

async function consentedUser(store: MemoryStore) {
  const user = store.addUser();
  await store.patchProfile(user.userId, { ageConfirmed: true });
  await store.grantAiConsent(user.userId, 'v1');
  return user;
}

const create = (token: string, platform = 'ios') =>
  jsonRequest('POST', { platform }, bearer(token));
const revoke = (token: string, body: unknown) => jsonRequest('DELETE', body, bearer(token));

async function createKey(
  handler: (r: Request) => Promise<Response>,
  token: string,
  platform = 'ios',
) {
  const res = await handler(create(token, platform));
  assertEquals(res.status, 201);
  return DeviceKeyCreateResponse.parse(await res.json());
}

Deno.test('device-key: 401 without a session; device keys cannot mint device keys', async () => {
  const { store, handler } = setup();
  const { token } = await consentedUser(store);
  assertEquals((await handler(jsonRequest('POST', { platform: 'ios' }))).status, 401);
  const { key } = await createKey(handler, token);
  assertEquals((await handler(jsonRequest('POST', { platform: 'ios' }, device(key)))).status, 401);
});

Deno.test('device-key: requires age confirmation, then consent', async () => {
  const { store, handler } = setup();
  const { userId, token } = store.addUser();
  let res = await handler(create(token));
  assertEquals([res.status, (await res.json()).error], [403, 'age_required']);
  await store.patchProfile(userId, { ageConfirmed: true });
  res = await handler(create(token));
  assertEquals([res.status, (await res.json()).error], [403, 'ai_off']);
  await store.grantAiConsent(userId, 'v1');
  await store.withdrawAiConsent(userId);
  res = await handler(create(token));
  assertEquals(
    [res.status, (await res.json()).error],
    [403, 'ai_off'],
    'withdrawn consent blocks too',
  );
  assertEquals(store.deviceKeys.length, 0);
});

Deno.test(
  'device-key: returns the key once, stores only its SHA-256, no-store response',
  async () => {
    const { store, handler } = setup();
    const { userId, token } = await consentedUser(store);
    const res = await handler(create(token, 'android'));
    assertEquals(res.status, 201);
    assertEquals(res.headers.get('cache-control'), 'no-store');
    const body = DeviceKeyCreateResponse.parse(await res.json());
    assertMatch(body.key, /^[A-Za-z0-9_-]{43}$/);
    assertEquals(body.platform, 'android');

    assertEquals(store.deviceKeys.length, 1);
    const stored = store.deviceKeys[0]!;
    assertEquals(stored.keyHash, await hashDeviceKey(body.key));
    assertEquals(stored.userId, userId);
    assert(!JSON.stringify(store.deviceKeys).includes(body.key), 'raw key is not stored');

    const ctx = await authenticate(
      new Request('http://localhost/', { headers: device(body.key) }),
      store,
      { allow: ['device'] },
    );
    assertEquals(ctx.userId, userId);
  },
);

Deno.test('device-key: a new key on the same platform revokes the old one', async () => {
  const { store, handler } = setup();
  const { token } = await consentedUser(store);
  const first = await createKey(handler, token, 'ios');
  const second = await createKey(handler, token, 'ios');
  const android = await createKey(handler, token, 'android');
  const auth = (key: string) =>
    authenticate(new Request('http://localhost/', { headers: device(key) }), store, {
      allow: ['device'],
    }).then(
      () => 200,
      (e) => e.status,
    );
  assertEquals(
    [await auth(first.key), await auth(second.key), await auth(android.key)],
    [401, 200, 200],
  );
});

Deno.test(
  'device-key: DELETE one key or all; revoked keys are rejected; other users untouched',
  async () => {
    const { store, handler } = setup();
    const a = await consentedUser(store);
    const b = await consentedUser(store);
    const aIos = await createKey(handler, a.token, 'ios');
    const aAndroid = await createKey(handler, a.token, 'android');
    const bIos = await createKey(handler, b.token, 'ios');

    // B cannot revoke A's key by ID.
    let res = await handler(revoke(b.token, { scope: 'key', keyId: aIos.keyId }));
    assertEquals(DeviceKeyRevokeResponse.parse(await res.json()).revoked, 0);

    res = await handler(revoke(a.token, { scope: 'key', keyId: aIos.keyId }));
    assertEquals(DeviceKeyRevokeResponse.parse(await res.json()).revoked, 1);
    const status = (key: string) =>
      authenticate(new Request('http://localhost/', { headers: device(key) }), store, {
        allow: ['device'],
      }).then(
        () => 200,
        (e) => e.status,
      );
    assertEquals(await status(aIos.key), 401);
    assertEquals(await status(aAndroid.key), 200);

    res = await handler(revoke(a.token, { scope: 'all' }));
    assertEquals(DeviceKeyRevokeResponse.parse(await res.json()).revoked, 1);
    assertEquals(await status(aAndroid.key), 401);
    assertEquals(await status(bIos.key), 200, 'B keeps their key');
  },
);

Deno.test('device-key: 400 on bad bodies, 405 on other methods', async () => {
  const { store, handler } = setup();
  const { token } = await consentedUser(store);
  assertEquals((await handler(create(token, 'web'))).status, 400);
  assertEquals((await handler(revoke(token, { scope: 'key' }))).status, 400);
  assertEquals((await handler(jsonRequest('PUT', {}, bearer(token)))).status, 405);
});

Deno.test('device-key: never logs the key, its hash or the session token', async () => {
  const { store, handler } = setup();
  const { token } = await consentedUser(store);
  const { result, lines } = await captureConsole(() => handler(create(token)));
  const { key } = DeviceKeyCreateResponse.parse(await result.json());
  const hash = await hashDeviceKey(key);
  for (const line of lines) {
    assertEquals(line.includes(key) || line.includes(hash) || line.includes(token), false, line);
  }
});
