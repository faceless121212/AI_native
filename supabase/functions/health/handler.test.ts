import { assertEquals } from 'jsr:@std/assert@1';
import { withErrors } from '../_shared/http.ts';
import { MemoryProviderHealth } from '../_shared/llm/health.ts';
import { HealthResponse } from '../_shared/schemas.ts';
import { handleHealth } from './handler.ts';

async function check(
  providers: Array<'anthropic' | 'mistral'> | null,
  down: Array<'anthropic' | 'mistral'>,
) {
  const health = new MemoryProviderHealth();
  for (const name of down) health.markDown(name, Date.now() + 60_000);
  const handler = withErrors('health', (r) => handleHealth(r, { providers, health }));
  const res = await handler(new Request('http://localhost/health'));
  return { status: res.status, body: HealthResponse.parse(await res.json()) };
}

Deno.test('health: ok / degraded / down, no auth needed', async () => {
  assertEquals((await check(['anthropic'], [])).body, {
    status: 'ok',
    providerDown: false,
    downUntil: null,
  });
  const degraded = await check(['anthropic', 'mistral'], ['anthropic']);
  assertEquals(
    [degraded.status, degraded.body.status, degraded.body.providerDown],
    [200, 'degraded', false],
  );
  const down = await check(['anthropic'], ['anthropic']);
  assertEquals([down.status, down.body.status, down.body.providerDown], [503, 'down', true]);
  assertEquals(typeof down.body.downUntil, 'string');
  assertEquals((await check(null, [])).status, 503, 'refused provider config');
});

Deno.test('health: unreachable database → 503 down', async () => {
  const health = {
    downUntil: () => Promise.reject(new Error('db')),
    recordFailure: () => Promise.resolve(null),
  };
  const res = await handleHealth(new Request('http://localhost/health'), {
    providers: ['anthropic'],
    health,
  });
  assertEquals([res.status, (await res.json()).status], [503, 'down']);
});
