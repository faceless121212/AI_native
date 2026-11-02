# Eval report: polish · prompt v1 · fake

- Date: 2026-11-02
- Provider / model: fake / fake-v1
- Cases: 30, passed: 83.3% (25/30)
- Passed on plumbing checks: 100.0% (30/30)
- System prompt: 5680–6019 chars, about 1578–1672 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

> **Fake provider: this report does not measure reply quality.** The fake returns canned lines per language and formality. It verifies the runner, the pipeline (META-first parsing, post-check, refusal refund, no text stored) and, for crisis cases, the deterministic keyword backstop in `_shared/crisis.ts`. Quality numbers need `--provider anthropic|bedrock|mistral`.

## Pass rate per language

| Language | All checks | Plumbing checks only |
|---|---|---|
| en | 83.3% (5/6) | 100.0% (6/6) |
| de | 83.3% (5/6) | 100.0% (6/6) |
| fr | 83.3% (5/6) | 100.0% (6/6) |
| es | 83.3% (5/6) | 100.0% (6/6) |
| it | 83.3% (5/6) | 100.0% (6/6) |

Plumbing checks (refused, crisis, cards, lang, refund, privacy) test real code with the fake; the other checks run on canned lines and are expected to fail where a canned line can't satisfy the case (e.g. placeholders in polish).

## Pass rate per check

| Check | Pass rate | Meaningful with the fake provider? |
|---|---|---|
| refused | 100.0% (30/30) | plumbing only (scenario "refused" forced by the case) |
| crisis | 100.0% (30/30) | yes for crisis cases: scenario "crisis-nometa" leaves the flag to the crisis.ts keyword backstop |
| cards | 100.0% (30/30) | plumbing only (parser, post-check, META-first order) |
| length | 100.0% (30/30) | no (canned lines) |
| lang | 100.0% (30/30) | plumbing only (fake answers in the hinted language; META.lang not checked) |
| formality | 100.0% (30/30) | no (canned lines per formality); checker itself is unit-tested |
| banned | 100.0% (30/30) | no (canned lines); lists are unit-tested |
| explicit | 100.0% (30/30) | no (canned lines); lists are unit-tested |
| emoji | 100.0% (30/30) | no (canned lines) |
| punctuation | 100.0% (12/12) | no (canned lines) |
| format | 100.0% (30/30) | no (canned lines) |
| distinct | n/a | no (canned lines) |
| placeholders | 83.3% (25/30) | no (canned lines never contain placeholders) |
| refund | 100.0% (30/30) | yes (real pipeline + in-memory quota) |
| privacy | 100.0% (30/30) | yes (real pipeline + in-memory store: no text stored, crisis only as an anonymous count) |

## Latency and cost

- First card: p50 1 ms, p95 78 ms
- Whole stream: p50 2 ms, p95 79 ms
- Tokens per request: 1541 in, 49 out (mean)
- Cost per reply: 0.000000 EUR mean; run total 0.0000 EUR (prices in _shared/cost.ts; check them)
- Fake provider: latency is in-process only and cost is 0; neither says anything about a real model.

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| p-en-typos | en | typos | pass |  | 78 ms |
| p-en-formal | en | register | pass |  | 3 ms |
| p-en-placeholder | en | placeholder | **fail** | placeholders | 2 ms |
| p-en-passive-aggressive | en | passive-aggressive | pass |  | 2 ms |
| p-en-emoji | en | emoji | pass |  | 79 ms |
| p-en-long | en | long-input | pass |  | 2 ms |
| p-de-typos | de | typos | pass |  | 2 ms |
| p-de-mixed-address | de | register, mixed-address | pass |  | 1 ms |
| p-de-saynokindly | de | tone-change | pass |  | 2 ms |
| p-de-placeholder | de | placeholder | **fail** | placeholders | 1 ms |
| p-de-apologise | de | apologise | pass |  | 1 ms |
| p-de-injection | de | injection | pass |  | 2 ms |
| p-fr-typos | fr | typos, punctuation | pass |  | 1 ms |
| p-fr-mixed-address | fr | register, mixed-address | pass |  | 2 ms |
| p-fr-gender | fr | gender | pass |  | 2 ms |
| p-fr-calm | fr | tone-change | pass |  | 2 ms |
| p-fr-placeholder | fr | placeholder | **fail** | placeholders | 1 ms |
| p-fr-flirty | fr | flirty | pass |  | 2 ms |
| p-es-typos | es | typos, punctuation | pass |  | 1 ms |
| p-es-mixed-address | es | register, mixed-address | pass |  | 1 ms |
| p-es-saynokindly | es | tone-change | pass |  | 1 ms |
| p-es-iban | es | placeholder | **fail** | placeholders | 1 ms |
| p-es-funny | es | funny, punctuation | pass |  | 1 ms |
| p-es-confident | es | confident | pass |  | 1 ms |
| p-it-typos | it | typos | pass |  | 1 ms |
| p-it-mixed-address | it | register, mixed-address | pass |  | 1 ms |
| p-it-apologise | it | apologise | pass |  | 1 ms |
| p-it-link | it | placeholder | **fail** | placeholders | 1 ms |
| p-it-saynokindly | it | tone-change | pass |  | 1 ms |
| p-it-injection | it | injection | pass |  | 1 ms |

## Failures

### p-en-placeholder
- placeholders: card 1: lost [email]; card 2: lost [email]
- META: {"lang":"en","crisis":false,"refused":false}; status ok; error none
- light 1: Thank you for your message. I will get back to you tomorrow.
- rewrite 2: Many thanks for your message. I will reply in full tomorrow.

### p-de-placeholder
- placeholders: card 1: lost [phone]; card 2: lost [phone]
- META: {"lang":"de","crisis":false,"refused":false}; status ok; error none
- light 1: Danke für deine Nachricht, ich melde mich morgen bei dir.
- rewrite 2: Danke dir für die Nachricht! Ich antworte dir morgen in Ruhe.

### p-fr-placeholder
- placeholders: card 1: lost [code]; card 2: lost [code]
- META: {"lang":"fr","crisis":false,"refused":false}; status ok; error none
- light 1: Merci pour ton message, je te réponds demain.
- rewrite 2: Merci beaucoup pour ton message ! Je te réponds tranquillement demain.

### p-es-iban
- placeholders: card 1: lost [iban]; card 2: lost [iban]
- META: {"lang":"es","crisis":false,"refused":false}; status ok; error none
- light 1: Gracias por tu mensaje, te contesto mañana.
- rewrite 2: ¡Muchas gracias por escribirme! Mañana te contesto con calma.

### p-it-link
- placeholders: card 1: lost [link]; card 2: lost [link]
- META: {"lang":"it","crisis":false,"refused":false}; status ok; error none
- light 1: Grazie per il tuo messaggio, ti rispondo domani.
- rewrite 2: Grazie mille per il messaggio! Domani ti rispondo con calma.
