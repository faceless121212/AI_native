// Per-model price table and cost in micro-EUR (ai_requests.cost_micro_eur).
// CHECK CURRENT PRICES before relying on cost reports: last checked 2026-11-02.
//  - Claude Haiku 5.5 (direct API): $0.10 / 1M input, $0.50 / 1M output tokens (2026-11-02).
//  - Bedrock EU cross-region profile: assumed equal to the direct API list price; EU profiles can
//    carry a regional premium. Check the Bedrock pricing page (2026-11-02: not verified).
//  - Mistral Small: placeholder, NOT verified (2026-11-02). Check La Plateforme pricing.
//  - USD → EUR: 0.87, check current (2026-11-02).
import type { ProviderName } from './llm/provider.ts';

export const USD_TO_EUR = 0.87;

export interface ModelPrice {
  provider: ProviderName;
  /** Matches the configured model ID (secrets can pin dated IDs). */
  model: RegExp;
  /** EUR per 1,000 tokens. */
  inputEurPer1k: number;
  outputEurPer1k: number;
}

const usdPer1M = (usd: number) => (usd / 1000) * USD_TO_EUR;

export const PRICES: readonly ModelPrice[] = [
  {
    provider: 'anthropic',
    model: /^claude-haiku-5-5(?:-\d{8})?$/,
    inputEurPer1k: usdPer1M(0.1),
    outputEurPer1k: usdPer1M(0.5),
  },
  {
    provider: 'bedrock',
    model: /^eu\.anthropic\.claude-haiku-5-5/,
    inputEurPer1k: usdPer1M(0.1),
    outputEurPer1k: usdPer1M(0.5),
  },
  {
    provider: 'mistral',
    model: /^mistral-small/,
    inputEurPer1k: usdPer1M(0.1),
    outputEurPer1k: usdPer1M(0.3),
  },
  { provider: 'fake', model: /.*/, inputEurPer1k: 0, outputEurPer1k: 0 },
];

export function priceFor(provider: ProviderName, model: string): ModelPrice | null {
  return PRICES.find((p) => p.provider === provider && p.model.test(model)) ?? null;
}

/** Cost in micro-EUR, rounded up; null when the model has no price (logged as cost_unknown). */
export function costMicroEur(
  provider: ProviderName,
  model: string,
  tokensIn: number,
  tokensOut: number,
): number | null {
  const price = priceFor(provider, model);
  if (!price) return null;
  // EUR per 1k tokens × 1e6 µEUR/EUR ÷ 1e3 tokens = × 1e3 per token.
  const micro = (tokensIn * price.inputEurPer1k + tokensOut * price.outputEurPer1k) * 1000;
  return Math.ceil(micro - 1e-9);
}
