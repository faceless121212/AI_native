import { assertEquals } from 'jsr:@std/assert@1';
import { CachedProviderHealth, MemoryProviderHealth } from './health.ts';

Deno.test(
  'health: 3 failures within 60 s → down for 5 minutes; slower failures do not add up',
  async () => {
    let now = 0;
    const h = new MemoryProviderHealth(() => now);
    assertEquals(await h.recordFailure('bedrock'), null);
    now = 30_000;
    assertEquals(await h.recordFailure('bedrock'), null);
    now = 59_999;
    assertEquals((await h.recordFailure('bedrock'))?.getTime(), 59_999 + 300_000);
    assertEquals((await h.downUntil('bedrock'))?.getTime(), 359_999);
    now = 360_000;
    assertEquals(await h.downUntil('bedrock'), null, 'up again after 5 minutes');

    assertEquals(await h.recordFailure('mistral'), null);
    now += 30_000;
    assertEquals(await h.recordFailure('mistral'), null);
    now += 30_000;
    assertEquals(await h.recordFailure('mistral'), null, 'third failure 60 s after the first');
  },
);

Deno.test('health: cached reads for 10 s; own failures update the cache at once', async () => {
  let now = 1_000;
  const store = new MemoryProviderHealth(() => now);
  let reads = 0;
  const counting = {
    readStatus: () => (reads++, store.readStatus()),
    recordFailure: (n: 'anthropic') => store.recordFailure(n),
  };
  const h = new CachedProviderHealth(counting, () => now);
  assertEquals(await h.downUntil('anthropic'), null);
  store.markDown('anthropic', now + 60_000);
  assertEquals(await h.downUntil('anthropic'), null, 'cached');
  now += 10_001;
  assertEquals((await h.downUntil('anthropic'))?.getTime(), 71_001 - 10_001);
  assertEquals(reads, 2);
  await h.recordFailure('anthropic');
  assertEquals(reads, 2);
});
