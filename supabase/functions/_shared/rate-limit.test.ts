import { assertEquals } from 'jsr:@std/assert@1';
import { RateLimiter } from './rate-limit.ts';

Deno.test('rate limit: 20 per minute per user, sliding window, Retry-After seconds', () => {
  let now = 0;
  const limiter = new RateLimiter(20, 60_000, () => now);
  for (let i = 0; i < 20; i++) {
    now = i * 1000;
    assertEquals(limiter.hit('a'), 0);
  }
  now = 30_000;
  assertEquals(limiter.hit('a'), 30, '21st waits until the first hit leaves the window');
  assertEquals(limiter.hit('b'), 0, 'other users unaffected');
  now = 60_001;
  assertEquals(limiter.hit('a'), 0);
});
