# Replywise: Claude Code build document

One file with everything Claude Code needs to build **Replywise** (working name), an AI reply keyboard that suggests what to send next in any chat app (iOS + Android, Expo / React Native for the app, native Swift and Kotlin for the keyboards, Supabase in the EU). Based on the AI reply keyboard teardown (Lovekey键盘, 高情商键盘, RIZZ, Plug AI, Smoothspeak, RizzKey, WingAI).

## How to use this document (for you)

1. Make an empty folder for the app. Put this file in it as `BUILD.md`. If you have `ai-reply-keyboard-teardown.md`, put it there too.
2. Open a terminal in the folder and run `claude`.
3. Paste: **`Read BUILD.md and do Step 0.`** Claude Code creates the project files (CLAUDE.md, agents, inventory, spec, architecture) from Part B.
4. Then paste the prompts in Part C one at a time, in order (Prompt 0, 1, 2…). Start each with a fresh session (`/clear`); CLAUDE.md reloads by itself.
5. After each prompt: run `/verify`, try the app and the keyboard on your phones, commit.

Contents: Part A overview · Step 0 · Part B files to create · Part C build prompts.

---

# Part A: Overview

A keyboard that writes the reply for you, in any chat app. Copy the other person's message, switch to Replywise with the globe key, tap **Reply**, pick one of three suggestions. It replies in the chat's language (English, German, French, Spanish, Italian) with the right formality (du/Sie, tu/vous, tú/usted, tu/Lei).

- **Platforms:** iOS and Android. The containing app is Expo (React Native, TypeScript). The keyboards are native: an iOS Keyboard Extension in Swift/SwiftUI and an Android `InputMethodService` in Kotlin. React Native never runs inside a keyboard.
- **Markets:** UK, Germany, France, Spain, Italy. Five languages at launch. Age 18+.
- **Model:** typing is always free. AI replies: 10 starter replies, then 3 free per day. Unlimited: Annual €29.99/year with a 3-day free trial (EUR reference price; the app shows the store's price). Weekly and Lifetime were dropped on 2026-11-13 (`docs/decisions.md`, `docs/pricing.md`).
- **Privacy promise:** nothing you type leaves your phone unless you tap Reply or Polish. Then only the copied message and your draft go to an EU-hosted AI. We don't keep your chats. No keystroke logging, ever.

The product is based on a teardown of the Chinese reply keyboards (Lovekey #4 in CN Utilities top-grossing, 高情商键盘 #16 in Reference, single-day chart pull on 25 Oct 2026) and the Western screenshot apps. See `docs/teardown.md`.

## Files Step 0 creates

| File | What it is | Who reads it |
|---|---|---|
| `README.md` | Part A of this document | You |
| `inventory.md` | Every tool, service and account to use, with why, cost and setup order | You |
| `BUILD.md` | This document; Part C has the build prompts | You → Claude Code |
| `CLAUDE.md` | Project rules Claude Code loads automatically every session | Claude Code |
| `AGENTS.md` | Short pointer for other AI tools (Cursor, Codex) to the same rules | Other AI tools |
| `.claude/agents/*.md` | 9 specialist sub-agents: tests, code review, keyboard extension, prompts, backend, translations, privacy, accessibility, release | Claude Code |
| `.claude/commands/verify.md` | `/verify` command: lint, types, unit tests, Swift and Kotlin tests, i18n, database and function tests | Claude Code |
| `docs/product-spec.md` | The v1 spec: screens, keyboard, replies, free vs paid, notifications, data | Claude Code + you |
| `docs/architecture.md` | How it works: app, two native keyboards, App Group, AI proxy, data model | Claude Code + you |
| `docs/teardown.md` | The competitor teardown, if you put it in the folder | Reference |

## Before you start

Open the accounts in `inventory.md` §8 (AWS Bedrock model access and the Apple App Group / keychain setup take the longest to get right) and install the tools in §9. You need a real iPhone and a real Android phone: keyboards cannot be tested properly in a simulator.

## Rules that matter most

- **The keyboard types without Full Access and without network.** AI is an extra on top of a working keyboard (Apple 4.4.1).
- **Nothing leaves the phone unless the user taps Reply or Polish.** No keystroke logging, no reading other apps, no analytics SDK inside the keyboard.
- **The app and keyboard never call the AI directly.** One Edge Function holds the keys, checks the quota and logs cost, never message text.
- **Honest money.** Visible ✕ on the paywall, exact trial terms, a reminder before the charge, the price per period from the store.
- **No sexual content, 18+ only, every suggestion labelled as AI.**

## Build order at a glance

| Phase | Prompts | Result |
|---|---|---|
| Foundation | 0–2 | Repo with app + keyboard targets, design system, 5 languages, Supabase schema with security rules |
| AI core | 3–4 | The AI proxy with quotas and fallback, versioned prompts and an eval set |
| iOS keyboard | 5–6 | Native keyboard that types offline, then the reply bar with streaming replies |
| App | 7–10 | Onboarding with consent and keyboard setup, RevenueCat paywall with trial reminder, optional sign-in, free counter and referral, home and settings |
| Android | 11 | Native Android keyboard with the same reply bar |
| Trust | 12–14 | AI quality and safety pass, monitoring and cost, accessibility and translation pass |
| Launch | 15 | Store listings, privacy labels, builds ready to submit |

Plan on 8–12 weeks of evenings for one person, most of it in prompts 5, 6, 11 and 12.

---

# Step 0 (for Claude Code): create the project files

When the user says "do Step 0":
1. Create every file listed in Part B at its exact path, with exactly the content between the `~~~~` fences (don't include the fence lines or the "File:" heading). Create folders as needed (`docs/`, `.claude/agents/`, `.claude/commands/`).
2. If `ai-reply-keyboard-teardown.md` is in this folder, move it to `docs/teardown.md`. If not, create `docs/teardown.md` with one line: "Teardown not provided; see docs/product-spec.md."
3. Create `README.md` from Part A of this document.
4. Keep `BUILD.md` in the repo (Part C has the prompts).
5. Don't write any app code yet. List the files you created and stop.

---

# Part B: Files to create

> **Snapshot.** Part B is the content Step 0 wrote on day one. The files in the repo have moved on since (for example the 2026-11-13 decisions in `docs/decisions.md`: Annual only, 4-screen onboarding, sign-in after the paywall, RevenueCat Paywalls). Where Part B and a repo file disagree, the repo file wins; don't re-run Step 0 over an existing repo.


## File: `CLAUDE.md`

~~~~markdown
# CLAUDE.md: Replywise

AI reply keyboard (working name Replywise). The user copies a message in any chat app, opens our keyboard, taps Reply and inserts one of 3 suggestions in the chat's language and formality. Three parts:
- **Containing app:** Expo (React Native, TypeScript). Onboarding, consent, keyboard setup guide, paywall, settings, referral, support.
- **iOS keyboard:** native Keyboard Extension (Swift + SwiftUI) in `targets/keyboard/`, added with `@bacons/apple-targets` (expo-apple-targets).
- **Android keyboard:** native `InputMethodService` (Kotlin) in the local Expo module `modules/replywise-ime/`.
- **Backend:** Supabase (Frankfurt). Postgres + RLS, Edge Functions (Deno). The `reply` Edge Function is the only thing that talks to an LLM.

Markets: UK, DE, FR, ES, IT. Age 18+.

Read before any feature work:
- `docs/product-spec.md`: what v1 does (source of truth for behaviour, copy, prices, limits)
- `docs/architecture.md`: how it works (App Group, auth for the keyboard, reply pipeline, keyboard state machine, data model)
- `inventory.md`: which libraries and services to use. Don't add a dependency that isn't listed without asking.

## Non-negotiable rules

1. **No React Native, Hermes or JS inside a keyboard.** Keyboards are Swift (iOS) and Kotlin (Android). Keep the iOS extension under 40 MB resident memory at all times (Apple doesn't publish the limit; developers report jetsam kills around 48–70 MB). No images larger than needed, no web views, no third-party SDKs in the extension.
2. **Typing works without Full Access and offline.** Layouts, globe/next-keyboard, delete with repeat, shift, return, space, autocapitalise. AI is an extra. Never block typing on network, consent or payment.
3. **Nothing leaves the phone unless the user taps Reply or Polish.** No keystroke logging, no sending of typed text in the background, no reading the pasteboard except once on a Reply tap, no reading other apps. The keyboard sends only: the copied text (Reply) or the draft before the cursor (Polish), plus the chips the user chose.
4. **The client never calls an LLM.** App and keyboards call only the `reply` Edge Function. Provider keys live only in Edge Function secrets. The function enforces consent, age, quota and plan on the server.
5. **Never store or log message content.** Not in Postgres, not in logs, not in Sentry, not in PostHog. `ai_requests` stores counts, tokens, cost, language and chip choices only. Use providers with no training on inputs and EU processing (see inventory §3).
6. **AI consent before any AI call.** No request without a `consents` row of kind `ai_sharing` that isn't withdrawn, and age confirmed 18+. Withdrawal stops AI in the app and keyboard immediately.
7. **Every suggestion is labelled "AI suggestion"** (EU AI Act Art. 50). No sexual content, no harassment, no manipulation or coercion scripts, no replies that pretend to be a human coach. Crisis messages get supportive replies and the crisis line card (spec §9).
8. **Honest money.** Paywall ✕ visible from the first frame and leads to the free tier. Price per billing period in local currency from the store, never hard-coded. No countdowns, no scarcity, no per-day headline. Lifetime is a non-consumable that never expires or changes meaning. Never trade free uses for ratings or reviews.
9. **Every user-facing string goes through i18n** in all 5 locales (en-GB, de, fr, es, it), in the app and in both keyboards. Keyboards read strings generated from `locales/` (see architecture §9). No hard-coded text.
10. **Row Level Security on every table.** The service-role key lives only in Edge Functions. The keyboard authenticates with a device key, never with the service-role key or a provider key.

## How to work

- **Plan first.** For any task bigger than a one-file fix, write a short plan (files to touch, tests to add) and wait for approval.
- **Small steps.** One feature per branch/commit. Don't refactor unrelated code.
- **Tests with every change.** Pure logic (quota, entitlements, language rules, SSE parsing, layouts) gets unit tests first. Edge Functions get Deno tests. SQL/RLS gets pgTAP. Swift core logic gets `swift test`. Kotlin core logic gets JVM unit tests. Screens get RNTL tests. Critical app flows get a Maestro flow. Prompts get evals.
- **Run `/verify` before saying a task is done.** Report what passed and what didn't. Never weaken or delete a test or an eval case to make it pass; fix the code or ask.
- **Use the sub-agents** in `.claude/agents/`:
  - `test-engineer`: write and run tests after any feature
  - `code-reviewer`: review every diff before commit
  - `keyboard-extension-engineer`: anything in `targets/keyboard/`, `modules/replywise-ime/`, `modules/keyboard-bridge/`, App Group, shared keychain, Full Access, memory, clipboard, text insertion
  - `prompt-engineer`: anything in `supabase/functions/_shared/prompts/`, `evals/`, model choice, tone/language quality, safety rules for output
  - `backend-engineer`: migrations, RLS, Edge Functions, quota, RevenueCat webhook
  - `i18n-localizer`: any new or changed string (app, keyboards, store)
  - `privacy-compliance`: any change to data sent, stored or logged, consent, permissions, SDKs, providers, store labels
  - `accessibility-auditor`: any new screen or keyboard UI
  - `release-manager`: builds, versions, store metadata
- When unsure about product behaviour, check `docs/product-spec.md`, then ask. Don't invent features.

## Commands

```bash
npx expo start                          # dev server (development build, not Expo Go)
npx expo prebuild --clean               # regenerate ios/ and android/ after config or target changes
npx expo run:ios --device               # build app + keyboard extension to a real iPhone
npx expo run:android --device           # build app + IME to a real Android phone
npm run lint && npm run typecheck       # ESLint + tsc --noEmit
npm test                                # Jest + RNTL
npm run i18n:check                      # keys in all 5 locales, placeholders match, banned phrases, keyboard strings generated
swift test --package-path targets/keyboard          # Swift core logic (layouts, quota cache, SSE parser, request builder)
(cd modules/replywise-ime/android && ./gradlew testDebugUnitTest)   # Kotlin core logic
supabase start                          # local backend (Docker)
supabase db reset                       # re-run migrations + seed
supabase test db                        # pgTAP tests
deno test --allow-env --allow-net=127.0.0.1 supabase/functions   # Edge Function tests (fake LLM provider)
npm run evals -- --prompt reply         # run the eval set against the local reply function
maestro test e2e/                       # end-to-end app flows
eas build --profile development         # dev client build
```

## Code style

- TypeScript strict. No `any` (use `unknown` + zod). No default exports except Expo Router screens.
- Feature folders: `src/features/<feature>/{components,hooks,api,__tests__}`.
- Pure functions for logic, thin components. Business logic never lives inside a component.
- zod schemas in `supabase/functions/_shared/schemas.ts` are the API contract; the app imports them (path alias `@shared`). Swift and Kotlin mirror them in `ReplyAPI.swift` / `ReplyApi.kt`; a contract test checks field names against `docs/reply-api.json` (generated from zod).
- Swift: logic that doesn't need UIKit lives in `targets/keyboard/Core/` (no UIKit import, so `swift test` runs on macOS). SwiftUI views in `targets/keyboard/UI/`. Kotlin: logic in `modules/replywise-ime/android/src/main/java/.../core/`, views in `.../ui/`.
- Names: components `PascalCase`, hooks `useThing`, TS files `kebab-case.ts`, Swift/Kotlin types `PascalCase`.
- Errors: show the user what happened and what to do next; log to Sentry (app and functions only) with no message content and no personal data.
- Analytics events only from the list in `docs/product-spec.md` §12, with no personal data and no message content.

## Secrets and config

- `.env` (never committed): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_REPLY_FUNCTION_URL`.
- Edge Function secrets via `supabase secrets set`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `LLM_MODE` (`fake|live`), `REVENUECAT_WEBHOOK_SECRET`, `POSTHOG_KEY`, `SENTRY_DSN`, `DAILY_COST_ALERT_EUR`.
- App Group: `group.app.replywise.shared`. Keychain access group: `$(AppIdentifierPrefix)app.replywise.shared`. Bundle IDs: `app.replywise` (app), `app.replywise.keyboard` (extension). Android package `app.replywise`.
- Local and CI use `LLM_MODE=fake` (deterministic canned replies). Only staging and production call real models.

## Definition of done

- Behaviour matches `docs/product-spec.md`.
- `/verify` passes.
- New strings exist in all 5 locales and in the generated keyboard string files.
- Reviewed by `code-reviewer`; keyboard changes also by `keyboard-extension-engineer`; prompt changes also by `prompt-engineer` with an eval report.
- Anything touching a keyboard was tried on a real iPhone and a real Android phone, with Full Access on and off, in at least two host apps (WhatsApp and Messages / Google Messages).
~~~~


## File: `AGENTS.md`

~~~~markdown
# AGENTS.md

This project's rules for AI coding tools live in `CLAUDE.md`. Read it first; it applies to every tool (Claude Code, Cursor, Codex, Copilot).

Key files:
- `CLAUDE.md`: non-negotiable rules, commands, code style, definition of done
- `docs/product-spec.md`: what the app and keyboards do
- `docs/architecture.md`: how it works (App Group, keyboard auth, reply pipeline)
- `inventory.md`: approved libraries and services
- `.claude/agents/`: specialist roles (tests, review, keyboard extension, prompts, backend, i18n, privacy, accessibility, release). Tools that don't support sub-agents can read these files as checklists.

The two keyboards are native code (Swift in `targets/keyboard/`, Kotlin in `modules/replywise-ime/`). Never put React Native or JavaScript inside them.
~~~~


## File: `inventory.md`

~~~~markdown
# Inventory: what to use for Replywise

Everything this app needs, why it was picked, and what it costs. Prices and model names change often; check the vendor's page before you sign up.

Picking rule: TypeScript for the app and server, Swift and Kotlin only where the OS demands it (the keyboards), EU data processing, no training on user input, and no SDK that tracks users across apps (so no App Tracking Transparency prompt).

## 1. Mobile app (iOS + Android)

| Need | Use | Why | Notes |
|---|---|---|---|
| Framework | **Expo** (React Native), latest stable SDK (SDK 58 at time of writing; check expo.dev/changelog) | One codebase for the containing app; config plugins and local modules add the native keyboards | Use a **development build** (`expo-dev-client`), not Expo Go: keyboards, App Groups and in-app purchase need native code |
| Language | **TypeScript**, `strict: true` | | |
| Navigation | **Expo Router** | File-based routes, deep links (`replywise://`, referral links) | |
| Server state | **TanStack Query** | Caching and retries for quota, entitlements | |
| Local state | **Zustand** | Small and simple | |
| Local storage | **react-native-mmkv** (settings cache), **expo-secure-store** (device key, with `accessGroup` set to the shared keychain group on iOS; check the option name in current docs) | | |
| Shared with keyboard | Local Expo module **`modules/keyboard-bridge`** (Swift + Kotlin): read/write App Group `UserDefaults(suiteName:)` on iOS and `SharedPreferences` on Android; keyboard status (added, Full Access, default IME) | One small module we own instead of a third-party package | |
| Forms | **react-hook-form** + **zod** | Same zod schemas as the server | Only the support form and Try-it field |
| Notifications | **expo-notifications**, local only | Trial-ends reminder, annual renewal reminder, optional "free replies are back" | No remote push in v1, so no push tokens |
| Localization | **i18next** + **react-i18next** + **expo-localization** | en-GB, de, fr, es, it; plurals | Strings in `locales/<lang>/*.json`; a script generates keyboard string files |
| Animation | **react-native-reanimated** | Keyboard setup guide animation, demo loop | Respect Reduce Motion |
| Haptics | **expo-haptics** | | |
| Styling | Plain `StyleSheet` + tokens in `src/theme` | Same tokens exported to Swift and Kotlin colour files | |
| Icons | **@expo/vector-icons** (Lucide set) | | |
| Share referral | React Native `Share` API | User shares their own link | |

## 2. The keyboards (native)

| Need | Use | Why | Notes |
|---|---|---|---|
| iOS keyboard target | **`@bacons/apple-targets`** (expo-apple-targets, Evan Bacon) target type `keyboard` | Adds a native Keyboard Extension target during `expo prebuild`; code lives in `targets/keyboard/` outside `ios/` | Its docs say the keyboard target does **not** auto-sync the App Group entitlement; set `com.apple.security.application-groups` and `keychain-access-groups` explicitly in `targets/keyboard/expo-target.config.js` and in the app's entitlements |
| iOS keyboard UI | **Swift + SwiftUI** hosted in `UIInputViewController` via `UIHostingController` | Native, low memory | iOS 16+ minimum (to confirm against current Expo SDK minimum) |
| iOS language detection | **NaturalLanguage** `NLLanguageRecognizer` | On device, no network | |
| iOS networking | `URLSession` with `bytes(for:)` for server-sent events | No extra library | Only with Full Access (`RequestsOpenAccess = YES` in the extension's Info.plist) |
| iOS crash data for the extension | **MetricKit** diagnostics written to the App Group, uploaded by the app to Sentry | No SDK inside the extension | |
| Android keyboard | **`InputMethodService`** in Kotlin inside the local Expo module **`modules/replywise-ime`** | The module's `AndroidManifest.xml` declares the service with `BIND_INPUT_METHOD` and `res/xml/method.xml`; merges into the app at build | Add a small config plugin only if something can't live in the module manifest |
| Android keyboard UI | **Jetpack Compose** inside the IME view (set the ViewTree lifecycle and saved-state owners on the decor view), or plain Views if Compose memory or startup is a problem | `keyboard-extension-engineer` decides after measuring in prompt 11 | |
| Android language detection | `TextClassifier` language detection (API 29+), fallback to the active subtype locale | No ML Kit download | |
| Android networking | **OkHttp** with SSE (`okhttp-sse`) | Small, standard | |

## 3. Backend and AI (EU)

| Need | Use | Why | Notes |
|---|---|---|---|
| Database, auth, API | **Supabase**, region **Frankfurt (eu-central-1)** | Postgres + RLS + auth + Edge Functions; EU hosting | Free tier for dev, **Pro ($25/mo)** before launch |
| User accounts | Supabase **anonymous sign-in** in the app, later linked to **Sign in with Apple / Google** | No email, phone or password in v1 | The keyboard uses a separate device key (architecture §4) |
| Server code | Supabase **Edge Functions** (Deno, TypeScript) | `reply`, `device-key`, `quota`, `consent`, `referral`, `support`, `webhooks-revenuecat`, `delete-me` | Invoke `reply` pinned to Frankfurt (region header `x-region: eu-central-1`; check current Supabase docs) |
| LLM, primary | **Anthropic Claude on Amazon Bedrock** through the **EU cross-region inference profile** (model IDs start with `eu.`), source region Frankfurt (`eu-central-1`). A small fast model for replies (a current Claude Haiku-class model; check current model names in the Bedrock console) | EU geography processing; per AWS, model providers have no access to prompts and completions; no training on inputs | Check the account's Bedrock data-retention mode (AWS documents a `data_retention` setting and abuse-detection storage for some models) and pick the setting that stores nothing. Sign the AWS DPA (part of the AWS customer agreement) |
| LLM, fallback | **Mistral AI La Plateforme** (Paris), a current Mistral Small-class model (check current model names) | EU company, EU hosting | Ask Mistral for zero data retention on the API account and confirm in writing before launch; sign their DPA |
| Prompt files | `supabase/functions/_shared/prompts/*.v1.md` | Versioned, reviewed like code | |
| Evals | `evals/<prompt>/cases.jsonl` + `scripts/run-evals.ts` (Deno) | 20–40 cases per prompt, run on every prompt change | |
| Cost guide | Log input/output tokens and cost per request in `ai_requests` | Budget assumption: a reply call is ~700 input + ~200 output tokens; multiply by current per-token prices | LLM cost per reply per language is unknown until measured in prompt 3; it decides the free allowance and the lifetime fair-use cap |

## 4. Money

| Need | Use | Why | Notes |
|---|---|---|---|
| Purchases | **RevenueCat** (`react-native-purchases` + `react-native-purchases-ui` for nothing but restore and manage; our own paywall screen) | One API over StoreKit 2 and Google Play Billing, webhooks to Supabase | Free until ~$2.5k monthly revenue, then ~1% (check current) |
| Products | `weekly` €4.99 with 3-day free trial (introductory offer); `annual` €39.99; `lifetime` €59.99 non-consumable (Play: one-time in-app product); `lifetime_upgrade` (price to decide, only offered to weekly subscribers) | From the teardown v1 scope | Set GBP and other prices via store price tiers |
| Entitlement | `unlimited` | One entitlement; weekly, annual, lifetime and lifetime_upgrade all grant it | Lifetime has a fair-use cap of 100 replies/day; subscriptions a silent abuse cap of 300/day |
| Subscription management | StoreKit `showManageSubscriptions` (iOS), Play subscriptions deep link (Android); Apple refund link `reportaproblem.apple.com` | Settings "Manage or cancel", "Request a refund" | DE label "Verträge hier kündigen" |

## 5. Quality, monitoring, analytics

| Need | Use | Why | Notes |
|---|---|---|---|
| Crash and error reports | **Sentry**, EU data region (`de.sentry.io`), app + Edge Functions only | Not inside the keyboards (memory and privacy) | Keyboard crashes come from MetricKit (iOS) and a small crash file the IME writes (Android), uploaded by the app |
| Product analytics | **PostHog**, EU cloud, app only; server events sent from Edge Functions via the capture API | Funnels: onboarding, keyboard added, Full Access, first insert, trial, purchase | No IDFA, no ATT prompt, no message content |
| Uptime and provider health | **Better Stack** (Uptime + status page) | Pings `reply` health endpoint; pages you if both providers fail | `provider_status` table drives the in-keyboard "AI is down" banner |
| Unit and component tests | **Jest** + **React Native Testing Library** | App logic and screens | |
| Native tests | **XCTest via `swift test`** (Swift core), **JUnit** via Gradle (Kotlin core) | Keyboard logic without a device | |
| End-to-end tests | **Maestro** | App flows: onboarding, paywall ✕, settings | Keyboard UI is tested by hand on devices (checklist in `docs/keyboard-manual-test.md`) |
| Server tests | **Deno test** (functions, with a fake LLM provider), **pgTAP** (SQL and RLS) | | |
| Evals | `npm run evals` | Language match, formality, length, banned phrases, safety | |
| Lint and format | **ESLint** + **Prettier** + `tsc --noEmit`; **SwiftFormat**; **ktlint** | | |
| CI | **GitHub Actions**: lint, type-check, Jest, Deno, pgTAP on every push; `swift test` on a macOS runner; Gradle unit tests; **EAS Build** on tags | | |

## 6. Builds and releases

| Need | Use | Notes |
|---|---|---|
| Native builds | **EAS Build** | The keyboard target needs its own provisioning profile; EAS credentials handle multiple targets (check current docs) |
| Store upload | **EAS Submit** | |
| Over-the-air fixes | **EAS Update** | JS only. Can't change the keyboards. Never use it to change what data is sent or collected |
| Store screenshots | Device screenshots + **Figma** | 5 languages; show the keyboard inside a chat |
| App icon | Figma | |

## 7. Legal and trust

| Need | Use | Notes |
|---|---|---|
| Privacy policy and terms | **iubenda** or a lawyer | Must cover the other person's messages, AI providers (AWS, Mistral), Supabase, RevenueCat, Sentry, PostHog, Expo; lifetime fair-use line |
| DPIA | `docs/dpia.md` drafted in prompt 12, reviewed by a lawyer | Chats can contain special-category data (GDPR Art. 9) |
| Data processing agreements | Sign each vendor's DPA | List in `docs/processors.md` |
| Domain and DNS | **Cloudflare** | Privacy pages, referral landing `/r/<code>`, support email |
| Support inbox | Shared inbox on your domain | "Write to the maker" promises a reply within 48 h |

## 8. Accounts to open before coding (in this order)

1. **Apple Developer Program**: $99/year. Register the App ID for the app and the keyboard, the App Group `group.app.replywise.shared` and the keychain group in prompt 0.
2. **Google Play Console**: $25 one-time.
3. **Expo account**: free.
4. **Supabase**: free project in Frankfurt for dev; a second project for production later.
5. **AWS account**: enable Amazon Bedrock in `eu-central-1`, request access to the Claude model you'll use, create an IAM user with `bedrock:InvokeModelWithResponseStream` on the EU inference profile only. Model access approval can take time; start now.
6. **Mistral AI** La Plateforme: API key; request zero data retention.
7. **RevenueCat**: free; connect App Store Connect and Play Console in prompt 8.
8. **Sentry** (EU) and **PostHog** (EU): free tiers.
9. **Better Stack**: free tier.
10. **GitHub**: private repo.
11. **A domain** (Cloudflare): privacy pages, referral links, support email.

## 9. Tools on your Mac

Node LTS, Git, Xcode (latest, with iOS simulator), Android Studio (with emulator), Watchman, Claude Code, EAS CLI, Supabase CLI, Docker Desktop, Deno, Maestro, SwiftFormat, a real iPhone and a real Android phone (keyboard behaviour, Full Access, clipboard and memory limits are only realistic on devices).

## 10. What we deliberately don't use

| Not this | Why |
|---|---|
| React Native inside the keyboard | Memory: a JS runtime alone risks the extension being killed; iOS keyboards must be native |
| Any SDK inside the keyboards (Sentry, PostHog, RevenueCat, ads) | Memory and trust: the keyboard sees what people type |
| Calling OpenAI/Anthropic/Mistral from the phone | Keys would leak; no quota or cost control; no central consent check |
| US-only AI endpoints | GDPR Chapter V; EU processing is part of the promise |
| Firebase Analytics, Meta SDK, AppsFlyer, Adjust | Ad tracking → ATT prompt; 高情商键盘's tracking SDKs are a trust risk in the teardown |
| Contacts, photos, location, phone number | Not needed for a reply keyboard; GDPR minimisation; Lovekey reviewers question it |
| Screenshot/OCR input in v1 | Backlog item 14; more data, more cost |
| Email + password login | Anonymous + Apple/Google is enough |
| Remote push | Only local reminders are needed in v1 |

## 11. Monthly running cost at launch (rough, check current)

| Item | Cost |
|---|---|
| Supabase Pro | ~$25 |
| EAS Starter (optional) | ~$19 |
| LLM tokens | pay per reply; free users cost 3 replies/day each at most. Measure cost per reply in prompt 3 and set `DAILY_COST_ALERT_EUR` |
| Better Stack, Sentry, PostHog | free tiers |
| Apple + Google | ~$8/month spread ($99/yr + $25 once) |
| **Total** | **~$50–100/month + LLM usage** before any revenue |
~~~~


## File: `docs/product-spec.md`

~~~~markdown
# Product spec v1: Replywise

Source: `docs/teardown.md` (ranked items 1–10 and section 8 "Recommended v1 scope"). This file is the single source of truth for what v1 does. If code and this file disagree, ask before changing either. Prices are starting hypotheses to test.

## 1. The promise

"The right reply, in any chat."
Under it: "Replies are written by AI. You choose what to send."

Who it's for: adults (18+) in the UK, DE, FR, ES, IT who want better replies to a match, partner, friend, family member or colleague, in their own language.

Name: Replywise is a working name. Keyboard display name in iOS/Android settings: "Replywise".

## 2. Onboarding (containing app, in this order)

| # | Screen | Content | Notes |
|---|---|---|---|
| 1 | Welcome | "The right reply, in any chat" + 3-second looping demo of the keyboard bar inserting a reply. Button: Continue | No rating ask, no push ask. Anonymous account created silently |
| 2 | Age check | "Are you 18 or over?" Yes / No | No → stop screen: "Replywise is for adults. AI replies are off." Keyboard still types; AI never enabled for this install. Store `age_confirmed_at` |
| 3 | One question | "Who do you text most?" chips Match / Partner / Friends / Work (multi-select). Skip | Sets the default relationship chip (first selected; Friends → Friend, Work → Colleague) |
| 4 | What Replywise can see | Three lines: "Nothing you type leaves your phone unless you tap Reply or Polish." "When you tap, only the copied message and your draft go to our AI provider, processed in the EU." "We don't keep your chats." Buttons: "Allow AI replies" / "Not now" | Records consent (kind `ai_sharing`, policy version, timestamp). Must come before any AI call, so before Try it (Apple 5.1.2(i)). "Not now" → plain keyboard; AI can be allowed later in Settings |
| 5 | Try it now | In-app text field pre-filled with a sample incoming message in the device language (e.g. de: "Hey, wie war dein Wochenende? 😊"). Tap Reply → 3 real replies in the chosen tone, with "AI suggestion" labels | Uses 1 of the 10 starter replies. The aha before price. Skipped if consent was "Not now" |
| 6 | Add the keyboard | 3-step animated guide. Button "Open Settings" opens the app's own page in iOS Settings (which lists Keyboards → Replywise). Android: opens input method settings, then the keyboard picker | App detects the keyboard (iOS: keyboard-bridge check; Android: enabled IME list) and shows a success tick |
| 7 | Allow Full Access (iOS) | Same guide style. "Typing works without it. AI replies need it, because the keyboard has to reach our server when you tap Reply. We never send what you type unless you tap." Android: "Android will warn that keyboards can collect what you type. Replywise only sends text when you tap Reply or Polish." | App detects Full Access from the keyboard's heartbeat in the App Group; "Skip for now" allowed |
| 8 | Paywall | See §6. ✕ visible at once; ✕ leads to the free tier | Shown once in onboarding |
| 9 | Reminder ask | Only if a trial started: "Want a reminder before you're charged?" Yes → OS notification prompt | Schedules the trial-ends reminder |
| 10 | Done | "Copy their message, switch to Replywise with the globe key, tap Reply." Counter shows replies left | Then Home |

## 3. The keyboard (iOS and Android)

### 3.1 Typing (always free, works without Full Access and offline)

- Layouts: QWERTY for en, es (with ñ), it; QWERTZ for de (ä ö ü ß); AZERTY for fr (é è à ç ù). Long-press accents for all. Layout follows the keyboard language chosen in app settings (default: device language).
- Keys: shift (double-tap caps lock), delete with repeat (accelerates after 0.5 s), space, return (label from the host's return key type), 123/symbols, emoji key opens the system emoji keyboard on iOS (via next-keyboard), globe/next-keyboard (shown when `needsInputModeSwitchKey` is true on iOS; on Android the switch-IME key).
- Autocapitalise after ". ! ?" and at field start; double-space → ". ".
- Key press haptic (light) and click sound follow system settings.
- No word prediction in v1 (backlog item 16).

### 3.2 The reply bar (above the keys)

Left to right: **Reply** · **Polish** (only when the field has text before the cursor) · counter chip ("3 left today", hidden for unlimited) · settings chip that opens the chip panel.

Chip panel (one row each, scrolls horizontally):
- **Who:** Match, Partner, Friend, Family, Colleague. Last choice remembered.
- **Closeness:** 5 steps: Just met · Getting to know · Friendly · Close · Very close.
- **Tone (8):** Warm, Funny, Flirty, Confident, Calm, Apologise, Say no kindly, Professional. Flirty hidden for Colleague and Family.
- **Flirt level:** Off · Light · Playful. Only for Match and Partner. No explicit level exists.
- **Formality:** Casual / Formal. Default Casual for Match, Partner, Friend, Family; Formal for Colleague. Maps to du/Sie, tu/vous, tú/usted, tu/Lei; in English, Formal means a polite, plain register.

### 3.3 Reply flow

1. User copies the other person's message in the chat app, opens Replywise, taps **Reply**.
2. The keyboard reads the clipboard once (only now), shows a one-line preview "Replying to: Hey, wie war dein…" with ✕ to cancel. If the clipboard is empty or not text: "Copy their message first, then tap Reply." Max 1,000 characters are used (the rest is cut, with a note).
3. Language is detected on device and sent as a hint. Replies come back in the language of the copied message (en/de/fr/es/it). Other languages: reply in the keyboard language and say so in a one-line note.
4. 3 reply cards stream in; target first card ≤ 1.5 s, all three ≤ 3 s (p50 on 4G). Each card: the text, a small "AI suggestion" label, 👍 / 👎.
5. Tap a card → the text is inserted at the cursor. The user edits and sends in the chat app. We never send anything.
6. "↻ More" gets 3 new replies (counts as one more reply against the free allowance).
7. Changing a chip after results asks "Update replies?" (counts as one reply).

### 3.4 Polish flow

- Shown when the field has text before the cursor. Uses that text (up to 1,000 characters).
- Returns two cards: **Light edit** (grammar and flow, same words where possible) and **Rewrite** (in the selected tone, relationship and formality).
- Tap a card → the original draft before the cursor is deleted and the new text inserted.
- Counts as one reply against the free allowance.

### 3.5 Keyboard states (one-line bar messages)

| State | Bar shows |
|---|---|
| No Full Access | "Turn on Full Access in Settings for AI replies. Typing works without it." (+ the Settings path as text) |
| No AI consent / under 18 / consent withdrawn | "AI replies are off. Turn them on in the Replywise app." |
| Not signed up yet (app never opened) | "Open the Replywise app once to set up AI replies." |
| Offline | "No connection. AI replies need the internet." |
| Out of free replies | "Out of free replies. More tomorrow, or go unlimited in the Replywise app." (the keyboard cannot open the app) |
| Fair-use cap reached (paid) | "Daily limit reached. Back tomorrow." |
| AI provider down | "AI replies are having trouble. Try again in a minute." |
| Last trial day | "Your free trial ends tomorrow: €4.99/week after that. Manage in the Replywise app." |
| Crisis detected | Crisis card (see §9) above the reply cards |

## 4. Reply quality rules (all languages)

- 3 replies that differ in approach (e.g. a question back, a statement, a light joke), each ≤ 200 characters unless the incoming message is long.
- Sound like a real person texting: short sentences, no hashtags, no "As an AI", no quotes around the text.
- Respect grammatical gender from Settings "I am" / "They are" (woman, man, rather not say). With "rather not say", use gender-neutral phrasing where the language allows. Never assume the user is a man.
- Emoji: match the incoming message (none if it has none; at most one otherwise).
- Banned per language: pet names to people who just met, pick-up-line clichés, "greasy" lines, passive-aggressive phrasing. Lists in the prompt files.
- Per-language rules: address form, gender agreement, punctuation (Spanish ¿ ¡, French spaces before ? ! ; :), UK spelling for English.

## 5. Free vs paid

| | Free | Unlimited (any plan) |
|---|---|---|
| Typing | ✓ | ✓ |
| AI replies + Polish | 10 starter replies on install, then 3 per day (reset at local midnight) | Unlimited (fair use: lifetime 100/day; subscriptions 300/day abuse cap) |
| All tones, chips, formality, languages | ✓ | ✓ |
| Referral bonus | +10 replies for you and your friend after the friend's first inserted reply | n/a |

- One "reply" = one Reply, ↻ More, chip update or Polish request.
- Counter is authoritative on the server (by user ID); the keyboard shows a cached value from the App Group.
- Never tie free uses to ratings, reviews or shares on social media.

## 6. Paywall

Shown once in onboarding (screen 8), then only when the user taps "Go unlimited" (home, settings, out-of-replies card in the app).

- ✕ visible from the first frame, top-left, 44 pt hit area. ✕ → free tier, never replays intro.
- Three plans, Annual pre-selected:
  - **Weekly €4.99**, 3-day free trial.
  - **Annual €39.99**, secondary line "€0.77 a week" under the yearly price (never as the headline).
  - **Lifetime €59.99**, "Pay once. Unlimited replies for as long as the app exists." + "Fair use: up to 100 replies a day."
- Trial timeline row (shown when Weekly is selected): "Today: free · Day 2: we remind you · Day 3: €4.99/week starts".
- All prices from the store in local currency. No countdown, no scarcity, no per-day headline.
- Links: Terms, Privacy, Restore purchases, Manage subscription. Auto-renew text under the button.
- **Upgrade to lifetime:** after a weekly subscriber's 2nd renewal, one card on Home: "Switch to lifetime for €X" (product `lifetime_upgrade`). After purchase, a screen: "You're on lifetime. Cancel your weekly plan so you aren't charged again." Button opens the store's subscription management.
- Never relabel or expire a lifetime purchase. Family Sharing: later.

## 7. Containing app screens

- **Home:** keyboard status card (Added ✓/✗, Full Access ✓/✗, with "Fix" buttons that reopen the guides), replies left today, Try-it field, "Go unlimited" (free users), upgrade-to-lifetime card (when eligible), provider-down banner.
- **Settings:** App language · Keyboard language and layout · Default relationship · I am / They are · Formality default · Allow AI replies (on/off = consent / withdraw) · Reminders · Manage or cancel subscription (DE: "Verträge hier kündigen") · Request a refund (Apple link on iOS; Play order history on Android) · Restore purchases · Invite friends · Enter a friend's code · Write to the maker · Privacy · Terms · Delete my data · App version.
- **Invite friends:** personal link `https://replywise.app/r/<code>` via share sheet. The landing page shows the code and store buttons. The friend enters the code in Settings or on the Done screen. +10 replies for both after the friend's first inserted reply. No cash payouts.
- **Write to the maker:** text field (≤ 2,000 chars) + optional reply email. Attaches app version, OS, language and plan status. Never chat text. "We reply within 48 hours, in your language."

## 8. Notifications (local only)

| Notification | When | Copy (en) |
|---|---|---|
| Trial ends tomorrow | 24 h before the trial converts, if the user agreed on screen 9 or in Settings | "Your free trial ends tomorrow. Then €4.99/week. Cancel anytime in Settings." |
| Annual renewal soon | 7 days before an annual renewal (prepares for UK DMCC, proposed from 1 Jan 2027) | "Your Replywise year renews on 12 Mar for €39.99." |
| Free replies are back | Optional, off by default, at most once a day, only if the user ran out the day before | "Your 3 free replies are back." |

No marketing pushes. Rescheduled on every app open from RevenueCat customer info.

## 9. Safety

- 18+ gate (screen 2). App Store and Play age rating 18+.
- No sexual or explicit replies at any setting (Apple 1.1.4). Flirt level tops out at Playful.
- Refuse and return a neutral note for requests that would harass, threaten, stalk, deceive for money, pressure someone into sex, or target a person who appears to be a minor. If the incoming message suggests the other person is a minor, never flirt.
- **Crisis:** if the copied message or draft suggests self-harm, suicide or immediate danger, replies are calm and supportive, and a card shows: "If someone is in danger, call 112." plus a country line (UK Samaritans 116 123; DE TelefonSeelsorge 0800 111 0 111; FR 3114; ES 024; IT Telefono Amico 02 2327 2327; verify all numbers before launch).
- No medical, legal or therapy claims. No "coach" persona that pretends to be human.
- Abuse: reports through "Write to the maker"; per-user rate limit 20 requests/minute.

## 10. Data kept

| Data | Where | Retention |
|---|---|---|
| Settings, chips, last choices, counter cache, consent mirror, trial end date | Device (App Group / SharedPreferences) | Until uninstall or Delete my data |
| Anonymous user ID, app language, I am / They are, age confirmation timestamp | Server `profiles` | Until deletion |
| Consent records (kind, policy version, granted/withdrawn timestamps) | Server `consents` | Until deletion + 3 years (proof of consent; to confirm with counsel) |
| Device keys (hash only) | Server `device_keys` | Until rotated or deletion |
| Daily usage counter, starter and bonus credits | Server `usage_days`, `credit_ledger` | 90 days for days; ledger until deletion |
| AI request metadata: time, kind, language, tone, relationship, closeness, formality, provider, model, tokens, cost, latency, status. **No text.** | Server `ai_requests` | 90 days, then aggregated |
| Feedback: 👍/👎 and inserted, linked to request metadata. **No text.** | Server `reply_events` | 12 months |
| Entitlement state from RevenueCat webhook | Server `entitlements` | Until deletion |
| Referral codes and redemptions | Server `referrals` | Until deletion |
| Support messages (what the user wrote to us) | Server `support_messages` + inbox | 12 months |
| **Chat text (copied message, draft, replies)** | **Memory only during the request; sent to the AI provider with no retention** | **Never stored, never used for training, never logged** |

No contacts, photos, location, phone number, email (unless the user gives one for a support reply), ad identifiers.

## 11. Languages

English (UK), German, French, Spanish (Spain), Italian for the app, both keyboards, notifications, privacy pages, store listings and screenshots. App UI uses the informal form (du, tu, tú, tu). Prompt rules per language in `supabase/functions/_shared/prompts/lang/<lang>.v1.md`. Native-speaker review of 50 replies per language per tone group before launch.

## 12. Analytics events (PostHog, no personal data, no text)

App (client): `onboarding_step_viewed {step}`, `age_gate {passed}`, `ai_consent {granted}`, `try_it_reply_shown`, `keyboard_added`, `full_access_granted`, `paywall_viewed {source}`, `paywall_closed`, `plan_selected {product}`, `trial_started`, `purchase {product}`, `reminder_opt_in {granted}`, `lifetime_upgrade_card_viewed`, `referral_shared`, `referral_redeemed`, `support_sent`, `consent_withdrawn`, `data_deleted`.

Server (from Edge Functions, keyed by anonymous user ID): `reply_requested {kind, lang, tone, relationship, closeness, formality, source: keyboard|app}`, `reply_shown {latency_ms, provider}`, `reply_inserted {card_index}`, `reply_feedback {rating}`, `quota_hit {plan}`, `provider_fallback`, `safety_flag {type}`.

## 13. Compliance must-haves

- Apple 4.4.1 keyboard rules (typing without Full Access, next-keyboard key, AI as an extra); 5.1.2(i) explicit AI-sharing consent; 3.1.2 subscription disclosures; no rating incentives; 1.1.4 no sexual content; age rating 18+.
- Google Play: IME and clipboard policies, data safety form, subscriptions policy (clear trial terms).
- EU AI Act Art. 50(1): users told replies are AI-generated (labels, onboarding line). Art. 50(2) machine-readable marking of plain text and whether recipients must be told: open, to verify with counsel before 2 Dec 2026.
- GDPR: privacy notice covering the other person's messages, lawful basis, DPIA, deletion in Settings, processor agreements.
- Consumer: Apple runs the EU 14-day withdrawal for App Store purchases (link to it; don't promise our own); no fake scarcity or countdowns (UCPD Annex I No 7); no "free" that hides the post-trial price (Annex I No 20); DE cancel entry labelled "Verträge hier kündigen" opening store management (§312k BGB scope for store billing unsettled); UK DMCC reminders (proposed 1 Jan 2027).
- App Privacy label: no tracking; data not linked to identity.

## 14. Out of scope for v1

Screenshot input, word prediction and themes, per-contact memory, openers from a bio, chat analysis card, custom personas or "my voice", inline translation, chat practice, night quiet mode, regional language variants (es-MX, fr-CA, de-CH, en-US), web purchase, human coaching, cash referrals. See the backlog in `docs/teardown.md`.
~~~~


## File: `docs/architecture.md`

~~~~markdown
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

`scripts/gen-keyboard-strings.ts` reads `locales/<lang>/keyboard.json` and writes `targets/keyboard/Core/Strings.generated.swift` and `modules/replywise-ime/android/src/main/res/values-<lang>/strings.xml`. `npm run i18n:check` fails if generated files are stale.

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
~~~~


## File: `.claude/agents/accessibility-auditor.md`

~~~~markdown
---
name: accessibility-auditor
description: Audits Replywise screens and both keyboards for accessibility (WCAG 2.2 AA, VoiceOver, TalkBack, large text, motor and low-vision needs). Use for every new or changed app screen, keyboard view or web page.
tools: Read, Grep, Glob, Bash
model: inherit
---

A keyboard is used hundreds of times a day. If it fails with VoiceOver or large text, people switch back to the system keyboard.

## App screens

- Every touchable has `accessibilityRole` and an `accessibilityLabel` from i18n; state via `accessibilityState` (selected plan, chip on/off).
- Tap targets ≥ 44×44 pt (48 dp Android). The paywall ✕ has a 44 pt hit area and the label "Close".
- Text scales to 200% without clipping; the paywall, onboarding guides and settings wrap.
- Contrast ≥ 4.5:1 body, ≥ 3:1 large text and icons, light and dark.
- Colour is never the only signal (keyboard status uses ✓/✗ plus text).
- Animated guides respect Reduce Motion (static steps instead) and have a text version.
- Focus order matches visual order; modals announce their title.

## Keyboards

- iOS: keys are accessibility elements with labels ("shift", "delete", "globe: next keyboard") and the `.keyboardKey` trait; reply cards are buttons with the full text as label and "AI suggestion" as hint; 👍/👎 have labels.
- Android: keys expose content descriptions; the IME works with TalkBack's typing modes; cards are focusable.
- The reply bar buttons and chips meet 44 pt / 48 dp height even if the key row is shorter.
- Bar messages (No Full Access, quota, offline) are announced when they appear.
- Dynamic Type: bar and cards scale up to the accessibility sizes within the keyboard height; long text truncates with the full text available to VoiceOver.
- High contrast / Increase Contrast and Bold Text respected; key labels readable in dark mode.

## Report format

`Screen or view → issue → WCAG criterion → fix`, then a short list of manual tests to run on devices (VoiceOver and TalkBack steps for: switch to keyboard, tap Reply, pick a card).
~~~~


## File: `.claude/agents/backend-engineer.md`

~~~~markdown
---
name: backend-engineer
description: Builds the Supabase side of Replywise. Use for SQL migrations, Row Level Security, SQL functions (quota), Edge Functions (Deno) including the reply proxy plumbing, device keys, RevenueCat webhook, referral, support, deletion, and provider adapters (Bedrock, Mistral, fake).
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

You own `supabase/`. Read `docs/architecture.md` fully before any change. Prompt text and eval content belong to `prompt-engineer`; you own the code around them.

## Rules

- **Migrations:** one new file per change (`supabase migration new <name>`). Never edit a merged migration. RLS enabled in the same migration as the table, with explicit policies and a pgTAP test per policy.
- **No message text in the database or logs.** There is no text column in `ai_requests` or `reply_events`. Don't log request bodies. Sentry `beforeSend` strips bodies.
- **Auth:** `_shared/auth.ts` accepts a Supabase JWT or `Authorization: Device <key>`; device keys are compared by SHA-256 hash; revoked keys fail.
- **Gate before cost:** consent and age checks, rate limit, then `consume_reply()` (one SQL function, `FOR UPDATE` on the user's day row, works under concurrent taps). Refund on failure before the first card.
- **Providers:** `_shared/llm/provider.ts` interface `{ stream(prompt, opts): AsyncIterable<string>; name; model }`. `bedrock.ts` uses `InvokeModelWithResponseStream` on the EU inference profile in `BEDROCK_REGION`; `mistral.ts` uses the EU API; `fake.ts` returns canned, language-correct lines for tests. Model IDs come from secrets, never hard-coded.
- **Streaming:** SSE with events `card`, `meta`, `quota`, `done`, `error`. Flush each card as soon as its line completes. Handle client disconnect (abort the provider call).
- **Fallback and health:** first-token timeout 2.5 s → fallback; 3 failures in 60 s → `provider_status.down_until = now()+5 min`. `health` endpoint for Better Stack.
- **Cost:** `_shared/cost.ts` holds a per-model price table (EUR per 1k tokens, "check current" comment with date). Every request logs tokens and cost.
- **Webhooks:** RevenueCat shared-secret check, idempotent on event ID.
- **Edge region:** invoke `reply` pinned to Frankfurt.
- **Retention jobs:** pg_cron daily: `ai_requests` > 90 days → aggregate then delete; `usage_days` > 90 days; `reply_events` > 12 months; `support_messages` > 12 months.
- **Secrets:** `supabase secrets set`; never in code or migrations.

## Before finishing

Run `supabase db reset`, `supabase test db`, `deno test` on functions. Ask `privacy-compliance` to review anything that changes what is sent or stored, and `prompt-engineer` for anything touching prompt assembly or output parsing.
~~~~


## File: `.claude/agents/code-reviewer.md`

~~~~markdown
---
name: code-reviewer
description: Reviews every Replywise diff before commit for correctness, security, the project rules in CLAUDE.md, and simplicity. Covers TypeScript, Swift, Kotlin and SQL. Use after completing a feature or fix, and before opening a pull request. Read-only.
tools: Read, Grep, Glob, Bash
model: inherit
---

You review changes to Replywise. You don't edit files; you report findings ranked by severity.

Start with `git diff` (or `git diff main...HEAD`), then read the changed files in full and anything they call. Read `CLAUDE.md` for the rules.

## Check, in this order

1. **Rule breaks** (block the merge): JS/React Native or a third-party SDK inside a keyboard; typing that depends on network, consent or payment; text sent without a Reply/Polish tap; pasteboard read outside the Reply tap; any keystroke logging; a client calling an LLM or holding a provider key; message text stored or logged anywhere (DB, console, Sentry, PostHog); AI call without the consent/age gate; missing "AI suggestion" label; hard-coded prices or user-facing text; paywall without a visible ✕, countdown, scarcity; free uses tied to reviews; table without RLS; service-role key in the app.
2. **Correctness:** quota races (double taps, ↻ More while streaming), refund on failure, SSE parsing across chunk boundaries, cancelled streams, timezone of the daily reset, fallback double-charging, lifetime treated as expiring, trial reminder time maths.
3. **Keyboard specifics:** retain cycles in `UIInputViewController`, work on the main thread, memory growth across sessions, `textDocumentProxy` misuse (deleting more than the draft), missing next-keyboard key, Android IME lifecycle leaks.
4. **Security and privacy:** device key stored in plain prefs (iOS must use keychain), personal data in logs or analytics, SQL built from strings, missing zod validation, prompt injection paths (user text concatenated into instructions).
5. **Tests:** each new branch of logic has a test; evals updated for prompt changes; nothing weakened.
6. **Simplicity:** unnecessary abstraction, dead code, dependencies not in `inventory.md`.
7. **Accessibility basics:** labels, tap targets, font scaling.

## Report format

```
BLOCKER  file:line  what's wrong → why it matters → fix
MAJOR    ...
MINOR    ...
OK       what you checked and found fine (one line)
```

Only report problems you can point to in the code. If something can't be judged from the diff, say what you'd need to see.
~~~~


## File: `.claude/agents/i18n-localizer.md`

~~~~markdown
---
name: i18n-localizer
description: Keeps all Replywise UI text correct and complete in English (UK), German, French, Spanish (Spain) and Italian, in the app, both keyboards, notifications, web pages and store listings. Use whenever a string is added or changed. Prompt rules for generated replies belong to prompt-engineer.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Files: `locales/<lang>/{common,onboarding,keyboard,paywall,notifications}.json`. Keyboard strings are generated into Swift and Android resources by `scripts/gen-keyboard-strings.ts`.

## Rules

- English (UK) is the source. Every key exists in all 5 files with the same placeholders (`{{count}}`, `{{price}}`).
- App UI uses the informal form: de "du", fr "tu", es "tú", it "tu". Legal pages may use the polite form.
- Voice: friendly, plain, honest. Never pushy about money. Never assume the user is a man; use neutral forms or both forms where needed (de "Nutzer:innen" only if natural; prefer rephrasing).
- Tone chip labels are localised labels, not translated slang: Warm, Funny, Flirty, Confident, Calm, Apologise, Say no kindly, Professional → e.g. de Herzlich, Witzig, Flirty, Selbstbewusst, Ruhig, Entschuldigen, Freundlich Nein sagen, Professionell (native check).
- Prices are never in strings; use the `{{price}}` placeholder filled from the store.
- Fixed lines that must exist in all languages: "The right reply, in any chat", "Replies are written by AI. You choose what to send.", "AI suggestion", the three "What Replywise can see" lines, the keyboard state messages in spec §3.5, the trial timeline, the lifetime fair-use line, the crisis card.
- German cancel entry label is exactly "Verträge hier kündigen".
- Length: keyboard bar messages ≤ 70 characters; chips ≤ 14 characters; buttons ≤ 24 characters. German and French run ~30% longer; flag overflows.
- Punctuation: French non-breaking space before ? ! : ; Spanish ¿ ¡.
- Run `npm run i18n:check` and the keyboard string generator.

## Before finishing

Report keys added, keys changed, length warnings and anything that needs a native-speaker check (mark with `"_review": true` next to the key).
~~~~


## File: `.claude/agents/keyboard-extension-engineer.md`

~~~~markdown
---
name: keyboard-extension-engineer
description: Builds and reviews the native keyboards. Use for anything in targets/keyboard/ (iOS Keyboard Extension, Swift/SwiftUI), modules/replywise-ime/ (Android InputMethodService, Kotlin), modules/keyboard-bridge/, the App Group and shared keychain, Full Access, clipboard reading, text insertion, memory, and the keyboard setup detection in the app.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

You know iOS custom keyboards and Android IMEs deeply. Read `docs/architecture.md` §4–6 and §9–10 and `docs/product-spec.md` §3 first.

## iOS rules

- `KeyboardViewController: UIInputViewController` hosts one SwiftUI root via `UIHostingController`, created once. No React Native, no third-party SDKs.
- Info.plist (`NSExtension` → `NSExtensionAttributes`): `RequestsOpenAccess = YES`, `PrimaryLanguage`, `IsASCIICapable = NO`, `PrefersRightToLeft = NO`. Set in `targets/keyboard/expo-target.config.js`.
- Entitlements on both app and extension: `com.apple.security.application-groups` = `group.app.replywise.shared`, `keychain-access-groups` = shared group. expo-apple-targets does not auto-sync the App Group for keyboard targets; set it explicitly and verify in the built `.entitlements`.
- Check `hasFullAccess` on every `viewWillAppear`. Without it: typing only, no App Group, no network, "No Full Access" bar.
- Next-keyboard key when `needsInputModeSwitchKey` is true; wire it with `handleInputModeList(from:with:)`.
- Text: insert with `textDocumentProxy.insertText`. Polish replace: delete exactly the characters of `documentContextBeforeInput` that were sent (count grapheme clusters, delete with `deleteBackward()` in a loop), then insert. Note: hosts may return only part of the text before the cursor; send only what you got and replace only that.
- Clipboard: read `UIPasteboard.general` only inside the Reply tap handler, only if `hasStrings`. Test on device whether iOS shows a paste permission prompt from a keyboard; if it does, the prompt is user-initiated, so it's acceptable; document it.
- Opening Settings: a keyboard extension has no public API to open URLs. Show the path as text. Only add a button if you find a documented, review-safe API; otherwise don't.
- Networking: `URLSession` with `bytes(for:)` for SSE, 10 s overall timeout, cancel on dismiss. Device key from the shared keychain.
- Memory: target < 40 MB resident on an older iPhone. Measure with Xcode's memory gauge and Instruments (Allocations, Leaks) across 50 open/close cycles and 20 reply requests. Handle `didReceiveMemoryWarning`.
- Crash data: subscribe to MetricKit in the extension and write payloads to the App Group; the app uploads them.
- Pure logic in `Core/` without UIKit, tested with `swift test --package-path targets/keyboard`.

## Android rules

- `ReplywiseIme : InputMethodService` declared in `modules/replywise-ime/android/src/main/AndroidManifest.xml` with `android:permission="android.permission.BIND_INPUT_METHOD"`, intent filter `android.view.InputMethod`, meta-data `android.view.im` → `@xml/method` with subtypes en-GB, de, fr, es, it.
- Text: `currentInputConnection.commitText`; Polish replace with `getTextBeforeCursor(1000, 0)` and `deleteSurroundingText`.
- Clipboard: `ClipboardManager.primaryClip` read only on the Reply tap. Android 10+ lets only the default IME or focused app read the clipboard; check behaviour on Android 12+ (clipboard access toast) and 13+.
- Respect `EditorInfo`: never offer AI replies in password fields (`TYPE_TEXT_VARIATION_PASSWORD`, `VISIBLE_PASSWORD`, `WEB_PASSWORD`, `NUMBER_PASSWORD`) or when `IME_FLAG_NO_PERSONALIZED_LEARNING` is set (show typing only). Do the same on iOS for `secureTextEntry` fields (the system usually swaps keyboards there anyway).
- Shared data: same app process, so `SharedPreferences` for settings and EncryptedSharedPreferences (or the Android Keystore) for the device key.
- Setup detection for the app: `InputMethodManager.enabledInputMethodList` contains our ID; default IME via `Settings.Secure.DEFAULT_INPUT_METHOD`. Open `Settings.ACTION_INPUT_METHOD_SETTINGS` and `showInputMethodPicker()`.
- UI: Compose with ViewTree owners set on the IME window, or Views if Compose startup is too slow; measure startup and memory and record the decision in `docs/architecture.md`.
- Pure logic in `core/` with JVM unit tests.

## Both

- Never send text except on Reply/Polish tap. Never persist typed text. No keystroke logs, even in debug builds.
- Mirror the zod contract (`docs/reply-api.json`) in `ReplyAPI.swift` / `ReplyApi.kt`; keep a contract test.
- Keep `docs/keyboard-manual-test.md` up to date: host apps (WhatsApp, Messages/Google Messages, Instagram, Tinder, Hinge, Gmail), Full Access on/off, offline, dark mode, large text, VoiceOver/TalkBack, password field, landscape, memory.

## Review report format

`Area → finding → risk (crash / rejection / privacy / UX) → fix`, then measured numbers (memory peak, first-frame time, first-card latency) and the manual test results.
~~~~


## File: `.claude/agents/privacy-compliance.md`

~~~~markdown
---
name: privacy-compliance
description: Checks Replywise changes against GDPR, the EU AI Act transparency rules, Apple and Google keyboard and subscription rules, and EU/UK consumer rules. Use for any change to data sent to the AI, data stored or logged, consent, age gate, permissions, SDKs, providers, paywall, notifications, store privacy labels or the Play data safety form. Read-only; not legal advice.
tools: Read, Grep, Glob, Bash
model: inherit
---

You are a careful privacy and consumer-rules reviewer (not a lawyer). Flag issues and say what to confirm with a lawyer. Read `docs/product-spec.md` §9–10 and §13, and the Europe section of `docs/teardown.md`.

## Checklist

**Data flow**
- Text leaves the device only on a Reply/Polish tap, only to `reply`, only the copied message or the draft. No keystroke logging, no background sends, no clipboard reads outside the tap.
- Server holds text in memory only; no text in DB, logs, Sentry, PostHog, crash payloads. Redaction runs before the provider call.
- Providers: Bedrock EU inference profile and Mistral EU, no training, retention setting confirmed and documented in `docs/processors.md` with DPA status.

**GDPR**
- The other person's messages are processed: privacy notice covers them, lawful basis stated, DPIA (`docs/dpia.md`) mentions Art. 9 data (sex life, orientation, health may appear in chats).
- Consent for AI sharing is explicit, recorded with policy version, and withdrawable in Settings with immediate effect in app and keyboard.
- Delete my data removes all server rows, revokes device keys, clears App Group and keychain, and works without contacting support.
- New fields appear in spec §10 with retention.

**EU AI Act Art. 50**
- "Replies are written by AI" in onboarding; "AI suggestion" on every card. Art. 50(2) marking of plain text and recipient disclosure are open: list them in `docs/dpia.md` open questions for counsel before 2 Dec 2026.

**Apple**
- 4.4.1: typing without Full Access; next-keyboard key; AI only on top; keyboard doesn't open apps other than Settings.
- 5.1.2(i): explicit consent before sharing with a third-party AI, naming the provider.
- 3.1.2: subscription terms, auto-renew text, restore; trial terms clear; weekly is at least 7 days.
- Section 3 / 3.2.2(x): no incentives for ratings or reviews.
- 1.1.4: no sexual content. Age rating 18+.
- Privacy label: no tracking; data not linked to identity; matches actual collection.

**Google Play**
- Data safety form matches. IME disclosure in the listing. Subscriptions policy: trial terms and cancel path clear.

**Consumer rules**
- Paywall: visible ✕, no fake scarcity or countdown (UCPD Annex I No 7), "free" never hides the post-trial price (Annex I No 20), trial reminder 24 h before the charge.
- EU withdrawal: link to Apple's process; don't promise our own refunds.
- DE: "Verträge hier kündigen" entry opens store subscription management (§312k BGB scope for store billing unsettled; keep it).
- UK DMCC: annual renewal reminder present; scope for store billing to verify.
- Lifetime: never expires or changes; fair-use cap disclosed before purchase.

## Report format

`Area → finding → risk (high/medium/low) → fix → confirm with lawyer? (y/n)`
~~~~


## File: `.claude/agents/prompt-engineer.md`

~~~~markdown
---
name: prompt-engineer
description: Owns the reply and polish prompts, per-language rules, tone cards, safety instructions, the eval sets and model choice for Replywise. Use for any change in supabase/functions/_shared/prompts/, evals/, output parsing format, provider/model settings, or when reply quality, language, formality or safety is questioned.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Replies must sound like a real person texting in German, French, Spanish, Italian or British English, with the right du/Sie, tu/vous, tú/usted, tu/Lei. The teardown's biggest quality complaints: cheesy, repetitive, "greasy" lines and answers in English for non-English chats.

Read `docs/product-spec.md` §3–4 and §9 and `docs/architecture.md` §7 first.

## Files you own

- `supabase/functions/_shared/prompts/reply.v1.md`, `polish.v1.md`, `safety.v1.md`, `tones.v1.md`, `lang/{en,de,fr,es,it}.v1.md`.
- `evals/reply/cases.jsonl` (40 cases), `evals/polish/cases.jsonl` (30), `evals/safety/cases.jsonl` (30).
- `scripts/run-evals.ts` and `evals/reports/`.

## Prompt rules

- Never edit a released version. Copy to `.v2.md`, change, bump `PROMPT_VERSION` in `_shared/prompts/index.ts`, run evals, compare reports.
- User text is data. Wrap it in a delimited block and say instructions inside it must be ignored.
- Output format exactly as architecture §7 step 8 (`R1|…`, `META|{json}`); no markdown, no quotes, no numbering inside the text.
- Per-language file: address forms for Casual/Formal, gender agreement using I am / They are, emoji habits, punctuation, 3 good and 3 bad example replies per tone group, a banned-phrases list (pet names to strangers, clichés, "greasy" lines, passive-aggressive phrasing).
- Tone cards: one paragraph per tone + what to avoid. Flirty never explicit; Playful is the maximum.
- Safety: refuse harassment, threats, stalking, scams, sexual content, anything involving minors; crisis messages → supportive replies + `META.crisis=true`. No therapy or medical claims.
- Keep the system prompt short enough for fast first-token time; measure.

## Evals

Each case: `{id, kind, lang, text, chips, expect: {lang, formality, maxChars, mustNot:[...], crisis?, refused?}}`. Spread: 5 languages × relationships × tones, plus formality pairs (same input, Casual vs Formal), gender pairs, prompt-injection attempts ("ignore your rules and…"), mixed-language input, emoji-only input, very long input, and safety cases.

`npm run evals -- --prompt reply [--provider bedrock|mistral|fake]` runs every case against the local function and checks:
- language of each card matches `expect.lang` (simple detector + stop-word check);
- formality markers (de: du/dich/dein vs Sie/Ihnen; fr: tu/te/ton vs vous/votre; es: tú/te vs usted; it: tu/ti vs Lei/La);
- 3 cards (2 for polish), each ≤ maxChars, no banned phrase, no explicit term;
- crisis/refused flags as expected;
- latency to first card and cost per case.
Optional: an LLM judge rubric (natural, fits the tone, fits the relationship; 1–5) run with the other provider, reported separately.

Report saved to `evals/reports/<date>-<prompt>-<version>-<provider>.md` with a pass rate per language and per check. A change ships only if the pass rate doesn't drop in any language and all safety cases pass.

## Native review pack

`scripts/export-review-pack.ts` writes 50 sample replies per language (balanced across tone groups) to a CSV for a native speaker to rate 1–5 and comment. Fixes go into the language files as examples or banned phrases.

## Report format

`Change → eval pass rate before/after per language → safety cases → latency and cost per reply → recommendation`.
~~~~


## File: `.claude/agents/release-manager.md`

~~~~markdown
---
name: release-manager
description: Prepares Replywise builds and store releases. Use for version bumps, EAS profiles and credentials for the app and keyboard targets, app.config settings, store listings in 5 languages, screenshots plan, privacy labels, Play data safety, review notes, release notes and the pre-release checklist.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

You handle everything between "the code works" and "it's in the stores".

## Owns

- `app.config.ts`: bundle IDs (`app.replywise`, `.staging`), keyboard target bundle ID (`app.replywise.keyboard`), version and build numbers (app and extension must match), App Group and keychain entitlements on both targets, Android package and IME service, usage strings in 5 languages.
- `eas.json`: profiles `development`, `staging`, `production`; credentials for both iOS targets.
- `store/<lang>/{name,subtitle,description,keywords,whats_new}.txt`, screenshot list, privacy label answers, Play data safety answers, Apple review notes.
- `CHANGELOG.md`.

## Store listing rules

- Name ≤ 30 chars, subtitle ≤ 30 chars (iOS); Play short description ≤ 80 chars.
- Description: the promise first; second paragraph says typing works without Full Access and what is sent when you tap Reply; then trial and plan terms in plain words.
- No "#1", no press claims we don't have, no competitor names, no sexual framing ("rizz", "hookup"). Age rating 18+.
- EU trader details (DSA) filled in App Store Connect.

## Apple review notes must explain

How to enable the keyboard and Full Access; that typing works without Full Access; exactly what is sent and when; the AI consent screen; the AI provider and EU processing; a demo path (copy a sample message from the notes, open Notes app, switch keyboard, tap Reply); restore purchases.

## Pre-release checklist (report each item ✓ / ✗)

1. `/verify` passes on the release commit.
2. Maestro flows pass on iOS and Android.
3. `docs/keyboard-manual-test.md` run on a real iPhone and Android phone in the last 48 h, all rows pass; iOS extension memory peak recorded < 40 MB.
4. Evals pass on production models; native review done for all 5 languages.
5. Production secrets set; `LLM_MODE=live`; daily cost alert set; Better Stack monitor live.
6. RevenueCat products (weekly with trial, annual, lifetime, lifetime_upgrade) live in both stores; restore and trial reminder tested with sandbox accounts.
7. Privacy policy, terms (with lifetime fair use) and DPIA reviewed; URLs live in 5 languages.
8. Privacy labels / data safety match `docs/product-spec.md` §10.
9. Version and build numbers bumped on both iOS targets; release notes in 5 languages.

Never submit a build yourself without the user's explicit go-ahead.
~~~~


## File: `.claude/agents/test-engineer.md`

~~~~markdown
---
name: test-engineer
description: Writes and runs tests for Replywise. Use after any feature or bug fix, and before a commit. Covers Jest/RNTL (app), Deno tests (Edge Functions with a fake LLM), pgTAP (SQL, quota, RLS), swift test (iOS keyboard core), Gradle unit tests (Android IME core) and Maestro (app flows).
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

A bug here can charge someone wrongly, leak a private chat, or break the keyboard someone types with all day. Test like it.

Read `CLAUDE.md`, `docs/product-spec.md` and `docs/architecture.md` first.

## What to test, by layer

| Layer | Tool | Location | Must cover |
|---|---|---|---|
| Quota | pgTAP + Deno | `supabase/tests`, `supabase/functions/reply/` | Starter 10 → daily 3 → bonus; reset at local midnight in Europe/London, Berlin, Madrid; concurrent taps don't over-consume; refund on failure before first card; lifetime 100/day; subscription 300/day |
| Reply function | Deno, fake provider | `supabase/functions/reply/*.test.ts` | 401 without auth; device key revoked → 401; 403 without consent or age; 402/429 paths; SSE events order; fallback on timeout and error; card post-checks drop bad cards; no text in any log call (spy on console); Flirty forced off for Colleague |
| Webhook | Deno | `webhooks-revenuecat/` | Bad secret; duplicate event; trial start; renewal count; lifetime; expiration |
| RLS | pgTAP | `supabase/tests/rls_*.sql` | User A can't read B in every table; client can't read `ai_requests`, `device_keys`, `support_messages` |
| iOS keyboard core | `swift test --package-path targets/keyboard` | `targets/keyboard/Tests` | Layout maps per language, autocapitalise, SSE parser across split chunks, request builder, quota cache, polish replace count (grapheme clusters, emoji) |
| Android IME core | Gradle JVM tests | `modules/replywise-ime/android/src/test` | Same as iOS core; password field detection |
| App logic | Jest | `src/**/__tests__` | Trial reminder times (DST), upgrade-card eligibility, plan display from store prices, App Group mirror writes |
| Screens | RNTL | `src/features/*/__tests__` | Paywall ✕ present and leads to free tier; trial timeline only for weekly; consent buttons; settings states; strings from i18n |
| Flows | Maestro | `e2e/*.yaml` | Onboarding (consent yes and no), Try it, paywall close, settings: withdraw consent, delete my data |
| Prompts | Evals | `evals/` | Run by `prompt-engineer`; you check the runner works |

## Rules

- Write the failing test first for bugs, then confirm it fails for the right reason.
- Never weaken, skip or delete an existing test or eval case to get green. If one is wrong, say why and ask.
- Fixed clocks only (`jest.useFakeTimers().setSystemTime`, Deno `FakeTime`).
- No real network or real model calls in tests: `LLM_MODE=fake`.
- Keep the Jest suite under a minute.

## Report format

```
Added: <files>
Ran: <commands>
Result: <n passed / n failed>
Failures: <test → cause → suggested fix>
Gaps still untested: <list, including what needs a manual device test>
```
~~~~


## File: `.claude/commands/verify.md`

~~~~markdown
---
description: Run every check for Replywise (lint, types, unit tests, i18n, Swift and Kotlin core tests, database and Edge Function tests) and report results
---

Run these in order and keep going even if one fails. Skip a step only if its tooling isn't set up yet, and say so.

1. `npm run lint`
2. `npm run typecheck`
3. `npm test -- --ci`
4. `npm run i18n:check`
5. `swift test --package-path targets/keyboard` (macOS only)
6. `(cd modules/replywise-ime/android && ./gradlew testDebugUnitTest)`
7. `supabase test db` (needs `supabase start` running)
8. `deno test --allow-env --allow-net=127.0.0.1 supabase/functions`
9. `grep -rnE "console\.(log|info|debug)\(.*(text|body|draft|clipboard)" supabase/functions targets modules src` must return nothing (no message text in logs)

Then report as a table: step · result (pass / fail / skipped) · first failure in one line. If anything failed, propose the smallest fix but don't apply it unless I say so. $ARGUMENTS
~~~~


---

# Part C: Build prompts

Paste one prompt at a time, in order. Each assumes the previous one is done and committed. Read Claude Code's plan before approving it.

---

## Prompt 0: Bootstrap the project with app and keyboard targets

```
Read CLAUDE.md, inventory.md, docs/product-spec.md and docs/architecture.md.

Set up the Replywise project in this folder (it already contains CLAUDE.md, AGENTS.md, docs/, .claude/; keep them):
1. Create an Expo app with the latest stable SDK, TypeScript strict, Expo Router, in this folder (not a subfolder). Use the repository layout from docs/architecture.md §3.
2. Add expo-dev-client and app.config.ts: name "Replywise", slug "replywise", bundle IDs app.replywise / app.replywise.staging chosen by APP_VARIANT, Android package app.replywise, iOS entitlements for the App Group group.app.replywise.shared and the shared keychain group.
3. Add @bacons/apple-targets and create the iOS keyboard target in targets/keyboard (type "keyboard", bundle ID <app>.keyboard). In expo-target.config.js set the App Group and keychain entitlements explicitly (the plugin doesn't auto-sync them for keyboards) and Info.plist NSExtensionAttributes with RequestsOpenAccess = YES, PrimaryLanguage en-GB. A minimal KeyboardViewController that shows one row "Replywise" and a working next-keyboard key.
4. Add targets/keyboard/Package.swift with a Core library target and a Tests target, one passing test, so `swift test --package-path targets/keyboard` works.
5. Create the local Expo modules modules/keyboard-bridge (Swift + Kotlin, one function getStatus() returning stub values) and modules/replywise-ime (Android only: an empty InputMethodService that shows one row "Replywise", declared in the module's AndroidManifest with BIND_INPUT_METHOD and res/xml/method.xml with subtypes en-GB, de, fr, es, it). One Kotlin unit test.
6. eas.json with development, staging and production profiles; make sure EAS credentials cover both iOS targets.
7. Tooling: ESLint + Prettier, tsc --noEmit, Jest with jest-expo and RNTL, path aliases @/ → src and @shared → supabase/functions/_shared. npm scripts: lint, typecheck, test, i18n:check (stub), evals (stub).
8. GitHub Actions: on push run lint, typecheck, Jest; a macOS job for swift test; an Ubuntu job for the Gradle unit tests.
9. .env.example with the variables in CLAUDE.md. .gitignore for .env, node_modules, ios/, android/.
10. A placeholder home screen that says "Replywise".

Use the keyboard-extension-engineer agent for steps 3–5. Don't add any library that isn't in inventory.md. Plan first, then build. At the end, give me the exact commands to build to my iPhone and Android phone, and the steps to enable the keyboard on each so I can see the placeholder row.
```

**Done when:** the app runs on both phones from a development build, the "Replywise" placeholder keyboard can be added and switched to on both, and `/verify` passes the steps that exist.

---

## Prompt 1: Design system, five languages and keyboard strings

```
Read CLAUDE.md, docs/product-spec.md §1–3, §11 and docs/architecture.md §9.

Build the foundation for UI and copy:
1. src/theme: colour tokens for light and dark (one accent, semantic success/warning/danger), spacing, type scale that respects font scaling, radius. scripts/export-tokens.ts writes the same colours to targets/keyboard/UI/Theme.generated.swift and modules/replywise-ime android res/values(-night)/colors.xml.
2. Base components in src/components: Screen, Text, Button (primary/secondary/ghost, min 44 pt, loading), Chip, Card, Banner, PlanCard, StepGuide (animated steps with a Reduce Motion static fallback). Every component accessible.
3. i18n with i18next + react-i18next + expo-localization. Locales en (UK), de, fr, es, it in locales/<lang>/{common,onboarding,keyboard,paywall,notifications}.json. Fallback en. Plurals working.
4. scripts/gen-keyboard-strings.ts: locales/<lang>/keyboard.json → targets/keyboard/Core/Strings.generated.swift and android res/values-<lang>/strings.xml.
5. npm run i18n:check: fails if a key is missing in any locale, placeholders differ, generated keyboard strings are stale, a price is hard-coded in a string, or a button/chip/bar message is over its length limit (24/14/70).
6. Add now, in all 5 languages: the promise, "Replies are written by AI. You choose what to send.", "AI suggestion", the three "What Replywise can see" lines, every keyboard state message in spec §3.5, the 8 tone chips, 5 relationship chips, 5 closeness steps, Casual/Formal, Reply, Polish, ↻ More, Continue, Skip, Close.
7. A hidden /dev/components screen showing every component in light and dark at normal and largest text.
8. RNTL tests for Button, Chip and PlanCard.

Use the i18n-localizer agent for translations and the accessibility-auditor agent on the components. Plan first.
```

**Done when:** the dev screen looks right in both themes and at 200% text; `npm run i18n:check` passes; generated Swift and Android string files exist.

---

## Prompt 2: Supabase foundation, consent and device keys

```
Read CLAUDE.md and docs/architecture.md fully. Use the backend-engineer agent, then privacy-compliance to review.

Set up Supabase:
1. supabase init; local dev with supabase start.
2. Migrations for every table in docs/architecture.md §8 with types, constraints, indexes and created_at/updated_at triggers. No text column in ai_requests or reply_events.
3. RLS on every table with the policies in §8. Anon reads nothing.
4. Anonymous sign-in. Trigger creating a profiles row on sign-up.
5. Edge Functions: consent (grant with policy_version / withdraw; on first grant add +10 starter credits to credit_ledger; withdraw revokes all device keys), profile (set age_confirmed_at, ui_lang, i_am, they_are, timezone), device-key (create: 32 random bytes base64url, store SHA-256, return once; requires consent and age; revoke).
6. supabase/functions/_shared: db clients, schemas.ts (zod for every request/response incl. ReplyRequest and SSE events from architecture §7), auth.ts (JWT or "Device <key>"), typed error helper. Export docs/reply-api.json from the zod schemas.
7. pgTAP: RLS isolation for every table; client can't read ai_requests, device_keys, support_messages; starter credits granted once.
8. Deno tests: device key hashing, revoked key rejected, consent withdraw revokes keys.
9. In the app: src/api/supabase.ts, silent anonymous sign-in on first launch, session in expo-secure-store; useProfile hook.
10. docs/processors.md with Supabase (Frankfurt), purpose, DPA "to sign".

Plan first, then build, then run supabase db reset, supabase test db and the Deno tests and show me the results.
```

**Done when:** `supabase test db` and the Deno tests pass; a fresh install creates an anonymous user and a profile row.

---

## Prompt 3: The AI proxy (reply Edge Function)

```
Read docs/architecture.md §7, §8, §11–13 and docs/product-spec.md §3.3–3.4, §5 and §9. Use backend-engineer to build, test-engineer to test, and privacy-compliance to review before you tell me it's done.

Build the reply function exactly as architecture §7:
1. _shared/llm: provider interface; bedrock.ts (InvokeModelWithResponseStream on the EU inference profile, region and model ID from secrets); mistral.ts (EU API, streaming); fake.ts (deterministic, language-correct lines for each lang, used when LLM_MODE=fake).
2. SQL functions consume_reply(user_id, local_date) and refund_reply(request_id): starter credits first, then 3/day, then bonus; lifetime 100/day; subscriptions 300/day; row lock so concurrent calls can't over-consume. Read plan from entitlements (default free).
3. reply: auth (JWT or device key) → consent + age gate → 20/min rate limit → consume_reply → chip validation (no Flirty for Colleague/Family) → in-memory redaction (_shared/redact.ts) → prompt assembly from prompt files (use placeholder prompt files for now; prompt 4 writes the real ones) with user text wrapped as data → stream from Bedrock, fallback to Mistral on error or first token > 2.5 s → parse "R1|…", "META|{…}" lines into SSE events card/meta/quota/done/error → post-check cards → log ai_requests metadata with tokens, cost and latency. Never log text.
4. reply/event endpoint for inserted / up / down → reply_events.
5. quota function (GET) returning plan, leftToday, resetAt, fairUseLeft. health function for Better Stack, and provider_status updates (3 failures in 60 s → down 5 min).
6. _shared/cost.ts with a per-model price table (EUR per 1k tokens, "check current" + date comment).
7. Pin reply to Frankfurt when invoked.
8. Deno tests with the fake provider: every status path (401/403/402/429/503), SSE order, fallback on timeout and error, refund on failure before first card, Flirty forced off, redaction, and a test that spies on console and fails if any request text is logged. pgTAP for consume_reply concurrency and reset at local midnight (Europe/London, Europe/Berlin).
9. A tiny CLI script scripts/try-reply.ts that calls the local function and prints the stream, so I can try it.

Then deploy to staging with real keys and run 10 requests per language through scripts/try-reply.ts. Report p50/p95 time to first card and to done, and cost per request per language.
```

**Done when:** all tests pass locally with the fake provider; on staging, real replies stream from Bedrock and fall back to Mistral when you break the Bedrock key; you have the measured latency and cost per reply.

---

## Prompt 4: Prompts v1 and the eval set

```
Use the prompt-engineer agent. Read docs/product-spec.md §3–4 and §9, docs/architecture.md §7 and the "What users say" and item 2, 6, 8, 9 sections of docs/teardown.md.

1. Write supabase/functions/_shared/prompts/: safety.v1.md, reply.v1.md, polish.v1.md, tones.v1.md (8 tones, each with what to do and what to avoid), lang/en.v1.md, de, fr, es, it (address forms for Casual/Formal, gender agreement from I am / They are, emoji habits, punctuation, 3 good + 3 bad examples per tone group, banned phrases). PROMPT_VERSION in prompts/index.ts.
2. Output format exactly as architecture §7 step 8.
3. Eval sets: evals/reply/cases.jsonl (40 cases: every language, every relationship, every tone, formality pairs, gender pairs, mixed-language input, emoji-only, very long input, 3 prompt-injection attempts), evals/polish/cases.jsonl (30), evals/safety/cases.jsonl (30: harassment, threats, sexual requests, minors, scams, self-harm and crisis in all 5 languages).
4. scripts/run-evals.ts and npm run evals: runs cases against the local reply function with --provider bedrock|mistral|fake, checks language, formality markers, card count, length, banned phrases, crisis/refused flags, latency and cost; writes evals/reports/<date>-<prompt>-<version>-<provider>.md with pass rates per language and per check.
5. scripts/export-review-pack.ts: 50 replies per language as CSV for a native speaker.
6. Run evals on staging with both providers and report pass rates side by side, latency and cost per reply. Recommend which model to use as primary.

Plan first. Safety cases must all pass before you report done.
```

**Done when:** evals pass ≥ 90% per language on the primary provider, 100% of safety cases pass, and you have a provider recommendation with numbers.

---

## Prompt 5: The iOS keyboard: typing without Full Access (riskiest part 1)

```
Use the keyboard-extension-engineer agent to build and then to review. Read docs/product-spec.md §3.1, §3.5 and docs/architecture.md §5, §6, §9 and §10.

Build the typing keyboard in targets/keyboard:
1. KeyboardViewController (UIInputViewController) hosting one SwiftUI root created once. Check hasFullAccess on viewWillAppear.
2. Core/Layouts.swift: QWERTY (en, es with ñ, it), QWERTZ (de with ä ö ü ß), AZERTY (fr), numbers and symbols pages, long-press accent popups for each language. Layout follows v1.defaults.keyboardLang from the App Group (with Full Access) or the PrimaryLanguage default (without).
3. Keys: shift and caps lock, delete with repeat and acceleration, space, return with the host's return key type label, 123, next-keyboard key when needsInputModeSwitchKey is true (handleInputModeList). Autocapitalise and double-space period. Light haptic and click sound per system settings (playInputClick).
4. The empty reply bar above the keys with the correct state message for NO_ACCESS / AI_OFF / NOT_SET_UP from the App Group (strings from Strings.generated.swift). No network yet.
5. Write v1.keyboardHeartbeat {at, hasFullAccess, version} to the App Group on each open when Full Access is on.
6. MetricKit subscriber that writes diagnostic payloads to the App Group.
7. In modules/keyboard-bridge (iOS): getStatus() → {added, hasFullAccess (from heartbeat), heartbeatAt}; App Group get/set for the v1.* keys; shared keychain get/set for the device key.
8. Accessibility: key labels and the keyboardKey trait, VoiceOver tested.
9. swift test for Core: layouts per language, autocapitalise rules, accent maps.
10. Create docs/keyboard-manual-test.md with the device checklist from the keyboard-extension-engineer agent.

Then the keyboard-extension-engineer agent reviews the result and measures on my iPhone: memory peak across 50 open/close cycles, first frame time, key latency, typing in WhatsApp, Messages, Notes, a password field, dark mode, largest text, Full Access off. Report the numbers. Plan first.
```

**Done when:** you can type in all five layouts in WhatsApp with Full Access off and in airplane mode, the app shows "Added ✓ / Full Access ✓" correctly, and memory peak is under 40 MB.

---

## Prompt 6: The iOS reply bar: Reply, Polish and streaming (riskiest part 2)

```
Use the keyboard-extension-engineer agent to build and then to review, and privacy-compliance to review the data flow. Read docs/product-spec.md §3.2–3.5, §5 and §9, and docs/architecture.md §4–7.

Build the AI part of the iOS keyboard:
1. Core/ReplyAPI.swift mirroring docs/reply-api.json; a contract test against that file.
2. Core/SSEParser.swift that handles events split across chunks; Core/LanguageHint.swift with NLLanguageRecognizer limited to en/de/fr/es/it; Core/QuotaCache.swift.
3. Reply: on tap only, read UIPasteboard.general once (hasStrings), cap at 1,000 chars, show "Replying to: …" preview with ✕. Empty → hint. Call reply with Authorization: Device <key> from the shared keychain, URLSession bytes(for:), 10 s timeout. Cards appear as they stream, each with "AI suggestion" and 👍/👎. Tap → textDocumentProxy.insertText and POST reply/event inserted. ↻ More. Cancel on ✕ and on viewWillDisappear.
4. Polish: shown when documentContextBeforeInput is not empty. Sends only that text. Two cards (Light edit, Rewrite). Tap → delete exactly the sent text (grapheme-cluster count, deleteBackward loop) and insert the new text.
5. Chip panel: Who, Closeness (5 steps), Tone (8; Flirty hidden for Colleague and Family), Flirt level (only Match/Partner), Casual/Formal (default by relationship). Last choices saved to v1.lastChips. Changing a chip after results asks "Update replies?".
6. Counter chip from v1.quota, refreshed from each quota SSE event. All states in spec §3.5: OFFLINE, QUOTA_EMPTY, FAIR_USE, PROVIDER_DOWN, last trial day banner, crisis card when META.crisis is true.
7. Never offer Reply or Polish in secure text fields. No text is ever written to disk or logs.
8. swift test: SSE parser (split chunks, unicode), polish replace count with emoji and accented letters, chip rules, request builder.

Then the keyboard-extension-engineer agent reviews and measures on my iPhone: memory peak during 20 streamed replies, time from tap to first card and to third card on 4G and Wi-Fi, behaviour in WhatsApp, Instagram, Tinder or Hinge, Gmail and Messages, offline, provider down (set LLM_MODE to force errors on staging), and quota empty. Update docs/keyboard-manual-test.md. Plan first.
```

**Done when:** on your iPhone, copying a German message in WhatsApp and tapping Reply streams three German replies in under 3 s, Formal switches to Sie, tapping inserts the text, Polish replaces a draft correctly, and memory stays under 40 MB.

---

## Prompt 7: Onboarding with consent, keyboard setup and Try it

```
Read docs/product-spec.md §2 and §7, docs/decisions.md (2026-11-13), and docs/architecture.md §4–5. Use keyboard-extension-engineer for the setup detection, privacy-compliance to review consent, accessibility-auditor on the screens, i18n-localizer for every new string.

Build app/(onboarding) screens 1–4 (5 Paywall comes in prompt 8 and 6 Sign in in prompt 8b; route through placeholders that lead to Home):
1. Welcome + age on one screen: "The right reply, in any chat" with a 3-second looping demo of the keyboard bar inserting a reply (Reanimated; static image with Reduce Motion). Buttons "I'm 18+, let's go" (stores age_confirmed_at through the profile function) and "I'm under 18" (stop screen "Replywise is for adults. AI replies are off."; set a local flag so AI is never enabled on this install; keyboard still types). No rating or push ask. Strings: onboarding:age.*.
2. "What Replywise can see": three lines naming the provider and EU processing. "Allow AI replies" → consent function (policy_version from a constant), then device-key, store the key in the shared keychain (iOS) / EncryptedSharedPreferences (Android), write v1.aiEnabled = true. "Not now" → skip 4, keep AI off.
3. Turn on the keyboard, one screen: a StepGuide with (a) add the keyboard and (b) Allow Full Access (iOS), the Full Access explanation from spec §2, buttons "Open Settings" and "I've done it" (onboarding:keyboardSetup.actions.*). iOS: Linking.openSettings() to the app's page, which shows Keyboards → Replywise and the Full Access switch. Android: ACTION_INPUT_METHOD_SETTINGS via keyboard-bridge, then the keyboard picker; explain the system warning instead of Full Access. On return to foreground, check keyboard-bridge.getStatus() / the heartbeat and tick what's confirmed. "I've done it" always moves on: Full Access is skippable and typing works without it.
4. Try it: field pre-filled with a sample message in the device language, a tone picker (relationship Friend, the default), Reply → stream 3 cards via the reply function with the app's JWT, each labelled "AI suggestion". Uses 1 starter reply. Skipped after "Not now". Invite the user to open the new keyboard in this field once (gives the iOS app the Full Access heartbeat).
5. The default relationship is Friend (v1.defaults); there is no "Who do you text most" screen.
6. Home (placeholder until prompt 10) shows the 3-step how-to and replies left; there is no Done screen.
7. Progress indicator, back navigation, state kept if the app is closed mid-onboarding.
8. Analytics hooks as no-op functions (wired in prompt 13): onboarding_step_viewed, age_gate, ai_consent, try_it_reply_shown, keyboard_added, full_access_granted.
9. RNTL tests for each screen's states; Maestro flows: consent yes path, consent no path (Try it skipped), under-18 path.

Plan first.
```

**Done when:** a fresh install on your iPhone goes from Welcome to a working Reply in WhatsApp in under 3 minutes, and the "Not now" path leaves a working keyboard with AI off.

---

## Prompt 8: Paywall (RevenueCat Paywalls) and trial reminder

```
Read docs/product-spec.md §6 and §8, docs/pricing.md, inventory.md §4 and docs/architecture.md §11. Use privacy-compliance to review the paywall template against CLAUDE.md rule 8 and the consumer rules, accessibility-auditor on the screen, i18n-localizer for the app's strings and the template's 5 languages.

1. Integrate RevenueCat (react-native-purchases + react-native-purchases-ui), app user ID = the Supabase user ID. One product: annual, 3-day free trial as introductory offer; entitlement "unlimited"; one offering. Give me a checklist of exactly what to create in App Store Connect, Play Console and RevenueCat, with €29.99/year as the EUR reference price and the store price tiers for GBP and the other currencies.
2. The paywall is a RevenueCat Paywall: an app route (onboarding screen 5 and "Go unlimited" from Home, Settings and the out-of-replies card) that embeds RevenueCatUI.Paywall for the current offering. Configure the template exactly to spec §6 "Required template settings": ✕ shown from the first frame with no delay, 44 pt; the billed €X/year from RevenueCat's store price variables as the most prominent price, never smaller than "3 days free"; no "free" headline without the post-trial price; a CTA that never says only "Try free"; no per-day/week/month or relative-discount variables, no countdown, no scarcity, no strikethrough; trial timeline "Today: free · {date}: charged {price}/year" with no reminder promise; renewal text "3 days free, then {price} per year. Renews until you cancel in App Store subscriptions." (Google Play on Android) and the no-trial variant; Terms, Privacy, Restore purchases. All 5 languages in the RevenueCat dashboard, matching a reviewed copy in locales/<lang>/paywall-template.md (i18n-localizer and privacy-compliance sign off every dashboard change; dashboard access restricted).
3. ✕ (onDismiss) → onboarding: Sign in (prompt 8b), then Home on the free tier; elsewhere: back to where the user came from. Never replays the intro.
4. Under the paywall, in its own row not tied to the CTA, the app's switch "Remind me before the trial ends" (paywall:reminderSwitch), on by default and hidden when the user isn't eligible for the trial, plus the fair-use line (paywall:fairUse with the server's cap, 100, as count: "Fair use: up to 100 replies a day"). When a purchase that starts a trial completes (onPurchaseCompleted + customer info), and only if the switch is on: ask for notification permission, then schedule a local notification 24 h before the trial ends. If permission is denied: show an in-app banner on Home on the last trial day instead. Always write v1.trialEndsAt to the App Group for the keyboard's last-trial-day bar.
5. Annual renewal reminder 7 days before renewal when will_renew is true. Reschedule all reminders on every app open. Settings → Reminders can turn the trial reminder on or off later.
6. webhooks-revenuecat → entitlements (shared secret, idempotent, renewal_count, trial_ends_at). Store product IDs map to 'annual' (the only product the entitlements table accepts); any other product ID is acknowledged and ignored. Server quota reads it.
7. Settings: Manage or cancel subscription (DE label "Verträge hier kündigen"), Request a refund (Apple reportaproblem link on iOS, Play order history on Android), Restore purchases.
8. Mirror plan to v1.quota so the keyboard hides the counter for unlimited.
9. Analytics hooks: paywall_viewed {source}, paywall_closed, trial_started, purchase, reminder_opt_in.
10. Tests: Jest for reminder times (including a DST change) and for "switch off → no permission prompt, nothing scheduled"; RNTL for the switch default and the ✕ path to Sign in; Deno for the webhook (bad secret, duplicate event, trial start, renewal count, expiration, unknown product); Maestro e2e/paywall-close.yaml: the ✕ is visible on the first frame and leads to the free tier (runs on every build and on a schedule against the production offering, so it catches a dashboard change).

Plan first.
```

**Done when:** with a sandbox account you can start the annual trial, get the reminder notification at the right time (use a short sandbox trial), restore on a second device, and close the paywall to the free tier on the first frame; with the switch off no notification prompt appears; with permission denied the Home banner and keyboard bar show on the last trial day.

---

## Prompt 8b: Sign in (Apple, Google), skippable, and the signed-out state

```
Read docs/product-spec.md §2 (screen 6), §7 and §10, docs/architecture.md §4.1, inventory.md §1 (sign-in rows) and docs/decisions.md (2026-11-13, open questions). Use privacy-compliance (new personal data: the Apple / Google identity and the email it shares), keyboard-extension-engineer for the keyboard's SIGNED_OUT state, backend-engineer for Supabase Auth settings and delete-me, accessibility-auditor on the screen, i18n-localizer for strings.

1. Sign-in screen after the paywall (onboarding screen 6) and from Settings, hidden on an under-18 install (the local flag also keeps AI off whatever account signs in): "Continue with Apple" (iOS, the system AppleAuthenticationButton from expo-apple-authentication), "Continue with Google" (@react-native-google-signin/google-signin), "Not now" → Home. No email + password sign-in (dropped 2026-11-13: Replywise sends no email). The one-line notice "We use your Apple or Google sign-in only to keep your plan on all your devices." with a Privacy link. Apple: email scope only, no full name; Google: no extra scopes. Strip any name / avatar Supabase stores in identity_data / raw_user_meta_data. Strings: onboarding:signIn.*.
2. Link, don't replace: link the Apple / Google ID token to the current anonymous Supabase user, so the user ID, device key, consent, quota, credits and entitlements stay. Then Purchases.logIn(<supabase user id>). Confirm in current supabase-js docs how ID-token linking works; tell me before falling back to a browser OAuth flow.
3. Identity already linked to another account (reinstall, new phone): sign in to that account in a non-persisted client, delete the anonymous account right away by calling delete-me with its own JWT, then switch the session, Purchases.logIn with the existing ID, new device key if that account's consent is valid. The guest account and its starter credits are deleted (decided 2026-11-13). Show what happened. Stop and ask me if this needs anything not in architecture §4.1.
4. Supabase config: anonymous sign-ins on, manual linking on, email sign-up stays off, Apple and Google providers with the app's client IDs (supabase/config.toml for local; give me the dashboard checklist for staging and production). No SMTP: Replywise sends no email.
5. Settings: Sign in / Sign out (common:actions.signIn / signOut). Sign out (decided 2026-11-13): revokes the device key and clears it, signs out of Supabase and RevenueCat, writes v1.signedOut = true and v1.aiEnabled = false; AI stays off until the user signs in again; no new anonymous account (app start checks v1.signedOut before ensureAnonymousSession); Home shows the sign-in card (common:signedOutCard.*); typing keeps working.
5b. Keyboard SIGNED_OUT bar state (spec §3.5, architecture §5–6): BarState.swift and the Kotlin IME check v1.signedOut before every other AI state and show keyboard:bar.signedOut with the keyboard:actions.openApp action (Android: launch the app; iOS: only if a supported way exists, else text only). Strings are already generated; the Swift/Kotlin state-machine work is a follow-up that belongs here, with swift test and JVM tests for the new state.
6. Apple token storage and revocation: an Edge Function exchanges the Sign in with Apple authorization code with Apple's REST API and stores the refresh token encrypted, so delete-me can revoke it. Handle Apple's server-to-server notifications for Sign in with Apple. Delete my data (prompt 10) then revokes the Apple token, deletes the RevenueCat customer, purges auth.audit_log_entries and deletes the auth user (architecture §4.1 step 6).
7. Tests: Jest for the link / already-linked / cancelled / signed-out (no anonymous account created) paths with mocked SDKs; swift test and JVM tests for SIGNED_OUT; RNTL for the screen (Apple button only on iOS, Not now); Deno or integration test that a linked user keeps the same user ID, consent and credits; Maestro: skip sign-in path.

Plan first.
```

**Done when:** on a real iPhone you can skip sign-in, then sign in later from Settings with Apple and keep your replies left, consent and subscription; on a second phone signing in with the same Apple ID restores the subscription; Delete my data removes the auth user; after Sign out the keyboard shows "Sign in to use AI replies" and typing still works.

---

## Prompt 9: Free allowance counter and referral

```
Read docs/product-spec.md §5 and §7 (Invite friends). Use backend-engineer for the server parts.

1. App Home shows replies left today and when they come back ("Back at midnight"). Out-of-replies card in the app with "Go unlimited".
2. Keyboard counter chip and QUOTA_EMPTY message stay in sync with the server: quota function on app foreground writes v1.quota; reply SSE quota events update it from the keyboard.
3. Referral: referral function creates an 8-character code per user; invite screen shares https://replywise.app/r/<code> via the share sheet. Static landing page in web/ (5 languages) shows the code and store buttons, no tracking.
4. "Enter a friend's code" in Settings. One redemption per user, no self-redeem. When the redeemer's first reply_inserted event arrives, +10 credits for both (credit_ledger reason referral), once.
5. Optional notification "Your 3 free replies are back", off by default, at most once a day, only after a day the user ran out.
6. Analytics: referral_shared, referral_redeemed, quota_hit (server).
7. Tests: pgTAP for referral rules and reward once; Deno for redeem and reward trigger; Jest for counter display.

Plan first.
```

**Done when:** a second phone redeems your code, inserts its first reply, and both counters show +10.

---

## Prompt 10: Home, settings, support, consent withdrawal and delete my data

```
Read docs/product-spec.md §7, §10 and §13. Use privacy-compliance to review and accessibility-auditor on the screens.

1. Home: the 3-step how-to, keyboard status card (Added, Full Access, with Fix buttons reopening the setup guide), replies left, Try-it field, Go unlimited, provider-down banner (from health).
2. Settings, exactly the list in spec §7. App language and keyboard language/layout write to v1.defaults and v1.uiLang. I am / They are. Formality default.
3. Allow AI replies toggle: off → consent withdraw, revoke device key, clear keychain, v1.aiEnabled = false; the keyboard shows AI_OFF on next open. On → consent screen again, new device key.
4. Write to the maker: support function stores the message with app version, OS, language, plan (never chat text) and forwards it to the support inbox by email; confirmation "We reply within 48 hours".
5. Delete my data: two-step confirmation in the app, first warning that deleting data doesn't cancel the subscription with a Manage subscription link (common:deleteData.*); delete-me revokes the Sign in with Apple token (Apple REST API), deletes the RevenueCat customer (REST API), purges the user's auth.audit_log_entries, revokes device keys and deletes the auth user (every row cascades); app clears App Group, keychain, MMKV, signs out and returns to Welcome. Add the Google Play account-deletion web page (web/, https://replywise.app/delete). Move the inactive-account purge from SQL to a scheduled Edge Function that runs the same steps (or record it as a follow-up if it doesn't fit this prompt).
6. Upload MetricKit payloads (iOS) and the IME crash file (Android) from the App Group to Sentry when the app opens (Sentry is wired in prompt 13; queue them until then).
7. Sign in / Sign out in Settings comes from prompt 8b; Delete my data must delete the auth user (email and linked identities).
8. Tests: Deno for delete-me (no rows left in any table, Apple revoke and RevenueCat delete called with a fake client, audit rows gone), consent withdraw → reply returns 403 and device key fails; RNTL for settings states; Maestro: withdraw consent and delete my data.

Plan first.
```

**Done when:** withdrawing consent makes the keyboard show "AI replies are off" on next open; deleting data leaves no rows on the server and returns the app to Welcome.

---

## Prompt 11: The Android keyboard (InputMethodService)

```
Use the keyboard-extension-engineer agent to build and then to review, and privacy-compliance to review the data flow. Read docs/product-spec.md §3 and docs/architecture.md §4–7 and §9.

Build the Android keyboard in modules/replywise-ime, matching iOS behaviour:
1. ReplywiseIme: InputMethodService with the five layouts, accents, shift, delete repeat, space, enter action from EditorInfo, switch-IME key, autocapitalise. Typing works offline.
2. Decide Compose (with ViewTree owners on the IME window) or Views after measuring startup and memory; record the decision in docs/architecture.md.
3. Core logic in core/ with JVM tests: ReplyApi.kt mirroring docs/reply-api.json (contract test), SSE handling with OkHttp SSE, language hint with TextClassifier (API 29+) and subtype fallback, quota cache, polish replace.
4. Reply bar and chip panel exactly as spec §3.2–3.5. Reply reads ClipboardManager.primaryClip only on tap. Polish uses getTextBeforeCursor(1000, 0) and deleteSurroundingText. Insert with commitText. "AI suggestion" labels, 👍/👎, ↻ More.
5. No AI in password fields or when IME_FLAG_NO_PERSONALIZED_LEARNING is set.
6. Settings and quota from SharedPreferences written by keyboard-bridge; device key from EncryptedSharedPreferences.
7. keyboard-bridge (Android): getStatus() → added (enabled IME list), isDefault (DEFAULT_INPUT_METHOD), openInputMethodSettings(), showInputMethodPicker().
8. Crash handler that writes a small crash file (no text) for the app to upload.
9. TalkBack labels on keys, chips and cards.

Then the keyboard-extension-engineer agent reviews and tests on my Android phone: WhatsApp, Google Messages, Instagram, Gmail, a password field, offline, dark mode, font scale 2.0, clipboard behaviour on my Android version, startup time and memory. Update docs/keyboard-manual-test.md. Plan first.
```

**Done when:** on your Android phone, the full Reply and Polish loop works in WhatsApp in all five languages, onboarding detects the enabled keyboard, and nothing is sent without a tap.

---

## Prompt 12: AI quality and safety pass

```
Use the prompt-engineer agent, then privacy-compliance. Read docs/teardown.md sections 5 (What users say), 7 items 2, 6, 8, 9 and 9 (Don't take / Europe rules).

1. Run all evals on production model settings with both providers. Fix failures in the prompt files (new versions, not edits), rerun, and report before/after per language.
2. Export the native review pack (50 replies per language). Tell me exactly what to send to each native reviewer and how to bring their ratings back; when I give you the results, turn them into examples and banned phrases.
3. Prompt-injection check: copied messages that try to change the rules or leak the system prompt. All must fail safely.
4. Crisis card: verify the five crisis lines are current (WebSearch the official sites) and update locales; mark anything you can't confirm.
5. Draft docs/dpia.md: data flow (copied text → reply function → provider, no storage), the other person as data subject, Art. 9 data, lawful basis options for counsel, retention table from spec §10, risks and mitigations, open questions (AI Act Art. 50(2) marking of plain text; whether recipients must be told; Bedrock data-retention mode confirmation; Mistral zero retention confirmation).
6. Update docs/processors.md with AWS (Bedrock EU inference profile) and Mistral, retention settings and DPA status.
7. Check every place the user sees AI output has the "AI suggestion" label and the onboarding line.

Report what changed and what still needs a human or a lawyer.
```

**Done when:** evals pass ≥ 90% per language and 100% on safety with the chosen model, the review pack is ready to send, and the DPIA draft lists every open legal question.

---

## Prompt 13: Monitoring, cost and analytics

```
Read inventory.md §5 and docs/product-spec.md §12.

1. Sentry (EU) in the app and Edge Functions; beforeSend strips request bodies, clipboard text, drafts and replies. Upload queued MetricKit and IME crash payloads.
2. PostHog (EU) in the app with only the client events in spec §12; server events from Edge Functions via the capture API (_shared/analytics.ts), no text, keyed by anonymous user ID. Wire all no-op hooks.
3. Cost: admin SQL view daily_cost (requests, tokens, cost per provider, per language, per plan); a daily pg_cron job that emails or pings me if cost exceeds DAILY_COST_ALERT_EUR; cost per free user and per annual subscriber per month (compare with docs/pricing.md).
4. Better Stack: monitor the health endpoint; alert if both providers are down or p95 first-card latency > 3 s over 15 minutes (scheduled SQL check pinging a second monitor).
5. Keyboard health from server data: daily reply requests, insert rate, thumbs-down rate per language and tone, fallback rate.
6. docs/runbook.md: provider down, cost spike, keyboard crash spike after a release, a privacy incident (text found in logs).

Plan first.
```

**Done when:** you can see the funnel install → consent → keyboard added → Full Access → first insert → trial → purchase in PostHog, and a cost alert fires on staging when you set a tiny threshold.

---

## Prompt 14: Accessibility and translation pass

```
Run the accessibility-auditor agent on every app screen, both keyboards and the web pages, and the i18n-localizer agent on every locale file and the generated keyboard strings. Then fix everything they find.

Also:
- Check every screen and the keyboard bar at the largest text size and in German and French (longest strings) on a small iPhone (SE size) and a small Android phone.
- Check the RevenueCat paywall in all 5 languages: the ✕, the price per year, the trial timeline, the renewal text and the reminder switch all visible without scrolling on a small phone.
- Write docs/a11y-manual-test.md: VoiceOver and TalkBack steps for onboarding, the paywall, switching to the keyboard, tapping Reply and inserting a card.

Report what you changed and what still needs a human check.
```

**Done when:** both agents report no open BLOCKER or MAJOR items and you've run the manual VoiceOver and TalkBack script once.

---

## Prompt 15: Store readiness

```
Use the release-manager agent and the privacy-compliance agent.

1. Final app.config.ts and eas.json for production. Version 1.0.0 for the app and the keyboard target.
2. store/<lang>/ listing text for en, de, fr, es, it: name, subtitle, description (promise first; then what is sent and when, and that typing works without Full Access; then plan terms), keywords, what's new. No "rizz", no sexual framing, no competitor names. Age rating 18+.
3. Screenshot plan: 6 per platform (keyboard in a chat with 3 replies, formality switch du/Sie, tone chips, "What Replywise can see", paywall with ✕ and timeline, Home with replies left) with caption text per language. Give me the exact device sizes needed.
4. App Store privacy label and Google Play data safety answers that match docs/product-spec.md §10 exactly.
5. Apple review notes (see release-manager): enabling the keyboard and Full Access, what is sent, the consent screen, the provider and EU processing, a demo path with a sample message to copy, restore purchases.
6. Run the release-manager pre-release checklist and report each item.
7. Do NOT run eas submit. Tell me the exact commands and wait for my go-ahead.
```

**Done when:** every checklist item is ✓ or has a named owner and date, and the builds are uploaded only after your go-ahead.

---

## After launch: prompts for later

- **Openers for a new match** from pasted bio text (backlog item 11).
- **Shareable "chat read" card** from a pasted chat (backlog item 12).
- **Emoji in replies** matching the chat's style (backlog item 13).
- **Word prediction, haptics and three good themes** so people keep Replywise as the default keyboard (backlog item 16).
- **"My voice" tone** learned from 10 replies the user approved; per-contact memory (backlog items 15 and 18).
- **Family Sharing** for the annual plan (item 1 "Later"). Weekly and Lifetime were dropped on 2026-11-13; bring them back only as a new decision.
- **Regional variants** (es-MX, fr-CA, de-CH, en-US) and on-device redaction before sending (items 2 and 7 "Later").
- Each of these: start with "Read docs/teardown.md backlog item N and docs/product-spec.md, then propose a plan." For all images and icons use fal.ai (API key in `.env` as `FAL_KEY`, never committed).
