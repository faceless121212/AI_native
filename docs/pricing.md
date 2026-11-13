# Pricing: why Annual at €29.99

Decided by the user on 2026-11-13 (`docs/decisions.md`). Behaviour lives in `docs/product-spec.md` §5–6; this page holds the arithmetic behind it. Prices, fees and exchange rates change: re-check them before launch and whenever a provider or model changes.

## The plan

- One paid plan: **Annual, 3-day free trial**. EUR reference price **€29.99/year** for App Store Connect and Play Console; other currencies use the stores' price tiers. The app always shows the store's price at runtime, never this number.
- Free tier unchanged: 10 starter replies, then 3 a day.
- Subscribers: a fair-use cap of **300 replies a day** today, disclosed on the paywall and in the terms (spec §5, SQL `reply_plan`). See "The subscriber cap" below.

## Cost per reply

Measured on Claude Haiku 5.5 through the direct Claude API (staging), reply prompt v1 eval run of 2026-11-08 (`evals/reports/2026-11-08-reply-v1-anthropic.md`): **≈2,624 input + 168 output tokens** per reply (mean).

| | Tokens | Price (per 1M tokens) | Cost |
|---|---|---|---|
| Input | 2,624 | $0.10 | $0.000262 |
| Output | 168 | $0.50 | $0.000084 |
| **Per reply** | | | **≈$0.00035 ≈ €0.0003** (at $1 = €0.87, the rate in `supabase/functions/_shared/cost.ts`) |

One "reply" is one Reply, ↻ More, chip update or Polish request (spec §5). The same eval runs give Polish ≈2,471–2,723 input + ≈105 output tokens (cheaper per request). The later reply prompts are a little larger: v4 measured 2,939 input + 160 output tokens, ≈$0.00037 (≈€0.00033) per reply, about 8% above the figures below; that doesn't change any conclusion here.

## Cost per user per year

| User | Replies a year | LLM cost a year |
|---|---|---|
| Free user at the daily limit (3/day) | 1,095 (+10 starter) | ≈€0.33 |
| Heavy subscriber (30/day) | 10,950 | ≈€3.30, call it **≈€3.50** with headroom |
| Subscriber at a 100/day cap, every day | 36,500 | **≈€11** |
| Subscriber at the current 300/day cap, every day (worst case) | 109,500 | **≈€33** |

## Revenue per subscriber

€29.99 a year, in the user's store price:

| Step | Amount |
|---|---|
| Price incl. VAT | €29.99 |
| minus VAT (≈20%: UK 20%, DE 19%, FR 20%, ES 21%, IT 22%) | ≈€25.00 |
| minus store fee 15% (Apple Small Business Program, Google Play subscriptions) | **≈€21 net** |

Not included: RevenueCat's fee (~1% of tracked revenue above its free tier), trial users who cancel (they cost up to 3 days of replies and pay nothing), and refunds.

## The subscriber cap

- At 30 replies a day a subscriber costs ≈€3.50 a year against ≈€21 net: a healthy margin.
- At the current 300/day cap, one subscriber who maxes it out every day costs ≈€33 a year, **more than they pay** (≈€21 net).
- At 100/day the worst case is ≈€11 a year, still covered by the ≈€21 net, and 100 replies a day is far above real use (a heavy user is ~30).

**Recommendation: lower the subscriber cap from 300 to 100 a day.** Not applied: the user kept the cap unchanged on 2026-11-13, so this is an open question. Changing it means one SQL change (`reply_plan`), the in-memory test store, the pgTAP and Deno tests that assert 300, spec §5, and the privacy policy and terms (the cap must be disclosed before purchase).

## Production providers price differently

These numbers use the **direct Claude API** list price, which is development and staging only (`inventory.md` §3). Production uses **Claude on Amazon Bedrock (EU cross-region inference profile)**, with **Mistral (EU)** as fallback. Their prices differ: EU inference profiles can carry a regional premium, and the Mistral price in `cost.ts` is still a placeholder. **Re-check both price lists, update `cost.ts`, and redo this page before launch.** Once live, `ai_requests.cost_micro_eur` and the `daily_cost` view give the real cost per reply.
