import { assertEquals } from 'jsr:@std/assert@1';
import { FakeProvider } from './fake.ts';
import { MemoryProviderHealth } from './health.ts';
import { runChain } from './runner.ts';

const PROMPT = {
  system: 's',
  user: 'u',
  maxTokens: 10,
  kind: 'reply',
  lang: 'en',
  formality: 'casual',
} as const;
const TIMING = { firstTokenMs: 80, lastProviderFirstTokenMs: 300, chunkIdleMs: 300 };

Deno.test('runner: an exception in our own consumer is not a provider failure', async () => {
  const health = new MemoryProviderHealth();
  const a = new FakeProvider({ name: 'anthropic' });
  const b = new FakeProvider({ name: 'mistral' });
  const result = await runChain([a, b], PROMPT, {
    signal: new AbortController().signal,
    health,
    timing: TIMING,
    consume: () => {
      throw new Error('parser bug');
    },
    committed: () => false,
    restart: () => {},
  });
  assertEquals(result.status, 'consumer_failed');
  assertEquals(health.failures.size, 0, 'nothing recorded against the provider');
  assertEquals(b.calls.length, 0, 'no fallback for our own bug');
});

Deno.test('runner: mayContinue=false stops before the fallback provider', async () => {
  const a = new FakeProvider({ name: 'anthropic', script: ['error'] });
  const b = new FakeProvider({ name: 'mistral' });
  const result = await runChain([a, b], PROMPT, {
    signal: new AbortController().signal,
    health: new MemoryProviderHealth(),
    timing: TIMING,
    consume: () => {},
    committed: () => false,
    restart: () => {},
    mayContinue: () => Promise.resolve(false),
  });
  assertEquals(result.status, 'stopped');
  assertEquals(b.calls.length, 0);
});
