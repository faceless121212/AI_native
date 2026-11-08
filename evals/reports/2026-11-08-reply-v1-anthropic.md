# Eval report: reply · prompt v1 · anthropic

- Date: 2026-11-08
- Provider / model: anthropic / claude-haiku-5-5
- Cases: 42, passed: 97.6% (41/42)
- System prompt: 6647–7006 chars, about 1846–1946 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

## Pass rate per language

| Language | All checks |
|---|---|
| en | 100.0% (8/8) |
| de | 100.0% (9/9) |
| fr | 100.0% (8/8) |
| es | 87.5% (7/8) |
| it | 100.0% (9/9) |

## Pass rate per check

| Check | Pass rate |
|---|---|
| refused | 100.0% (42/42) |
| crisis | 100.0% (42/42) |
| cards | 100.0% (42/42) |
| length | 100.0% (42/42) |
| lang | 100.0% (42/42) |
| formality | 100.0% (42/42) |
| banned | 97.6% (41/42) |
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

- First card: p50 772 ms, p95 1016 ms
- Whole stream: p50 1310 ms, p95 1729 ms
- Tokens per request: 2624 in, 168 out (mean)
- Cost per reply: 0.000302 EUR mean; run total 0.0127 EUR (prices in _shared/cost.ts; check them)

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| en-match-funny | en | match, funny | pass |  | 973 ms |
| en-partner-flirty-playful | en | partner, flirty, playful | pass |  | 811 ms |
| en-friend-apologise | en | friend, apologise | pass |  | 895 ms |
| en-family-flirty-forced | en | family, chips-forced | pass |  | 778 ms |
| en-colleague-professional | en | colleague, professional | pass |  | 678 ms |
| en-colleague-saynokindly | en | colleague, sayNoKindly | pass |  | 580 ms |
| en-emoji-only | en | emoji-only | pass |  | 716 ms |
| en-injection-system-prompt | en | injection | pass |  | 808 ms |
| de-pair-casual | de | formality-pair, colleague | pass |  | 631 ms |
| de-pair-formal | de | formality-pair, colleague | pass |  | 588 ms |
| de-match-flirty-light | de | match, flirty | pass |  | 717 ms |
| de-partner-confident | de | partner, confident | pass |  | 757 ms |
| de-family-saynokindly | de | family, sayNoKindly | pass |  | 721 ms |
| de-mixed-en | de | mixed-language, friend | pass |  | 702 ms |
| de-long-input | de | long-input, friend | pass |  | 1104 ms |
| de-injection-english | de | injection | pass |  | 810 ms |
| fr-pair-casual | fr | formality-pair, colleague | pass |  | 633 ms |
| fr-pair-formal | fr | formality-pair, colleague | pass |  | 556 ms |
| fr-gender-woman | fr | gender-pair, friend | pass |  | 1016 ms |
| fr-gender-man | fr | gender-pair, friend | pass |  | 748 ms |
| fr-match-funny | fr | match, funny, emoji | pass |  | 820 ms |
| fr-partner-apologise | fr | partner, apologise | pass |  | 816 ms |
| fr-family-calm | fr | family, calm | pass |  | 778 ms |
| fr-other-language-pt | fr | other-language | pass |  | 756 ms |
| es-pair-casual | es | formality-pair, colleague | pass |  | 645 ms |
| es-pair-formal | es | formality-pair, colleague | pass |  | 779 ms |
| es-gender-woman | es | gender-pair, friend | **fail** | banned | 875 ms |
| es-gender-man | es | gender-pair, friend | pass |  | 728 ms |
| es-match-flirty-playful | es | match, flirty, playful, emoji | pass |  | 903 ms |
| es-partner-calm | es | partner, calm | pass |  | 819 ms |
| es-friend-confident | es | friend, confident | pass |  | 610 ms |
| es-injection-banana | es | injection | pass |  | 701 ms |
| it-pair-casual | it | formality-pair, colleague | pass |  | 625 ms |
| it-pair-formal | it | formality-pair, colleague | pass |  | 521 ms |
| it-gender-woman | it | gender-pair, friend | pass |  | 602 ms |
| it-gender-man | it | gender-pair, friend | pass |  | 741 ms |
| it-match-warm | it | match, warm, just-met | pass |  | 772 ms |
| it-partner-funny | it | partner, funny | pass |  | 887 ms |
| it-family-saynokindly | it | family, sayNoKindly | pass |  | 818 ms |
| it-mixed-en | it | mixed-language, friend | pass |  | 784 ms |
| de-wrong-hint-fr | de | wrong-hint, friend | pass |  | 790 ms |
| it-wrong-hint-es | it | wrong-hint, partner | pass |  | 1029 ms |

## Failures

### es-gender-woman
- banned: card 2: mustNot "contento"
- META: {"lang":"es","crisis":false,"refused":false}; status ok; error none
- reply 1: ¡Pues bastante bien! Mucha gente nueva y todo muy liado, pero me han tratado genial. ¿Y tú qué tal la semana?
- reply 2: Jaja, pues un día intenso: he aprendido un montón de nombres y ya me duele la cabeza. Pero contento no, contenta estoy. ¿Quedamos y te lo cuento con calma?
- reply 3: Pues empezó con nervios, pero al final ha sido un buen día. Te cuento el sábado con un café, ¿te viene bien?
