# Architecture: Replywise

## 1. The rules that shape everything

1. **Keyboards are native and small.** iOS: a Keyboard Extension in Swift/SwiftUI, a separate process with a tight memory limit. Android: an `InputMethodService` in Kotlin. React Native only runs in the containing app.
2. **Typing never depends on the network.** AI is a button on top.
3. **One door to the AI.** App and keyboards call only the `reply` Edge Function. It checks auth, consent, age, plan and quota, redacts obvious personal data, calls the model, streams the result and logs metadata without text.

## 2. Parts

```
┌──────────────────────────────┐   App Group (iOS) /        ┌──────────────────────────────┐
│ Containing app (Expo, RN)    │   SharedPreferences (And.) │ Keyboard                      │
│ - onboarding, consent        │◀──────────────────────────▶│ iOS: Keyboard Extension       │
│ - keyboard setup guide       │  settings, chips, consent  │      Swift + SwiftUI          │
│ - paywall (RC Paywalls)      │  mirror, counter cache,    │ Android: InputMethodService   │
│ - sign-in, settings,         │  keyboard heartbeat        │      Kotlin                   │
│   referral, support          │                            │                               │
│ - local notifications        │                            │ - layouts, typing (offline)   │
│ - modules/keyboard-bridge    │  shared keychain (iOS):    │ - reply bar, chips            │
└──────────────┬───────────────┘  device key                └──────────────┬───────────────┘
               │ HTTPS (Supabase JWT)                                      │ HTTPS + SSE (device key)
               ▼                                                           ▼  only on Reply/Polish tap
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Supabase (Frankfurt)                                                                     │
│ Auth: anonymous, then Apple / Google / email linked to the same user ID                  │
│ Edge Functions: reply (SSE) · device-key · quota · consent · referral · support ·        │
│                 webhooks-revenuecat · delete-me · health                                 │
│ Postgres + RLS: profiles, consents, device_keys, usage_days, credit_ledger, entitlements, │
│                 ai_requests, reply_events, referrals, support_messages, provider_status  │
└───────────────────────────────┬──────────────────────────────────────────────────────────┘
                                ▼
        Primary: Claude on Amazon Bedrock, EU inference profile (eu-central-1 source)
        Fallback: Mistral La Plateforme (EU)
        RevenueCat webhooks → entitlements · Sentry EU · PostHog EU · Better Stack
```

## 3. Repository layout

```
/app                          Expo Router screens
  (onboarding)/               welcome (with the 18+ check), consent, keyboard-setup, try-it, paywall, sign-in
  (main)/                     home, settings/*, invite, support, paywall, sign-in
/src
  api/                        typed Supabase + reply client (SSE), TanStack Query hooks
  features/<feature>/         auth, onboarding, keyboard-status, reply, paywall, quota, referral, settings, support
  lib/i18n/  lib/notifications/  lib/purchases/  lib/analytics/
  theme/                      tokens (exported to Swift/Kotlin by scripts/export-tokens.ts)
/locales/<en|de|fr|es|it>/    common.json, onboarding.json, keyboard.json, paywall.json, notifications.json
/targets/keyboard/            iOS Keyboard Extension (@bacons/apple-targets)
  expo-target.config.js       type "keyboard", entitlements (App Group, keychain group), Info.plist (RequestsOpenAccess)
  Package.swift               SwiftPM manifest over Core/ + Tests/ for `swift test`
  Core/                       no UIKit: Layouts, QuotaCache, ReplyRequest, SSEParser, LanguageHint, Strings (generated)
  UI/                         KeyboardViewController (UIInputViewController), SwiftUI views
  Tests/
/modules/keyboard-bridge/     local Expo module: App Group / SharedPreferences, keyboard status
/modules/replywise-ime/       local Expo module containing the Android IME
  android/src/main/AndroidManifest.xml   <service> with BIND_INPUT_METHOD + meta-data method.xml
  android/src/main/res/xml/method.xml    subtypes en-GB, de, fr, es, it
  android/src/main/java/app/replywise/ime/{core,ui}/
  android/src/test/
/supabase
  migrations/                 SQL, one file per change
  functions/
    _shared/                  db clients, schemas.ts (zod), auth.ts (JWT or device key), quota.ts,
                              llm/ (provider interface, bedrock.ts, mistral.ts, fake.ts),
                              prompts/ (reply.v1.md, polish.v1.md, safety.v1.md, lang/<lang>.v1.md, tones.v1.md),
                              redact.ts, cost.ts, analytics.ts
    reply/  device-key/  quota/  consent/  referral/  support/  webhooks-revenuecat/  delete-me/  health/
  tests/                      pgTAP
/evals/<reply|polish|safety>/cases.jsonl   eval inputs + expectations
/scripts/                     run-evals.ts, gen-keyboard-strings.ts, export-tokens.ts, i18n-check.ts
/web/                         static privacy pages, /r/<code> landing (Cloudflare Pages)
/e2e/                         Maestro flows
/docs/                        spec, architecture, teardown, processors.md, dpia.md, reply-api.json, keyboard-manual-test.md
```

## 4. Auth: the app account and the keyboard's device key

### 4.1 The app account (Supabase Auth)

1. The app signs in anonymously (Supabase) on first launch. Starter credits, consent, quota and the RevenueCat app user ID all hang off this user ID. RevenueCat is configured with the Supabase user ID as its app user ID (no RevenueCat anonymous IDs).
2. After the paywall (onboarding screen 6, or Settings → Sign in) the user can sign in; "Not now" keeps the anonymous account. Sign-in **links the identity to the existing anonymous user**, so the user ID stays the same and the device key, consent, quota, credits and entitlements are kept:
   - **Apple** (iOS): `expo-apple-authentication` (the system "Continue with Apple" button) requested with the email scope only (no full name), returns an identity token for a hashed nonce and an authorization code; the app sends the code to an Edge Function, which exchanges it with Apple's REST API for a refresh token and stores that token encrypted (needed to revoke it on deletion, step 6); the app links the identity token to the current user (supabase-js `linkIdentity` with the ID token; confirm in current docs that ID-token linking is supported, else use the OAuth `linkIdentity` flow through the browser).
   - **Google**: `@react-native-google-signin/google-signin` returns an ID token (audience = the web client ID configured in Supabase), with no scopes beyond the default sign-in; linked the same way.
   - **Email + password**: `updateUser({ email })` on the anonymous user, then `updateUser({ password })` once the address is confirmed (Supabase's documented anonymous → permanent conversion). "Forgot password?" → `resetPasswordForEmail` with a `replywise://` redirect. Needs a custom SMTP sender in production (the built-in one is rate-limited; provider to pick, `docs/processors.md`).
   - Right after a link or sign-in, the app (or a `profile` function call) strips any name or avatar URL the provider put into `identity_data` / `raw_user_meta_data`; only the email and provider user ID stay (spec §10).
   - **Under-18 install:** the local install flag from onboarding screen 1 keeps AI off whatever account signs in, and the sign-in screen and Settings row are hidden on that install.
   - Supabase settings: anonymous sign-ins on, manual linking on, email sign-up on, Apple and Google providers on with the app's client IDs (`supabase/config.toml`, and the dashboard for the hosted projects).
3. After a successful link the app calls RevenueCat `Purchases.logIn(<supabase user id>)` (the same ID, so nothing moves; it also covers the case below).
4. **The identity already belongs to another account** (a reinstall or a new phone): linking fails. The app signs in to that existing account in a second, non-persisted client (`signInWithIdToken` / `signInWithPassword`). Before switching the stored session, it **deletes the anonymous account right away** by calling `delete-me` with the anonymous user's own JWT (device key revoked, rows gone, its unused credits are not merged). Then it switches the session, calls `Purchases.logIn` with the existing user ID (RevenueCat restores its purchases; the transfer-purchases setting is a before-launch item), and gets a new device key for the existing account if its AI consent is still valid (else AI stays off until the user consents again).
5. **Sign out** (Settings): revokes this phone's device key, clears it from the keychain and the App Group mirror, signs out of Supabase and RevenueCat (`Purchases.logOut`). What the app does next (a new anonymous account, which would get new starter credits, or a signed-out state) is open (`docs/decisions.md`).
6. **Delete my data** (`delete-me`): the app first warns that deleting data doesn't cancel a store subscription, with a link to the store's subscription management (`common:deleteData.*`). Then the function:
   - (a) revokes the Sign in with Apple token through Apple's REST API (`/auth/revoke`) with the stored encrypted refresh token (App Store 5.1.1(v) expects this for Apple sign-in);
   - (b) deletes the RevenueCat customer through RevenueCat's REST API;
   - (c) purges the user's rows in `auth.audit_log_entries` (they can hold the email);
   - (d) deletes the auth user (Auth admin API), which removes the email, pending `email_change` and the linked identities and cascades to every user table.
   - The **inactive-account purge** must do the same (a)–(d), which plain SQL in `run_retention` can't (Apple and RevenueCat calls). Follow-up: move the purge to a scheduled Edge Function that reuses `delete-me`'s steps; until then the SQL purge only does (d). Also purge an unconfirmed `email_change` after 24 h.
   - Also needed: a public web page for Google Play's account-deletion URL (`https://replywise.app/delete`, in `web/`) explaining in-app deletion and taking requests; and Apple's server-to-server notifications for Sign in with Apple (consent revoked, account deleted at Apple, email relay changes) handled by an Edge Function.

Supabase Auth holds the only new personal data: the email address and the Apple / Google identity (spec §10). Supabase Auth's own logs can also contain the email (`docs/processors.md`). It never goes into `profiles`, our logs, Sentry or PostHog; analytics stay keyed by user ID, which becomes linkable to a person once they sign in (privacy-label question in `docs/decisions.md`). The email is used only for sign-in and account emails; no marketing email.

### 4.2 The keyboard (device key)

The keyboard can't run supabase-js and shouldn't race the app over refresh-token rotation. So:

1. The app has a Supabase session (anonymous or signed in, §4.1).
2. After AI consent, the app calls `device-key` (with its JWT). The function creates 32 random bytes, stores only the SHA-256 hash in `device_keys` with `user_id`, `platform`, `created_at`, and returns the key once.
3. The app stores the key in the shared keychain group (iOS) or EncryptedSharedPreferences (Android; same app process, no sharing problem).
4. The keyboard sends `Authorization: Device <key>` to `reply`. The function hashes it, finds the user, checks `revoked_at is null`.
5. Delete my data, consent withdrawal or sign-out revokes the key and clears it from the keychain. Linking an identity (§4.1 step 2) keeps the user ID, so the key stays valid.

The app itself calls `reply` (Try it) with its normal Supabase JWT. `reply` accepts either.

## 5. App Group contract (iOS) / SharedPreferences (Android)

Keys (versioned, `v1.` prefix), written by the app unless noted:

| Key | Type | Meaning |
|---|---|---|
| `v1.aiEnabled` | Bool | consent given, not withdrawn, age confirmed |
| `v1.defaults` | JSON | relationship, closeness, tone, flirt, formality, iAm, theyAre, keyboardLang |
| `v1.lastChips` | JSON | written by the keyboard: last used chips |
| `v1.quota` | JSON | `{plan, leftToday, resetAt, fairUseLeft}`; refreshed from every `reply` response (keyboard writes) and from `quota` (app writes) |
| `v1.trialEndsAt` | ISO date or null | for the last-day banner |
| `v1.providerDown` | Bool + until | from `health` |
| `v1.keyboardHeartbeat` | JSON | written by the keyboard on each open: `{at, hasFullAccess, version}`; lets the app show Full Access status |
| `v1.uiLang` | String | keyboard UI language |

iOS: without Full Access, the extension can't use the shared container or network. It falls back to built-in defaults (Casual, Friend, Warm) and shows the "No Full Access" bar. The app treats "no heartbeat with hasFullAccess=true in the last 10 minutes after the guide" as not granted.

Storage types: `v1.aiEnabled` is a Bool; `v1.uiLang` and `v1.trialEndsAt` are strings; every other key is a JSON string. The App Group also holds a `Diagnostics/` folder where the keyboard's MetricKit subscriber writes crash and hang payloads (no text) for the app to upload.

Group names are not hard-coded in Swift. Both sides derive them from the bundle ID: the app `<app>` and the keyboard `<app>.keyboard` use the App Group `group.<app>.shared` and the shared keychain group `$(AppIdentifierPrefix)<app>.shared`, so staging (`app.replywise.staging`) and production stay separate. `config/app-groups.js` is the build-time source; `src/__tests__/keyboard-groups.test.ts` ties the runtime rule to it. The app reads its team prefix from the `AppIdentifierPrefix` Info.plist key (with a keychain probe as fallback); the keyboard only has the shared group and doesn't need the prefix. The device key is stored `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so it never moves to another phone through a backup.

"Keyboard added" detection: iOS has no public API to list enabled keyboards (`AppleKeyboards` in user defaults is undocumented, so it isn't used). The app counts the keyboard as added once it has written `v1.keyboardHeartbeat`, which needs Full Access. Until then the app can't tell whether the keyboard was added, so the onboarding guide (Prompt 7) asks the user to confirm the step.

## 6. Keyboard state machine (bar)

```
           ┌────────── no Full Access ─────────▶ NO_ACCESS (typing only)
open ──────┤
           ├── aiEnabled=false ───────────────▶ AI_OFF
           ├── no device key ─────────────────▶ NOT_SET_UP
           └── ok ────────────────────────────▶ IDLE
IDLE ──tap Reply──▶ READ_CLIPBOARD ──empty──▶ IDLE + hint "Copy their message first"
                         │ text
                         ▼
                    REQUESTING ──offline──▶ OFFLINE
                         │ 402 quota ─────▶ QUOTA_EMPTY
                         │ 429 fair use ──▶ FAIR_USE
                         │ 503 providers ─▶ PROVIDER_DOWN
                         ▼
                    STREAMING (cards appear one by one; ✕ cancels the request)
                         ▼
                    RESULTS ──tap card──▶ INSERTED (send reply_inserted) ──▶ IDLE
                            ──↻ More / chip change──▶ REQUESTING
IDLE ──tap Polish (field has text)──▶ REQUESTING (kind=polish) … RESULTS ──tap──▶ replace draft
```

Any state → crisis flag in the stream → show crisis card above the cards.

## 7. Reply pipeline (`reply` Edge Function)

Request (zod `ReplyRequest`): `{ kind: 'reply'|'polish', text (≤1000 chars), langHint, relationship, closeness (1–5), tone, flirt, formality, iAm, theyAre, uiLang, source: 'keyboard'|'app', clientRequestId }`.

Steps (as built in Prompt 3; the order puts every check that can refuse before the charge):
0. **Config and region:** the provider configuration is read once per instance and fails closed (`_shared/llm/config.ts`): on hosted Supabase an unset `APP_ENV` means production and `local` is refused; an unset `LLM_MODE` is refused; production never uses `fake` or the direct Claude API (`anthropic`, no EU-only processing; no override); Bedrock only in EU-member regions with an `eu.` inference profile; SDK env variables that redirect, log or trace (`ANTHROPIC_LOG`, `ANTHROPIC_BASE_URL`, …) are refused outside local. A refused config → 500 `internal`. In production the function must run in `eu-central-1` (`SB_REGION`), else 503.
1. **Auth:** Supabase JWT or device key → `user_id`. Reject 401.
2. **Gate:** `ai_allowed(user, minimum policy version)`: age confirmed and the latest `ai_sharing` consent not withdrawn. Else 403 `ai_off`.
3. **Rate limit:** 20/min per user, in memory per instance; `consume_reply` also counts the user's requests of the last 60 s in `ai_requests` (all instances). 429 `rate` with `Retry-After`.
4. **Providers available:** if every configured provider is marked down in `provider_status` → 503 `provider_down` before charging.
5. **Validate chips:** Flirty tone → Warm for Colleague/Family; flirt level Off for everyone but Match/Partner.
6. **Redact (in memory):** links with credentials (with or without scheme, `user:pw@`), emails, IBANs, card numbers, one-time codes/PINs/TANs next to a code word, phone numbers → `[link]`, `[email]`, `[iban]`, `[card]`, `[code]`, `[phone]`. Dates, times and year ranges are left alone. Placeholders are kept in replies as-is. A deterministic crisis-phrase check (`_shared/crisis.ts`) runs on the redacted text; its boolean is only used for step 10's backstop. A deterministic minor check (`_shared/minor.ts`, reply only) looks for a first-person age under 18 or a minor's school year in the five languages: for a match or partner it marks the request to be refused before the model (step 9), unless the crisis check matched (CLAUDE.md rule 7: the model answers supportively); for anyone else it forces Flirty → Warm and flirt Off (`flirt_forced_off`; spec §9 "never flirt"). Neither result is logged. The redacted text's confident language (`postcheck.ts` `dominantLanguage`) and whether it has an emoji (`_shared/emoji.ts` `emojiAllowed`) are kept for step 11.
7. **Build prompt:** system = `safety` + `reply` (or `polish`) + `lang/<lang>` + the tone card from `tones`. The user turn carries the chips after steps 5 and 6 and `emoji=none|at most one per reply` from `emojiAllowed`, the same rule step 11 enforces. The `.md` files are the source; `scripts/gen-prompts.ts` generates the `*.v1.ts` string modules the function imports. User content is wrapped in a tag with a random per-request name; the prompt says it is data, not instructions.
8. **Quota (atomic, SQL `consume_reply(user_id, local_date, …)`):** locks the profile and day rows, re-checks consent, counts the rate limit with the clock read after the lock, then charges: free → starter credits, then the daily allowance (`daily_free_limit()`, 3), then bonus credits; paid (annual) → fair-use cap of 300 a day (`reply_plan`; `docs/pricing.md` recommends 100, open). Creates the `ai_requests` row (`started`) and records the charge. 402 `quota_empty` / 429 `fair_use`.
9. **Call the model, streaming** (skipped for a request refused in step 6: no provider is called, the stream ends as in step 12 for a refusal). Output format: one line per item, `R1|text`, `R2|text`, `R3|text` (Polish: `L|text`, `W|text`), and `META|{"lang":"de","crisis":false,"refused":false}`. The v1 prompts emit META first, so the crisis card and the language arrive before any card; the parser accepts it in any position. Polish keeps the draft's line breaks: the model writes each one inside the card's line as the two characters `\n` (a literal backslash as `\\`), and the parser (`_shared/llm/lines.ts`) turns them back into newlines for `L`/`W` only; reply cards stay one line (a `\n` there becomes a space). Lines are parsed across chunk boundaries and sent as SSE: `card` (index, variant, text) as soon as complete, `meta`, then `quota` and `done` (or `quota` and `error`).
10. **Fallback and safety nets:** an error, or no first token within 2.5 s, cancels the call and moves to the next configured provider (with no fallback configured the only provider gets 5 s; no fallback once a card has been sent). 3 failures in 60 s mark a provider down for 5 minutes (`record_provider_failure`). Before switching provider and before the retry, `reply_still_allowed` re-checks consent and the device key; if AI was turned off → `error ai_off`. A provider refusal (`stop_reason: refusal`) → `meta.refused`, no fallback, no retry. If the model's META is missing, the provider refused, or the stream ended early, and the crisis check matched, `meta.crisis` is set (sent again only to raise it).
11. **Post-check each card:** first emoji (`_shared/emoji.ts`: with no emoji in the input every emoji is stripped, with their VS16, ZWJ and skin-tone pieces, keycaps and flags; otherwise only the first is kept; text symbols such as ™ © and VS15 text presentation stay; the Polish light edit keeps the draft's emoji; spacing and empty brackets are tidied, newlines kept; a change logs `card_fixed {reason:'emoji'}`), then length ≤ 300 (an emptied card is `empty`), no banned phrase, no explicit term, and language: a card confidently in another language than META (or the hint before META arrives) is dropped, using stop words plus Spanish/Italian markers, unless it is in the input's own confident language (spec §3.3; a wrong hint with a late, missing or wrong META must not drop every card). One extra drop: a card where a third language other than English clearly leads on stop words alone (at least 3, more than the input's language) is dropped even then. A reply card that repeats an earlier one (same first three normalised words, or the same words) is dropped as `same_opener` / `duplicate`; the evals flag the stricter two-word rule. A failing card is dropped (`card_dropped {reason}`, codes only); fewer than 2 surviving → retry once.
12. **Finish:** refund (`refund_reply`) when no card was sent (error, AI off, client cancel, or a refusal by the model, the provider or the server's minor check; a refused request keeps status `refused`). A server refusal sends `meta {refused:true}` (crisis via the backstop rules), then `quota` and `done {cards:0}`, exactly like a model refusal, and stores the expected language; after the refund its row's `relationship`, `tone` and `flirt` are set to NULL so it can't be read as "this user's match said they're a minor". If `meta.crisis` reached the client (model or backstop), `increment_crisis_daily(lang, source)` adds 1 to the anonymous `crisis_daily` count; nothing per user. Generation is wrapped so the refund, the closing events and the metadata still happen when something throws; on Supabase this work is registered with `EdgeRuntime.waitUntil`. A pg_cron sweeper (`sweep_abandoned_requests`, every 5 minutes) refunds rows still `started` after 5 minutes and marks them `abandoned`.
13. **Log** to `ai_requests`: kind, source, chips, lang, provider, model, prompt_version, tokens, cost (micro-EUR, `cost.ts`), latency to first card and to done, status, delivered card indexes, safety flags (`refused`, `redacted`, `card_dropped`, `flirt_forced_off`; never `crisis`). **Never the text.** Server analytics are per anonymous user ID except `safety_flag`, which is an anonymous aggregate.

Feedback: `POST reply/event {requestId, cardIndex, type: inserted|up|down}` → `record_reply_event` → `reply_events`, only for the caller's own request and a delivered card index (cancelled requests: `inserted` only), once per (request, card, type).

## 8. Data model (Postgres)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.uid; the same ID before and after sign-in), `ui_lang`, `age_confirmed_at`, `timezone`, `last_reply_at`, `created_at` | timezone for the daily reset; `last_reply_at` (set by a trigger when a request row is created) only feeds the inactive-account purge. "I am" / "They are" are **not** stored: they stay on the phone and are sent with each `ReplyRequest` (used in the prompt, never stored) |
| `consents` | `id`, `user_id`, `kind` ('ai_sharing'), `policy_version`, `granted_at`, `withdrawn_at` | append-only; latest row wins |
| `device_keys` | `id`, `user_id`, `key_hash`, `platform`, `created_at`, `last_used_at`, `revoked_at` | unique `key_hash` |
| `usage_days` | `user_id`, `local_date`, `used`, `free_limit` (default `daily_free_limit()` = 3) | PK (user_id, local_date); `used` counts daily-allowance and paid (fair-use) replies, not credit-funded ones; delete after 90 days |
| `credit_ledger` | `id`, `user_id`, `delta`, `reason` ('starter','referral','refund','admin','spend','rollup'), `request_id`, `bucket` ('starter','bonus'), `created_at` | append-only (no updates); starter +10 at sign-up (`handle_new_user`, exactly once; consent grants nothing; spending still needs consent + 18+); each credit-funded reply is a `spend` −1 row and a refunded one a `refund` +1 row, both with `request_id` (no FK: rows outlive `ai_requests`) and the `bucket` they came from, so balances per bucket stay exact. After 90 days `run_retention` folds spend/refund rows into one `rollup` row per user and bucket (no `request_id`), so balances stay exact without per-reply history |
| `entitlements` | `user_id`, `product` ('annual' only since 2026-11-13), `active`, `is_trial`, `trial_ends_at`, `expires_at`, `renewal_count`, `will_renew`, `source_event_id` | written only by the RevenueCat webhook |
| `ai_requests` | `id`, `user_id`, `kind`, `source`, `lang`, `tone`, `relationship`, `closeness`, `formality`, `flirt`, `provider`, `model`, `prompt_version`, `tokens_in`, `tokens_out`, `cost_micro_eur`, `ms_first`, `ms_total`, `status` (started, ok, partial, refused, error, cancelled, abandoned), `safety_flags` (refused, redacted, card_dropped, flirt_forced_off; `crisis` is not storable), `charge` ('starter','daily','bonus','paid'), `charge_date`, `refunded_at`, `cards` (count sent), `delivered_cards` (indexes sent), `created_at` | no text column, ever; created by `consume_reply` (status `started`), finished by `reply`; `charge`/`charge_date`/`refunded_at` let `refund_reply` give back exactly what was charged, once; `delivered_cards` limits feedback to cards the user saw; 90 days, then aggregated into `ai_requests_daily` (no user ID) |
| `reply_events` | `id`, `request_id`, `card_index`, `type` ('inserted','up','down'), `created_at` | 12 months |
| `referrals` | `code` (8 chars), `owner_id`, `redeemed_by`, `redeemed_at`, `rewarded_at` | one redemption per user; no self-redeem |
| `support_messages` | `id`, `user_id`, `body`, `reply_email`, `app_version`, `os`, `ui_lang`, `plan` ('free','annual'), `created_at` | 12 months |
| `auth.users`, `auth.identities` (Supabase Auth) | user ID, email, provider identities (Apple, Google), password hash | managed by Supabase Auth; anonymous until the user signs in (§4.1); deleted by Delete my data and the inactive-account purge |
| `provider_status` | `provider` (bedrock, mistral, anthropic, fake), `down_until`, `last_error_at`, `failure_count`, `window_started_at` | written by `reply` through `record_provider_failure`: failures counted in a 60 s window starting at the first one; the 3rd marks the provider down for 5 minutes and starts a new window. No personal data |
| `crisis_daily` | `date` (UTC), `lang`, `source`, `count` | anonymous count of requests whose `meta.crisis` was true (model or keyword backstop); **no user ID, no request ID**; service role only, RLS on |
| `daily_cost` (view) | date, provider, requests, cost | admin only |

Retention (`run_retention`, pg_cron daily 03:15 UTC): `ai_requests` > 90 days → `ai_requests_daily` then deleted; `usage_days` > 90 days; `credit_ledger` spend/refund rows > 90 days → per-user `rollup`; `reply_events` and `support_messages` > 12 months; **inactive accounts**: auth users with no sign-in or session activity, no reply request (`profiles.last_reply_at`) and no device-key use for 12 months are deleted with all their rows (cascade, consents included), except users with an active, unexpired annual subscription (trial included). `sweep_abandoned_requests` runs every 5 minutes (see §7 step 12).

RLS on every table: users read only their own rows in `profiles`, `consents`, `entitlements`, `usage_days`, `credit_ledger`, `referrals` (own code). `ai_requests`, `reply_events`, `device_keys`, `support_messages`, `provider_status` have no client policies; only Edge Functions write them.

## 9. Strings in the keyboards

`scripts/gen-keyboard-strings.ts` reads `locales/<lang>/keyboard.json` and writes `targets/keyboard/Core/Strings.generated.swift` (a `KeyboardStrings` struct, one instance per language, typed functions for placeholders and plurals) and `modules/replywise-ime/android/src/main/res/values/keyboard_strings.xml` (English) plus `values-<lang>/keyboard_strings.xml` (`<string>` and `<plurals>`, placeholders as `%n$s`, `count` always `%1$d`). The hand-written `res/values/strings.xml` keeps only the non-translatable IME label. `scripts/export-tokens.ts` writes the colour tokens to `targets/keyboard/UI/Theme.generated.swift` and `res/values(-night)/colors.xml`. `npm run gen` runs both; `npm run i18n:check` fails if any generated file is stale.

## 10. Memory and performance budget (iOS extension)

- Resident memory target < 40 MB, checked with Xcode's memory gauge on an older device (e.g. iPhone SE 2nd gen / iPhone 11).
- No images; SF Symbols only. One SwiftUI hierarchy; no `UIHostingController` re-creation on each key press.
- Keys are SwiftUI views inside that one hierarchy; the globe (next-keyboard) key is a UIKit `UIButton` embedded in it, because `handleInputModeList(from:with:)` needs a UIView and the touch event.
- Haptics: iOS has no public way to read the system Keyboard Feedback → Haptic setting, so a light haptic plays only with Full Access; the click sound follows the system setting via `UIInputViewAudioFeedback`.
- Key-press to character < 16 ms; keyboard first frame < 250 ms after switch.
- Stream parsing on a background task; UI updates on the main actor, batched.
- Release `URLSession` tasks on `viewWillDisappear`; cancel streams on dismiss.
- Handle `didReceiveMemoryWarning`: drop results and caches.

## 11. Subscriptions

- One product, `annual` (3-day free trial as the store introductory offer), one entitlement `unlimited`, one offering (spec §6, `docs/pricing.md`).
- RevenueCat in the app only, with the Supabase user ID as the app user ID (§4.1). The paywall is a RevenueCat Paywall (`RevenueCatUI.Paywall` embedded in the app's paywall route, template configured in the RevenueCat dashboard); the app renders the "Remind me before the trial ends" switch under it and reads its state when a purchase that starts a trial completes.
- Webhook `webhooks-revenuecat` (shared-secret check, idempotent on event ID) writes `entitlements`, increments `renewal_count` on RENEWAL, sets `trial_ends_at` on trial start. Store product IDs map to `annual`; an event for any other product ID is logged (no personal data) and acknowledged without writing a row.
- Server reads `entitlements` for quota. The app reads RevenueCat customer info for UI and mirrors plan + `trialEndsAt` into the App Group.

## 12. Security

- Passwords and Apple / Google tokens are handled only by Supabase Auth; the app keeps no password, and the email never appears in logs or analytics.
- Provider keys and service-role key only in Edge Function secrets. The IAM user can only invoke the one EU inference profile.
- Device keys: 32 random bytes, base64url, only SHA-256 stored, revocable.
- User text is wrapped and marked as data in prompts; output is post-checked; the function never follows instructions found in user text.
- No text in logs: a lint rule bans `console.log` of request bodies in `reply/`; Sentry `beforeSend` drops request bodies.
- TLS only; ATS defaults on iOS; `network_security_config` without cleartext on Android.

## 13. Environments

| Env | Supabase project | App variant | LLM |
|---|---|---|---|
| local | `supabase start` (Docker) | dev client | `LLM_MODE=fake` |
| staging | `replywise-staging` (Frankfurt) | `app.replywise.staging` (+ `.keyboard`) | live, low daily cost cap |
| production | `replywise-prod` (Frankfurt) | `app.replywise` (+ `.keyboard`) | live |
