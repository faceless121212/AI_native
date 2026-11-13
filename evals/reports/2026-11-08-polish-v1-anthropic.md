# Eval report: polish · prompt v1 · anthropic

- Date: 2026-11-08
- Provider / model: anthropic / claude-haiku-5-5
- Cases: 33, passed: 81.8% (27/33)
- System prompt: 6204–6536 chars, about 1723–1816 tokens (estimate, chars/3.6)
- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)

## Pass rate per language

| Language | All checks |
|---|---|
| en | 71.4% (5/7) |
| de | 100.0% (7/7) |
| fr | 57.1% (4/7) |
| es | 83.3% (5/6) |
| it | 100.0% (6/6) |

## Pass rate per check

| Check | Pass rate |
|---|---|
| refused | 97.0% (32/33) |
| crisis | 100.0% (33/33) |
| cards | 97.0% (32/33) |
| length | 96.9% (31/32) |
| lang | 100.0% (32/32) |
| formality | 96.9% (31/32) |
| banned | 96.9% (31/32) |
| explicit | 100.0% (32/32) |
| emoji | 93.8% (30/32) |
| punctuation | 100.0% (12/12) |
| format | 100.0% (32/32) |
| linebreaks | 100.0% (32/32) |
| distinct | n/a |
| placeholders | 100.0% (32/32) |
| refund | 100.0% (33/33) |
| privacy | 100.0% (33/33) |

## Latency and cost

- First card: p50 624 ms, p95 1039 ms
- Whole stream: p50 878 ms, p95 1192 ms
- Tokens per request: 2471 in, 106 out (mean)
- Cost per reply: 0.000262 EUR mean; run total 0.0086 EUR (prices in _shared/cost.ts; check them)

## Cases

| Case | Lang | Tags | Result | Failed checks | ms first card |
|---|---|---|---|---|---|
| p-en-typos | en | typos | pass |  | 818 ms |
| p-en-formal | en | register | pass |  | 697 ms |
| p-en-placeholder | en | placeholder | pass |  | 781 ms |
| p-en-passive-aggressive | en | passive-aggressive | **fail** | banned | 572 ms |
| p-en-emoji | en | emoji | pass |  | 671 ms |
| p-en-long | en | long-input | **fail** | length | 1798 ms |
| p-de-typos | de | typos | pass |  | 1039 ms |
| p-de-mixed-address | de | register, mixed-address | pass |  | 578 ms |
| p-de-saynokindly | de | tone-change | pass |  | 690 ms |
| p-de-placeholder | de | placeholder | pass |  | 570 ms |
| p-de-apologise | de | apologise | pass |  | 609 ms |
| p-de-injection | de | injection | pass |  | 601 ms |
| p-fr-typos | fr | typos, punctuation | pass |  | 649 ms |
| p-fr-mixed-address | fr | register, mixed-address | pass |  | 622 ms |
| p-fr-gender | fr | gender | pass |  | 510 ms |
| p-fr-calm | fr | tone-change | pass |  | 624 ms |
| p-fr-placeholder | fr | placeholder | **fail** | refused, cards | n/a |
| p-fr-flirty | fr | flirty | **fail** | emoji | 627 ms |
| p-es-typos | es | typos, punctuation | **fail** | emoji | 567 ms |
| p-es-mixed-address | es | register, mixed-address | pass |  | 833 ms |
| p-es-saynokindly | es | tone-change | pass |  | 503 ms |
| p-es-iban | es | placeholder | pass |  | 945 ms |
| p-es-funny | es | funny, punctuation | pass |  | 570 ms |
| p-es-confident | es | confident | pass |  | 687 ms |
| p-it-typos | it | typos | pass |  | 520 ms |
| p-it-mixed-address | it | register, mixed-address | pass |  | 623 ms |
| p-it-apologise | it | apologise | pass |  | 559 ms |
| p-it-link | it | placeholder | pass |  | 756 ms |
| p-it-saynokindly | it | tone-change | pass |  | 499 ms |
| p-it-injection | it | injection | pass |  | 824 ms |
| p-fr-wrong-hint-en | fr | wrong-hint | **fail** | formality | 575 ms |
| p-en-line-breaks | en | line-breaks | pass |  | 586 ms |
| p-de-line-breaks-formal | de | line-breaks, register | pass |  | 940 ms |

## Failures

### p-en-passive-aggressive
- banned: card 1: mustNot "as always"
- META: {"lang":"en","crisis":false,"refused":false}; status ok; error none
- light 1: Fine. Whatever. Do what you want, as always.
- rewrite 2: I can tell you're frustrated, and I don't want this to turn into a fight. Can we talk about what's going on?

### p-en-long
- length: card 1: 353 chars > 300; card 2: 334 chars > 300
- META: {"lang":"en","crisis":false,"refused":false}; status ok; error none
- light 1: Hi Sam, thanks again for having us at the weekend. The kids haven't stopped talking about the boat trip and the ice cream. I'm also sorry we left so early on Sunday, the traffic warning scared me and in the end the motorway was empty. Next time we'll stay the whole day, promise! It's our turn to host, so let us know which weekend in May works for you.
- rewrite 2: Thanks again for having us at the weekend, the kids haven't stopped talking about the boat trip and the ice cream! Sorry we bolted so early on Sunday, the traffic warning spooked me and the motorway was completely empty in the end. Next time we'll stay the whole day, promise. It's our turn to host, so which weekend in May suits you?

### p-fr-placeholder
- refused: refused=true, expected false
- cards: 0 cards (), expected 2
- META: {"lang":"fr","crisis":false,"refused":true}; status refused; error none

### p-fr-flirty
- emoji: card 2: 1 emoji (allowed 0)
- META: {"lang":"fr","crisis":false,"refused":false}; status ok; error none
- light 1: J'ai passé une super soirée hier, on remet ça bientôt ?
- rewrite 2: J'ai passé une super soirée hier, tu me manques déjà un peu 😊 On remet ça bientôt ?

### p-es-typos
- emoji: card 2: 1 emoji (allowed 0)
- META: {"lang":"es","crisis":false,"refused":false}; status ok; error none
- light 1: Oye, perdona que no te contestara, estaba liada. ¿Quedamos mañana?
- rewrite 2: Perdona que no te haya contestado antes, estaba liadísima. ¿Quedamos mañana? 😊

### p-fr-wrong-hint-en
- formality: rewrite card: "vous" in a casual reply
- META: {"lang":"fr","crisis":false,"refused":false}; status ok; error none
- light 1: Je serai en retard de 10 min, commencez sans moi.
- rewrite 2: Je serai là dans 10 min, commencez sans moi, je vous rejoins vite !
