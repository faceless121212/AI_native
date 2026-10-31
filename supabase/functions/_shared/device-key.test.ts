import { assert, assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@1';
import {
  base64UrlDecode,
  DEVICE_KEY_PATTERN,
  generateDeviceKey,
  hashDeviceKey,
  isDeviceKeyFormat,
} from './device-key.ts';
import { DeviceKey } from './schemas.ts';

Deno.test('generateDeviceKey: 32 random bytes as 43-char base64url without padding', () => {
  const key = generateDeviceKey();
  assertMatch(key, DEVICE_KEY_PATTERN);
  assertEquals(key.length, 43);
  assertEquals(base64UrlDecode(key).byteLength, 32);
  assert(!/[+/=]/.test(key), 'no standard-base64 characters or padding');
  assert(isDeviceKeyFormat(key));
  assert(DeviceKey.safeParse(key).success, 'matches the DeviceKey schema');
});

Deno.test('generateDeviceKey: keys are unique', () => {
  const keys = new Set(Array.from({ length: 500 }, generateDeviceKey));
  assertEquals(keys.size, 500);
});

Deno.test('hashDeviceKey: SHA-256 hex of the key string (known vector)', async () => {
  // SHA-256("abc") from FIPS 180-2.
  assertEquals(
    await hashDeviceKey('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

Deno.test(
  'hashDeviceKey: 64 lowercase hex chars, deterministic, never the key itself',
  async () => {
    const key = generateDeviceKey();
    const hash = await hashDeviceKey(key);
    assertMatch(hash, /^[0-9a-f]{64}$/);
    assertEquals(await hashDeviceKey(key), hash);
    assertNotEquals(hash, key);
    assertNotEquals(await hashDeviceKey(generateDeviceKey()), hash);
  },
);

Deno.test('isDeviceKeyFormat rejects wrong lengths and alphabets', () => {
  assert(!isDeviceKeyFormat(''));
  assert(!isDeviceKeyFormat('a'.repeat(42)));
  assert(!isDeviceKeyFormat('a'.repeat(44)));
  assert(!isDeviceKeyFormat(`${'a'.repeat(42)}=`));
  assert(!isDeviceKeyFormat(`${'a'.repeat(42)}+`));
  assert(isDeviceKeyFormat('A'.repeat(42) + 'A'));
});
