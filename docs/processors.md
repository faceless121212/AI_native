# Processors (GDPR Art. 28)

Who processes personal data for Replywise, where, and why. Kept in sync with `docs/product-spec.md` §10 (data kept) and `inventory.md`. Every processor needs a signed DPA and EU (or adequate) processing before launch. Not legal advice; confirm with counsel.

Last updated: 2026-10-31 (Prompt 2).

| Processor | Service | Region | Purpose | Data categories | Retention | DPA | Added |
|---|---|---|---|---|---|---|---|
| Supabase Inc. | Postgres, Auth (anonymous sign-in), Edge Functions | Frankfurt, AWS eu-central-1 (chosen when the `replywise-staging` and `replywise-prod` projects are created; it can't be changed later) | Account (anonymous user ID), settings, AI consent records, device keys (hash only), quota counters and credits, entitlements, AI request metadata (no text), feedback events, referral codes, support messages. Runs the `reply` proxy, which holds chat text in memory only during a request | Pseudonymous user ID; app language; "I am" / "They are"; age confirmation timestamp; time zone; consent kind, policy version and timestamps; device key SHA-256 and platform; usage and credit counts; plan state; request metadata (kind, language, chip choices, provider, model, tokens, cost, latency, status, safety flags); support message text, optional reply email, app version, OS. **No chat text stored** | Per spec §10: profile, consents, ledger, entitlements, referrals until deletion; usage days 90 days; `ai_requests` 90 days then aggregated; `reply_events` and `support_messages` 12 months | To sign (Supabase DPA via dashboard, Pro plan) | Prompt 2 |
| Amazon Web Services EMEA SARL | Amazon Bedrock (Claude, EU cross-region inference profile, source eu-central-1) | EU | Generate reply suggestions (primary provider) | Copied message or draft (redacted), chip choices, in memory per request; no training, no retention to be confirmed | _Added in Prompt 3_ | _Added in Prompt 3_ | Prompt 3 |
| Mistral AI | La Plateforme API | EU | Fallback provider for reply suggestions | Same as Bedrock | _Added in Prompt 3_ | _Added in Prompt 3_ | Prompt 3 |
| RevenueCat Inc. | Subscriptions, webhooks | _Added in Prompt 8_ | Purchases, entitlement state | _Added in Prompt 8_ | _Added in Prompt 8_ | _Added in Prompt 8_ | Prompt 8 |
| Functional Software Inc. (Sentry) | Error monitoring (EU data region) | _Added in Prompt 13_ | Crash and error reports without message content | _Added in Prompt 13_ | _Added in Prompt 13_ | _Added in Prompt 13_ | Prompt 13 |
| PostHog Inc. | Product analytics (EU cloud) | _Added in Prompt 13_ | Events from spec §12, no personal data, no text | _Added in Prompt 13_ | _Added in Prompt 13_ | _Added in Prompt 13_ | Prompt 13 |
| 650 Industries Inc. (Expo) | EAS Build / Update | _Added in Prompt 15_ | App builds and updates | _Added in Prompt 15_ | _Added in Prompt 15_ | _Added in Prompt 15_ | Prompt 15 |

## Supabase notes

- **Region:** both hosted projects must be created in **Frankfurt (eu-central-1)**. The local stack (`supabase start`) runs in Docker and is used with `LLM_MODE=fake` only.
- **What the client can read:** with Row Level Security, a signed-in user reads only their own rows in `profiles`, `consents`, `entitlements`, `usage_days`, `credit_ledger` and their own `referrals` codes. `ai_requests`, `reply_events`, `device_keys`, `support_messages`, `provider_status` and the `daily_cost` view are closed to clients; only Edge Functions (service role) use them. The `anon` role reads nothing.
- **No message content:** `ai_requests` and `reply_events` have no text column; every text-typed column there is restricted by a check constraint to a fixed code list or short identifier pattern.
- **Device keys:** only the SHA-256 of the key is stored. Withdrawing AI consent revokes all of the user's keys in the same transaction.
- **Deletion:** every user table references `profiles` / `auth.users` with `on delete cascade`, so deleting the auth user removes the user's rows. Open question for counsel: spec §10 keeps consent records "until deletion + 3 years" as proof of consent; with the current cascade they are deleted with the account (decide before Prompt 10's Delete my data).
- **Auth:** anonymous sign-in only; email sign-up is off. No email, phone or password is collected in v1.
