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
│ - paywall (RevenueCat)       │  mirror, counter cache,    │ Android: InputMethodService   │
│ - settings, referral,support │  keyboard heartbeat        │      Kotlin                   │
│ - local notifications        │                            │ - layouts, typing (offline)   │
│ - modules/keyboard-bridge    │  shared keychain (iOS):    │ - reply bar, chips            │
└──────────────┬───────────────┘  device key                └──────────────┬───────────────┘
               │ HTTPS (Supabase JWT)                                      │ HTTPS + SSE (device key)
               ▼                                                           ▼  only on Reply/Polish tap
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Supabase (Frankfurt)                                                                     │
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
  (onboarding)/               welcome, age, who, consent, try-it, add-keyboard, full-access, paywall, reminder, done
  (main)/                     home, settings/*, invite, support, paywall
/src
  api/                        typed Supabase + reply client (SSE), TanStack Query hooks
  features/<feature>/         onboarding, keyboard-status, reply, paywall, quota, referral, settings, support
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

## 4. Auth for the keyboard (device key)

The keyboard can't run supabase-js and shouldn't race the app over refresh-token rotation. So:

1. The app signs in anonymously (Supabase) on first launch.
2. After AI consent, the app calls `device-key` (with its JWT). The function creates 32 random bytes, stores only the SHA-256 hash in `device_keys` with `user_id`, `platform`, `created_at`, and returns the key once.
3. The app stores the key in the shared keychain group (iOS) or EncryptedSharedPreferences (Android; same app process, no sharing problem).
4. The keyboard sends `Authorization: Device <key>` to `reply`. The function hashes it, finds the user, checks `revoked_at is null`.
5. Delete my data, consent withdrawal or sign-out revokes the key and clears it from the keychain.

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

Steps:
1. **Auth:** Supabase JWT or device key → `user_id`. Reject 401.
2. **Gate:** profile has `age_confirmed_at`; latest `consents` row of kind `ai_sharing` not withdrawn. Else 403 `ai_off`.
3. **Rate limit:** 20/min per user (in-memory + `ai_requests` count fallback). 429 `rate`.
4. **Quota (atomic, SQL function `consume_reply(user_id, local_date)`):** free → use starter credits first, then the daily 3, then bonus credits; paid → check fair-use cap. Returns `{ok, plan, leftToday, fairUseLeft}`. On not ok → 402 `quota_empty` or 429 `fair_use`. If the request later fails before any card is sent, refund with `refund_reply(request_id)`.
5. **Validate chips:** Flirty tone and flirt level forced Off for Colleague/Family.
6. **Redact (in memory):** emails, phone numbers, IBANs, card-like numbers, URLs with tokens → placeholders (`[email]`, `[phone]`). Placeholders are kept in replies as-is.
7. **Build prompt:** system = `safety.v1.md` + `reply.v1.md` (or `polish.v1.md`) + `lang/<lang>.v1.md` for the hinted language + the tone card from `tones.v1.md`. User content is wrapped in a delimited block and the prompt says it is data, not instructions (prompt-injection guard).
8. **Call the model, streaming.** Output format: one line per item, `R1|text`, `R2|text`, `R3|text` (Polish: `L|text`, `W|text`), then `META|{"lang":"de","crisis":false,"refused":false}`. The function parses lines as they arrive and sends SSE events: `card` (index, text), `meta`, `quota`, `done`, `error`.
9. **Fallback:** if Bedrock errors or the first token takes > 2.5 s, cancel and call Mistral with the same prompt. Mark `provider_status` on repeated failures (3 in 60 s) for 5 minutes.
10. **Post-check each card:** language matches `meta.lang` (cheap heuristic), length ≤ 300 chars, no banned phrase, no explicit terms list hit. A failing card is dropped; if fewer than 2 cards survive, retry once.
11. **Log** to `ai_requests`: user_id, kind, lang, chips, provider, model, prompt_version, input/output tokens, cost (EUR micro-units from `cost.ts` price table), latency to first card and to done, status, safety flags. **Never the text.** Send server analytics events.

Feedback: `POST reply/event {requestId, cardIndex, type: inserted|up|down}` → `reply_events`.

## 8. Data model (Postgres)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.uid), `ui_lang`, `i_am`, `they_are`, `age_confirmed_at`, `timezone`, `created_at` | timezone for the daily reset |
| `consents` | `id`, `user_id`, `kind` ('ai_sharing'), `policy_version`, `granted_at`, `withdrawn_at` | append-only; latest row wins |
| `device_keys` | `id`, `user_id`, `key_hash`, `platform`, `created_at`, `last_used_at`, `revoked_at` | unique `key_hash` |
| `usage_days` | `user_id`, `local_date`, `used`, `free_limit` (3) | PK (user_id, local_date); delete after 90 days |
| `credit_ledger` | `id`, `user_id`, `delta`, `reason` ('starter','referral','refund','admin'), `created_at` | starter +10 on first consent |
| `entitlements` | `user_id`, `product` ('weekly','annual','lifetime','lifetime_upgrade'), `active`, `is_trial`, `trial_ends_at`, `expires_at`, `renewal_count`, `will_renew`, `source_event_id` | written only by the RevenueCat webhook |
| `ai_requests` | `id`, `user_id`, `kind`, `source`, `lang`, `tone`, `relationship`, `closeness`, `formality`, `flirt`, `provider`, `model`, `prompt_version`, `tokens_in`, `tokens_out`, `cost_micro_eur`, `ms_first`, `ms_total`, `status`, `safety_flags`, `created_at` | no text column, ever; 90 days |
| `reply_events` | `id`, `request_id`, `card_index`, `type` ('inserted','up','down'), `created_at` | 12 months |
| `referrals` | `code` (8 chars), `owner_id`, `redeemed_by`, `redeemed_at`, `rewarded_at` | one redemption per user; no self-redeem |
| `support_messages` | `id`, `user_id`, `body`, `reply_email`, `app_version`, `os`, `ui_lang`, `plan`, `created_at` | 12 months |
| `provider_status` | `provider`, `down_until`, `last_error_at` | written by `reply` |
| `daily_cost` (view) | date, provider, requests, cost | admin only |

RLS on every table: users read only their own rows in `profiles`, `consents`, `entitlements`, `usage_days`, `credit_ledger`, `referrals` (own code). `ai_requests`, `reply_events`, `device_keys`, `support_messages`, `provider_status` have no client policies; only Edge Functions write them.

## 9. Strings in the keyboards

`scripts/gen-keyboard-strings.ts` reads `locales/<lang>/keyboard.json` and writes `targets/keyboard/Core/Strings.generated.swift` (a `KeyboardStrings` struct, one instance per language, typed functions for placeholders and plurals) and `modules/replywise-ime/android/src/main/res/values/keyboard_strings.xml` (English) plus `values-<lang>/keyboard_strings.xml` (`<string>` and `<plurals>`, placeholders as `%n$s`, `count` always `%1$d`). The hand-written `res/values/strings.xml` keeps only the non-translatable IME label. `scripts/export-tokens.ts` writes the colour tokens to `targets/keyboard/UI/Theme.generated.swift` and `res/values(-night)/colors.xml`. `npm run gen` runs both; `npm run i18n:check` fails if any generated file is stale.

## 10. Memory and performance budget (iOS extension)

- Resident memory target < 40 MB, checked with Xcode's memory gauge on an older device (e.g. iPhone SE 2nd gen / iPhone 11).
- No images; SF Symbols only. One SwiftUI hierarchy; no `UIHostingController` re-creation on each key press.
- Key-press to character < 16 ms; keyboard first frame < 250 ms after switch.
- Stream parsing on a background task; UI updates on the main actor, batched.
- Release `URLSession` tasks on `viewWillDisappear`; cancel streams on dismiss.
- Handle `didReceiveMemoryWarning`: drop results and caches.

## 11. Subscriptions

- RevenueCat in the app only. Webhook `webhooks-revenuecat` (shared-secret check, idempotent on event ID) writes `entitlements`, increments `renewal_count` on RENEWAL, sets `trial_ends_at` on trial start.
- Server reads `entitlements` for quota. The app reads RevenueCat customer info for UI and mirrors plan + `trialEndsAt` into the App Group.
- Upgrade card eligibility: product weekly, active, `renewal_count >= 2`, no lifetime.

## 12. Security

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
