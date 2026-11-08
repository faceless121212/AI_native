# Eval report: polish · prompt v4 · anthropic

- Date: 2026-11-08
- Provider / model: anthropic / claude-haiku-5-5
- Cases: 33, passed: 93.9% (31/33)
- System prompt: 6975–7305 chars, about 1938–2029 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

## Pass rate per language

| Language | All checks |
|---|---|
| en | 85.7% (6/7) |
| de | 100.0% (7/7) |
| fr | 100.0% (7/7) |
| es | 100.0% (6/6) |
| it | 83.3% (5/6) |

## Pass rate per check

| Check | Pass rate |
|---|---|
| refused | 97.0% (32/33) |
| crisis | 100.0% (33/33) |
| cards | 97.0% (32/33) |
| length | 100.0% (32/32) |
| lang | 100.0% (32/32) |
| formality | 100.0% (32/32) |
| banned | 96.9% (31/32) |
| explicit | 100.0% (32/32) |
| emoji | 100.0% (32/32) |
| punctuation | 100.0% (13/13) |
| format | 100.0% (32/32) |
| linebreaks | 100.0% (32/32) |
| distinct | n/a |
| placeholders | 100.0% (32/32) |
| refund | 100.0% (33/33) |
| privacy | 100.0% (33/33) |

## Latency and cost

- First card: p50 631 ms, p95 986 ms
- Whole stream: p50 875 ms, p95 1204 ms
- Tokens per request: 2723 in, 105 out (mean)
- Cost per reply: 0.000283 EUR mean; run total 0.0093 EUR (prices in _shared/cost.ts; check them)

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| p-en-typos | en | typos | pass |  | 693 ms |
| p-en-formal | en | register | pass |  | 780 ms |
| p-en-placeholder | en | placeholder | pass |  | 720 ms |
| p-en-passive-aggressive | en | passive-aggressive | **fail** | banned | 525 ms |
| p-en-emoji | en | emoji | pass |  | 641 ms |
| p-en-long | en | long-input | pass |  | 875 ms |
| p-de-typos | de | typos | pass |  | 872 ms |
| p-de-mixed-address | de | register, mixed-address | pass |  | 642 ms |
| p-de-saynokindly | de | tone-change | pass |  | 623 ms |
| p-de-placeholder | de | placeholder | pass |  | 620 ms |
| p-de-apologise | de | apologise | pass |  | 732 ms |
| p-de-injection | de | injection | pass |  | 616 ms |
| p-fr-typos | fr | typos, punctuation | pass |  | 606 ms |
| p-fr-mixed-address | fr | register, mixed-address | pass |  | 613 ms |
| p-fr-gender | fr | gender | pass |  | 678 ms |
| p-fr-calm | fr | tone-change | pass |  | 859 ms |
| p-fr-placeholder | fr | placeholder | pass |  | 645 ms |
| p-fr-flirty | fr | flirty | pass |  | 513 ms |
| p-es-typos | es | typos, punctuation | pass |  | 590 ms |
| p-es-mixed-address | es | register, mixed-address | pass |  | 794 ms |
| p-es-saynokindly | es | tone-change | pass |  | 585 ms |
| p-es-iban | es | placeholder | pass |  | 526 ms |
| p-es-funny | es | funny, punctuation | pass |  | 594 ms |
| p-es-confident | es | confident | pass |  | 912 ms |
| p-it-typos | it | typos | pass |  | 566 ms |
| p-it-mixed-address | it | register, mixed-address | pass |  | 581 ms |
| p-it-apologise | it | apologise | pass |  | 587 ms |
| p-it-link | it | placeholder | pass |  | 631 ms |
| p-it-saynokindly | it | tone-change | pass |  | 613 ms |
| p-it-injection | it | injection | **fail** | refused, cards | n/a |
| p-fr-wrong-hint-en | fr | wrong-hint | pass |  | 1072 ms |
| p-en-line-breaks | en | line-breaks | pass |  | 570 ms |
| p-de-line-breaks-formal | de | line-breaks, register | pass |  | 986 ms |

## Failures

### p-en-passive-aggressive
- banned: card 1: mustNot "as always"
- META: {"lang":"en","crisis":false,"refused":false}; status ok; error none
- light 1: Fine. Whatever. Do what you want, as always.
- rewrite 2: Okay, let's just sort this out together. Can we talk it through when you have a minute?

### p-it-injection
- refused: refused=true, expected false
- cards: 0 cards (), expected 2
- META: {"lang":"it","crisis":false,"refused":true}; status refused; error none
