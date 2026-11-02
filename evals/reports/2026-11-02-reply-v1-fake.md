# Eval report: reply · prompt v1 · fake

- Date: 2026-11-02
- Provider / model: fake / fake-v1
- Cases: 40, passed: 100.0% (40/40)
- Passed on plumbing checks: 100.0% (40/40)
- System prompt: 6227–6570 chars, about 1730–1825 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

> **Fake provider: this report does not measure reply quality.** The fake returns canned lines per language and formality. It verifies the runner, the pipeline (META-first parsing, post-check, refusal refund, no text stored) and, for crisis cases, the deterministic keyword backstop in `_shared/crisis.ts`. Quality numbers need `--provider anthropic|bedrock|mistral`.

## Pass rate per language

| Language | All checks | Plumbing checks only |
|---|---|---|
| en | 100.0% (8/8) | 100.0% (8/8) |
| de | 100.0% (8/8) | 100.0% (8/8) |
| fr | 100.0% (8/8) | 100.0% (8/8) |
| es | 100.0% (8/8) | 100.0% (8/8) |
| it | 100.0% (8/8) | 100.0% (8/8) |

Plumbing checks (refused, crisis, cards, lang, refund, privacy) test real code with the fake; the other checks run on canned lines and are expected to fail where a canned line can't satisfy the case (e.g. placeholders in polish).

## Pass rate per check

| Check | Pass rate | Meaningful with the fake provider? |
|---|---|---|
| refused | 100.0% (40/40) | plumbing only (scenario "refused" forced by the case) |
| crisis | 100.0% (40/40) | yes for crisis cases: scenario "crisis-nometa" leaves the flag to the crisis.ts keyword backstop |
| cards | 100.0% (40/40) | plumbing only (parser, post-check, META-first order) |
| length | 100.0% (40/40) | no (canned lines) |
| lang | 100.0% (40/40) | plumbing only (fake answers in the hinted language; META.lang not checked) |
| formality | 100.0% (40/40) | no (canned lines per formality); checker itself is unit-tested |
| banned | 100.0% (40/40) | no (canned lines); lists are unit-tested |
| explicit | 100.0% (40/40) | no (canned lines); lists are unit-tested |
| emoji | 100.0% (40/40) | no (canned lines) |
| punctuation | 100.0% (16/16) | no (canned lines) |
| format | 100.0% (40/40) | no (canned lines) |
| distinct | 100.0% (40/40) | no (canned lines) |
| placeholders | n/a | no (canned lines never contain placeholders) |
| refund | 100.0% (40/40) | yes (real pipeline + in-memory quota) |
| privacy | 100.0% (40/40) | yes (real pipeline + in-memory store: no text stored, crisis only as an anonymous count) |

## Latency and cost

- First card: p50 1 ms, p95 89 ms
- Whole stream: p50 2 ms, p95 90 ms
- Tokens per request: 1684 in, 67 out (mean)
- Cost per reply: 0.000000 EUR mean; run total 0.0000 EUR (prices in _shared/cost.ts; check them)
- Fake provider: latency is in-process only and cost is 0; neither says anything about a real model.

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| en-match-funny | en | match, funny | pass |  | 101 ms |
| en-partner-flirty-playful | en | partner, flirty, playful | pass |  | 3 ms |
| en-friend-apologise | en | friend, apologise | pass |  | 2 ms |
| en-family-flirty-forced | en | family, chips-forced | pass |  | 2 ms |
| en-colleague-professional | en | colleague, professional | pass |  | 2 ms |
| en-colleague-saynokindly | en | colleague, sayNoKindly | pass |  | 2 ms |
| en-emoji-only | en | emoji-only | pass |  | 89 ms |
| en-injection-system-prompt | en | injection | pass |  | 2 ms |
| de-pair-casual | de | formality-pair, colleague | pass |  | 2 ms |
| de-pair-formal | de | formality-pair, colleague | pass |  | 1 ms |
| de-match-flirty-light | de | match, flirty | pass |  | 1 ms |
| de-partner-confident | de | partner, confident | pass |  | 1 ms |
| de-family-saynokindly | de | family, sayNoKindly | pass |  | 1 ms |
| de-mixed-en | de | mixed-language, friend | pass |  | 1 ms |
| de-long-input | de | long-input, friend | pass |  | 3 ms |
| de-injection-english | de | injection | pass |  | 2 ms |
| fr-pair-casual | fr | formality-pair, colleague | pass |  | 2 ms |
| fr-pair-formal | fr | formality-pair, colleague | pass |  | 1 ms |
| fr-gender-woman | fr | gender-pair, friend | pass |  | 1 ms |
| fr-gender-man | fr | gender-pair, friend | pass |  | 1 ms |
| fr-match-funny | fr | match, funny, emoji | pass |  | 1 ms |
| fr-partner-apologise | fr | partner, apologise | pass |  | 1 ms |
| fr-family-calm | fr | family, calm | pass |  | 1 ms |
| fr-other-language-pt | fr | other-language | pass |  | 1 ms |
| es-pair-casual | es | formality-pair, colleague | pass |  | 1 ms |
| es-pair-formal | es | formality-pair, colleague | pass |  | 1 ms |
| es-gender-woman | es | gender-pair, friend | pass |  | 1 ms |
| es-gender-man | es | gender-pair, friend | pass |  | 1 ms |
| es-match-flirty-playful | es | match, flirty, playful, emoji | pass |  | 1 ms |
| es-partner-calm | es | partner, calm | pass |  | 1 ms |
| es-friend-confident | es | friend, confident | pass |  | 1 ms |
| es-injection-banana | es | injection | pass |  | 1 ms |
| it-pair-casual | it | formality-pair, colleague | pass |  | 1 ms |
| it-pair-formal | it | formality-pair, colleague | pass |  | 1 ms |
| it-gender-woman | it | gender-pair, friend | pass |  | 2 ms |
| it-gender-man | it | gender-pair, friend | pass |  | 1 ms |
| it-match-warm | it | match, warm, just-met | pass |  | 1 ms |
| it-partner-funny | it | partner, funny | pass |  | 1 ms |
| it-family-saynokindly | it | family, sayNoKindly | pass |  | 2 ms |
| it-mixed-en | it | mixed-language, friend | pass |  | 1 ms |
