# Eval report: polish · prompt v3 · fake

- Date: 2026-11-08
- Provider / model: fake / fake-v1
- Cases: 33, passed: 100.0% (33/33)
- Passed on plumbing checks: 100.0% (33/33)
- System prompt: 6707–7077 chars, about 1863–1966 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

> **Fake provider: this report does not measure reply quality.** The fake returns canned lines per language and formality. It verifies the runner, the pipeline (META-first parsing, post-check, refusal refund, no message or card text in the in-memory store or console output) and, for crisis cases, the deterministic keyword backstop in `_shared/crisis.ts`. Quality numbers need `--provider anthropic|bedrock|mistral`.

## Pass rate per language

| Language | All checks | Plumbing checks only |
|---|---|---|
| en | 100.0% (7/7) | 100.0% (7/7) |
| de | 100.0% (7/7) | 100.0% (7/7) |
| fr | 100.0% (7/7) | 100.0% (7/7) |
| es | 100.0% (6/6) | 100.0% (6/6) |
| it | 100.0% (6/6) | 100.0% (6/6) |

Plumbing checks (refused, crisis, cards, lang, linebreaks, refund, privacy) test real code with the fake; the other checks run on canned lines; those a canned line can't satisfy (polish placeholders, META.lang outside lang-<xx> scenarios) are skipped.

## Pass rate per check

| Check | Pass rate | Meaningful with the fake provider? |
|---|---|---|
| refused | 100.0% (33/33) | plumbing only (scenario "refused" forced by the case) |
| crisis | 100.0% (33/33) | yes for crisis cases: scenario "crisis-nometa" leaves the flag to the crisis.ts keyword backstop |
| cards | 100.0% (33/33) | plumbing only (parser, post-check, META-first order) |
| length | 100.0% (33/33) | no (canned lines) |
| lang | 100.0% (33/33) | plumbing only: fake answers in the hinted language; wrong-hint cases (lang-<xx> scenario) check that cards in the message language survive the post-check via META.lang |
| formality | 100.0% (33/33) | no (canned lines per formality); checker itself is unit-tested |
| banned | 100.0% (33/33) | no (canned lines); lists are unit-tested |
| explicit | 100.0% (33/33) | no (canned lines); lists are unit-tested |
| emoji | 100.0% (33/33) | no (canned lines) |
| punctuation | 100.0% (13/13) | no (canned lines) |
| format | 100.0% (33/33) | no (canned lines) |
| linebreaks | 100.0% (33/33) | plumbing only: the "multiline" scenario checks that escaped \n breaks survive the parser, post-check and SSE as real newlines (Polish) and are flattened in replies; checker itself is unit-tested |
| distinct | n/a | no (canned lines) |
| placeholders | n/a | skipped with the fake (canned lines cannot keep placeholders); real check for live providers |
| refund | 100.0% (33/33) | yes (real pipeline + in-memory quota) |
| privacy | 100.0% (33/33) | yes, within scope: the in-memory store and all console output during the request contain no input (original or redacted) or card text; crisis only as an anonymous count. Does not cover Postgres, Sentry or PostHog |

## Latency and cost

- First card: p50 1 ms, p95 58 ms
- Whole stream: p50 2 ms, p95 58 ms
- Tokens per request: 1808 in, 51 out (mean)
- Cost per reply: 0.000000 EUR mean; run total 0.0000 EUR (prices in _shared/cost.ts; check them)
- Fake provider: latency is in-process only and cost is 0; neither says anything about a real model.

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| p-en-typos | en | typos | pass |  | 74 ms |
| p-en-formal | en | register | pass |  | 2 ms |
| p-en-placeholder | en | placeholder | pass |  | 3 ms |
| p-en-passive-aggressive | en | passive-aggressive | pass |  | 1 ms |
| p-en-emoji | en | emoji | pass |  | 58 ms |
| p-en-long | en | long-input | pass |  | 2 ms |
| p-de-typos | de | typos | pass |  | 2 ms |
| p-de-mixed-address | de | register, mixed-address | pass |  | 2 ms |
| p-de-saynokindly | de | tone-change | pass |  | 1 ms |
| p-de-placeholder | de | placeholder | pass |  | 1 ms |
| p-de-apologise | de | apologise | pass |  | 1 ms |
| p-de-injection | de | injection | pass |  | 1 ms |
| p-fr-typos | fr | typos, punctuation | pass |  | 1 ms |
| p-fr-mixed-address | fr | register, mixed-address | pass |  | 2 ms |
| p-fr-gender | fr | gender | pass |  | 1 ms |
| p-fr-calm | fr | tone-change | pass |  | 2 ms |
| p-fr-placeholder | fr | placeholder | pass |  | 1 ms |
| p-fr-flirty | fr | flirty | pass |  | 1 ms |
| p-es-typos | es | typos, punctuation | pass |  | 1 ms |
| p-es-mixed-address | es | register, mixed-address | pass |  | 1 ms |
| p-es-saynokindly | es | tone-change | pass |  | 1 ms |
| p-es-iban | es | placeholder | pass |  | 2 ms |
| p-es-funny | es | funny, punctuation | pass |  | 1 ms |
| p-es-confident | es | confident | pass |  | 1 ms |
| p-it-typos | it | typos | pass |  | 1 ms |
| p-it-mixed-address | it | register, mixed-address | pass |  | 1 ms |
| p-it-apologise | it | apologise | pass |  | 1 ms |
| p-it-link | it | placeholder | pass |  | 1 ms |
| p-it-saynokindly | it | tone-change | pass |  | 1 ms |
| p-it-injection | it | injection | pass |  | 1 ms |
| p-fr-wrong-hint-en | fr | wrong-hint | pass |  | 1 ms |
| p-en-line-breaks | en | line-breaks | pass |  | 1 ms |
| p-de-line-breaks-formal | de | line-breaks, register | pass |  | 2 ms |
