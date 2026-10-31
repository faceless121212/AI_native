import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { authenticate, parseAuthorization } from './auth.ts';
import { generateDeviceKey, hashDeviceKey } from './device-key.ts';
import { HttpError } from './errors.ts';
import { CURRENT_AI_POLICY_VERSION } from './policy.ts';
import { MemoryStore } from './testing/memory-store.ts';

function req(authorization?: string): Request {
  return new Request('http://localhost/', {
    headers: authorization ? { authorization } : {},
  });
}

async function storeWithKey() {
  const store = new MemoryStore();
  const { userId, token } = store.addUser();
  await store.patchProfile(userId, { ageConfirmed: true });
  await store.grantAiConsent(userId, CURRENT_AI_POLICY_VERSION);
  const key = generateDeviceKey();
  const created = await store.createDeviceKey(userId, await hashDeviceKey(key), 'ios');
  if (created.status !== 'ok') throw new Error('setup failed');
  return { store, userId, token, key, keyId: created.keyId };
}

async function expect401(p: Promise<unknown>, message?: string) {
  const err = await assertRejects(() => p, HttpError, message);
  assertEquals(err.status, 401);
  assertEquals(err.code, 'unauthorized');
}

Deno.test('parseAuthorization', () => {
  assertEquals(parseAuthorization(null), null);
  assertEquals(parseAuthorization(''), null);
  assertEquals(parseAuthorization('Bearer'), null);
  assertEquals(parseAuthorization('Basic abc'), null);
  assertEquals(parseAuthorization('Bearer a b'), null);
  assertEquals(parseAuthorization('Bearer abc'), { scheme: 'bearer', token: 'abc' });
  assertEquals(parseAuthorization('bearer abc'), { scheme: 'bearer', token: 'abc' });
  assertEquals(parseAuthorization('Device xyz'), { scheme: 'device', key: 'xyz' });
  assertEquals(parseAuthorization('DEVICE xyz'), { scheme: 'device', key: 'xyz' });
});

Deno.test('authenticate: missing or malformed header → 401', async () => {
  const store = new MemoryStore();
  await expect401(authenticate(req(), store, { allow: ['jwt', 'device'] }));
  await expect401(authenticate(req('Token abc'), store, { allow: ['jwt', 'device'] }));
});

Deno.test('authenticate: valid JWT → user', async () => {
  const store = new MemoryStore();
  const { userId, token } = store.addUser();
  assertEquals(await authenticate(req(`Bearer ${token}`), store, { allow: ['jwt'] }), {
    userId,
    method: 'jwt',
    deviceKeyId: null,
  });
});

Deno.test('authenticate: invalid JWT → 401', async () => {
  const store = new MemoryStore();
  await expect401(authenticate(req('Bearer nope'), store, { allow: ['jwt', 'device'] }));
});

Deno.test('authenticate: valid device key → user, looked up by hash only', async () => {
  const { store, userId, key, keyId } = await storeWithKey();
  const seen: string[] = [];
  const spy = {
    verifyJwt: store.verifyJwt.bind(store),
    lookupDeviceKey: (hash: string) => {
      seen.push(hash);
      return store.lookupDeviceKey(hash);
    },
  };
  const ctx = await authenticate(req(`Device ${key}`), spy, { allow: ['jwt', 'device'] });
  assertEquals(ctx, { userId, method: 'device', deviceKeyId: keyId });
  assertEquals(seen, [await hashDeviceKey(key)], 'the raw key never reaches the lookup');
  assertEquals(store.deviceKeys[0]?.lastUsedAt !== null, true, 'last_used_at recorded');
});

Deno.test('authenticate: revoked device key → 401', async () => {
  const { store, userId, key } = await storeWithKey();
  await store.revokeDeviceKeys(userId, null);
  await expect401(
    authenticate(req(`Device ${key}`), store, { allow: ['device'] }),
    'Device key was revoked.',
  );
});

Deno.test(
  'authenticate: unknown or malformed device key → 401 (malformed skips the lookup)',
  async () => {
    const { store } = await storeWithKey();
    await expect401(
      authenticate(req(`Device ${generateDeviceKey()}`), store, { allow: ['device'] }),
    );
    let lookups = 0;
    const counting = {
      verifyJwt: store.verifyJwt.bind(store),
      lookupDeviceKey: (h: string) => {
        lookups++;
        return store.lookupDeviceKey(h);
      },
    };
    await expect401(authenticate(req('Device short'), counting, { allow: ['device'] }));
    assertEquals(lookups, 0);
  },
);

Deno.test('authenticate: scheme not allowed for the endpoint → 401', async () => {
  const { store, token, key } = await storeWithKey();
  await expect401(authenticate(req(`Device ${key}`), store, { allow: ['jwt'] }));
  await expect401(authenticate(req(`Bearer ${token}`), store, { allow: ['device'] }));
});
