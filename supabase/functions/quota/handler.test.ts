import { assertEquals } from 'jsr:@std/assert@1';
import { hashDeviceKey } from '../_shared/device-key.ts';
import { withErrors } from '../_shared/http.ts';
import { QuotaResponse } from '../_shared/schemas.ts';
import { MemoryStore } from '../_shared/testing/memory-store.ts';
import { bearer, device } from '../_shared/testing/helpers.ts';
import { aiUser } from '../reply/testing.ts';
import { handleQuota } from './handler.ts';

const get = (headers: Record<string, string>) => new Request('http://localhost/quota', { headers });

Deno.test('quota: GET with JWT or device key; 401 without; 405 for POST', async () => {
  const store = new MemoryStore();
  const handler = withErrors('quota', (r) => handleQuota(r, { auth: store, repo: store }));
  const { token, userId } = await aiUser(store, { timezone: 'Europe/Berlin' });

  let res = await handler(get(bearer(token)));
  const q = QuotaResponse.parse(await res.json());
  assertEquals([q.plan, q.leftToday, q.fairUseLeft], ['free', 13, null]);
  assertEquals(new Date(q.resetAt).getTime() > Date.now(), true);

  const key = 'q'.repeat(43);
  await store.createDeviceKey(userId, await hashDeviceKey(key), 'android');
  res = await handler(get(device(key)));
  assertEquals(res.status, 200);
  await res.body?.cancel();

  assertEquals((await handler(get({}))).status, 401);
  assertEquals(
    (
      await handler(
        new Request('http://localhost/quota', { method: 'POST', headers: bearer(token) }),
      )
    ).status,
    405,
  );

  store.entitlements.push({ userId, product: 'weekly', active: true, expiresAt: null });
  const paid = QuotaResponse.parse(await (await handler(get(bearer(token)))).json());
  assertEquals([paid.plan, paid.leftToday, paid.fairUseLeft], ['weekly', null, 300]);
});
