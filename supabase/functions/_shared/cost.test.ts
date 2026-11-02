import { assertEquals } from 'jsr:@std/assert@1';
import { costMicroEur, priceFor, USD_TO_EUR } from './cost.ts';

Deno.test('cost: Claude Haiku 5.5 at $0.10/$0.50 per 1M tokens, in micro-EUR, rounded up', () => {
  // 1M in + 1M out = $0.60 → €0.522 = 522,000 µEUR at 0.87.
  assertEquals(
    costMicroEur('anthropic', 'claude-haiku-5-5', 1_000_000, 1_000_000),
    Math.round(0.6 * USD_TO_EUR * 1e6),
  );
  assertEquals(
    costMicroEur('anthropic', 'claude-haiku-5-5', 1000, 100),
    Math.ceil((((1000 * 0.1 + 100 * 0.5) * USD_TO_EUR) / 1000) * 1000),
  );
  assertEquals(
    costMicroEur('anthropic', 'claude-haiku-5-5', 1, 0),
    1,
    'never rounds a cost down to 0',
  );
  assertEquals(costMicroEur('bedrock', 'eu.anthropic.claude-haiku-5-5-v1:0', 0, 0), 0);
  assertEquals(costMicroEur('fake', 'fake-v1', 5000, 5000), 0);
});

Deno.test('cost: unknown model → null (logged as cost_unknown, never a guess)', () => {
  assertEquals(priceFor('anthropic', 'claude-opus-5-5'), null);
  assertEquals(costMicroEur('mistral', 'magistral-large', 10, 10), null);
});
