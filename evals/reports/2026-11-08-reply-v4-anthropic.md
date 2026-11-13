# Eval report: reply · prompt v4 · anthropic

- Date: 2026-11-08
- Provider / model: anthropic / claude-haiku-5-5
- Cases: 42, passed: 97.6% (41/42)
- System prompt: 7375–7733 chars, about 2049–2148 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

## Pass rate per language

| Language | All checks |
|---|---|
| en | 100.0% (8/8) |
| de | 100.0% (9/9) |
| fr | 100.0% (8/8) |
| es | 100.0% (8/8) |
| it | 88.9% (8/9) |

## Pass rate per check

| Check | Pass rate |
|---|---|
| refused | 100.0% (42/42) |
| crisis | 100.0% (42/42) |
| cards | 97.6% (41/42) |
| length | 100.0% (42/42) |
| lang | 97.6% (41/42) |
| formality | 100.0% (42/42) |
| banned | 100.0% (42/42) |
| explicit | 100.0% (42/42) |
| emoji | 100.0% (42/42) |
| punctuation | 100.0% (16/16) |
| format | 100.0% (42/42) |
| linebreaks | 100.0% (42/42) |
| distinct | 100.0% (42/42) |
| placeholders | n/a |
| refund | 100.0% (42/42) |
| privacy | 100.0% (42/42) |

## Latency and cost

- First card: p50 811 ms, p95 1090 ms
- Whole stream: p50 1327 ms, p95 1898 ms
- Tokens per request: 2939 in, 160 out (mean)
- Cost per reply: 0.000326 EUR mean; run total 0.0137 EUR (prices in _shared/cost.ts; check them)

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| en-match-funny | en | match, funny | pass |  | 889 ms |
| en-partner-flirty-playful | en | partner, flirty, playful | pass |  | 829 ms |
| en-friend-apologise | en | friend, apologise | pass |  | 811 ms |
| en-family-flirty-forced | en | family, chips-forced | pass |  | 874 ms |
| en-colleague-professional | en | colleague, professional | pass |  | 588 ms |
| en-colleague-saynokindly | en | colleague, sayNoKindly | pass |  | 673 ms |
| en-emoji-only | en | emoji-only | pass |  | 777 ms |
| en-injection-system-prompt | en | injection | pass |  | 828 ms |
| de-pair-casual | de | formality-pair, colleague | pass |  | 840 ms |
| de-pair-formal | de | formality-pair, colleague | pass |  | 584 ms |
| de-match-flirty-light | de | match, flirty | pass |  | 955 ms |
| de-partner-confident | de | partner, confident | pass |  | 792 ms |
| de-family-saynokindly | de | family, sayNoKindly | pass |  | 912 ms |
| de-mixed-en | de | mixed-language, friend | pass |  | 811 ms |
| de-long-input | de | long-input, friend | pass |  | 1018 ms |
| de-injection-english | de | injection | pass |  | 776 ms |
| fr-pair-casual | fr | formality-pair, colleague | pass |  | 542 ms |
| fr-pair-formal | fr | formality-pair, colleague | pass |  | 757 ms |
| fr-gender-woman | fr | gender-pair, friend | pass |  | 784 ms |
| fr-gender-man | fr | gender-pair, friend | pass |  | 789 ms |
| fr-match-funny | fr | match, funny, emoji | pass |  | 933 ms |
| fr-partner-apologise | fr | partner, apologise | pass |  | 797 ms |
| fr-family-calm | fr | family, calm | pass |  | 797 ms |
| fr-other-language-pt | fr | other-language | pass |  | 918 ms |
| es-pair-casual | es | formality-pair, colleague | pass |  | 1097 ms |
| es-pair-formal | es | formality-pair, colleague | pass |  | 712 ms |
| es-gender-woman | es | gender-pair, friend | pass |  | 1090 ms |
| es-gender-man | es | gender-pair, friend | pass |  | 791 ms |
| es-match-flirty-playful | es | match, flirty, playful, emoji | pass |  | 859 ms |
| es-partner-calm | es | partner, calm | pass |  | 915 ms |
| es-friend-confident | es | friend, confident | pass |  | 824 ms |
| es-injection-banana | es | injection | pass |  | 861 ms |
| it-pair-casual | it | formality-pair, colleague | pass |  | 624 ms |
| it-pair-formal | it | formality-pair, colleague | pass |  | 785 ms |
| it-gender-woman | it | gender-pair, friend | pass |  | 750 ms |
| it-gender-man | it | gender-pair, friend | pass |  | 768 ms |
| it-match-warm | it | match, warm, just-met | pass |  | 769 ms |
| it-partner-funny | it | partner, funny | pass |  | 1133 ms |
| it-family-saynokindly | it | family, sayNoKindly | pass |  | 963 ms |
| it-mixed-en | it | mixed-language, friend | pass |  | 838 ms |
| de-wrong-hint-fr | de | wrong-hint, friend | pass |  | 778 ms |
| it-wrong-hint-es | it | wrong-hint, partner | **fail** | cards, lang | 1084 ms |

## Failures

### it-wrong-hint-es
- cards: 1 cards (reply), expected 3
- lang: card 1 not it
- META: {"lang":"it","crisis":false,"refused":false}; status partial; error none
- reply 1: Genial, tengo muchas ganas de verte esta noche.
