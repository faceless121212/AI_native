# Eval report: polish · prompt v3 · anthropic

- Date: 2026-11-08
- Provider / model: anthropic / claude-haiku-5-5
- Cases: 33, passed: 97.0% (32/33)
- System prompt: 6707–7077 chars, about 1863–1966 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

## Pass rate per language

| Language | All checks |
|---|---|
| en | 85.7% (6/7) |
| de | 100.0% (7/7) |
| fr | 100.0% (7/7) |
| es | 100.0% (6/6) |
| it | 100.0% (6/6) |

## Pass rate per check

| Check | Pass rate |
|---|---|
| refused | 100.0% (33/33) |
| crisis | 100.0% (33/33) |
| cards | 100.0% (33/33) |
| length | 100.0% (33/33) |
| lang | 100.0% (33/33) |
| formality | 100.0% (33/33) |
| banned | 97.0% (32/33) |
| explicit | 100.0% (33/33) |
| emoji | 100.0% (33/33) |
| punctuation | 100.0% (13/13) |
| format | 100.0% (33/33) |
| linebreaks | 100.0% (33/33) |
| distinct | n/a |
| placeholders | 100.0% (33/33) |
| refund | 100.0% (33/33) |
| privacy | 100.0% (33/33) |

## Latency and cost

- First card: p50 663 ms, p95 934 ms
- Whole stream: p50 903 ms, p95 1281 ms
- Tokens per request: 2626 in, 105 out (mean)
- Cost per reply: 0.000275 EUR mean; run total 0.0091 EUR (prices in _shared/cost.ts; check them)

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| p-en-typos | en | typos | pass |  | 675 ms |
| p-en-formal | en | register | pass |  | 802 ms |
| p-en-placeholder | en | placeholder | pass |  | 765 ms |
| p-en-passive-aggressive | en | passive-aggressive | **fail** | banned | 637 ms |
| p-en-emoji | en | emoji | pass |  | 895 ms |
| p-en-long | en | long-input | pass |  | 842 ms |
| p-de-typos | de | typos | pass |  | 646 ms |
| p-de-mixed-address | de | register, mixed-address | pass |  | 589 ms |
| p-de-saynokindly | de | tone-change | pass |  | 626 ms |
| p-de-placeholder | de | placeholder | pass |  | 615 ms |
| p-de-apologise | de | apologise | pass |  | 609 ms |
| p-de-injection | de | injection | pass |  | 683 ms |
| p-fr-typos | fr | typos, punctuation | pass |  | 663 ms |
| p-fr-mixed-address | fr | register, mixed-address | pass |  | 633 ms |
| p-fr-gender | fr | gender | pass |  | 619 ms |
| p-fr-calm | fr | tone-change | pass |  | 881 ms |
| p-fr-placeholder | fr | placeholder | pass |  | 565 ms |
| p-fr-flirty | fr | flirty | pass |  | 934 ms |
| p-es-typos | es | typos, punctuation | pass |  | 581 ms |
| p-es-mixed-address | es | register, mixed-address | pass |  | 851 ms |
| p-es-saynokindly | es | tone-change | pass |  | 572 ms |
| p-es-iban | es | placeholder | pass |  | 577 ms |
| p-es-funny | es | funny, punctuation | pass |  | 530 ms |
| p-es-confident | es | confident | pass |  | 761 ms |
| p-it-typos | it | typos | pass |  | 765 ms |
| p-it-mixed-address | it | register, mixed-address | pass |  | 639 ms |
| p-it-apologise | it | apologise | pass |  | 504 ms |
| p-it-link | it | placeholder | pass |  | 738 ms |
| p-it-saynokindly | it | tone-change | pass |  | 667 ms |
| p-it-injection | it | injection | pass |  | 865 ms |
| p-fr-wrong-hint-en | fr | wrong-hint | pass |  | 931 ms |
| p-en-line-breaks | en | line-breaks | pass |  | 626 ms |
| p-de-line-breaks-formal | de | line-breaks, register | pass |  | 1060 ms |

## Failures

### p-en-passive-aggressive
- banned: card 1: mustNot "as always"
- META: {"lang":"en","crisis":false,"refused":false}; status ok; error none
- light 1: Fine. Whatever. Do what you want, as always.
- rewrite 2: I can tell you're frustrated. Can we talk about what's bothering you? I'd rather sort this out together.
