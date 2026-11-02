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
| LLM, primary | **Anthropic Claude on Amazon Bedrock** (SDK: `npm:@anthropic-ai/bedrock-sdk` with its `@aws-sdk/*` dependencies, in the `reply` Edge Function only) through the **EU cross-region inference profile** (model IDs start with `eu.`), source region Frankfurt (`eu-central-1`). A small fast model for replies (a current Claude Haiku-class model; check current model names in the Bedrock console) | EU geography processing; per AWS, model providers have no access to prompts and completions; no training on inputs | Check the account's Bedrock data-retention mode (AWS documents a `data_retention` setting and abuse-detection storage for some models) and pick the setting that stores nothing. Sign the AWS DPA (part of the AWS customer agreement) |
| LLM, fallback | **Mistral AI La Plateforme** (Paris), a current Mistral Small-class model (check current model names) | EU company, EU hosting | Ask Mistral for zero data retention on the API account and confirm in writing before launch; sign their DPA |
| LLM, development and staging | **Anthropic Claude API, direct** (`npm:@anthropic-ai/sdk` in the `reply` Edge Function), Claude Haiku 5.5 (`claude-haiku-5-5`) | The key the team has today; same Claude models as the Bedrock plan, so prompts carry over | **Not for production as it stands:** the direct API's `inference_geo` offers only `"global"` or `"us"`, so it can't back the "processed in the EU" promise. The `reply` function always refuses this provider when `APP_ENV=production` (and on hosted Supabase a missing `APP_ENV` counts as production). Data retention per Anthropic's commercial terms (confirm). Secret `ANTHROPIC_API_KEY` only in Edge Function secrets |
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
| Lint and format | **ESLint** + **Prettier** + `tsc --noEmit`; **SwiftFormat**; **ktlint** | | npm dev packages: `eslint`, `eslint-config-expo`, `eslint-config-prettier`, `prettier`, `typescript` |
| Test packages | `jest`, `jest-expo`, `@testing-library/react-native`, `test-renderer` (RNTL 14 peer), `@types/jest` | Jest + RNTL above | Added in prompt 0 |
| Expo Router peers | `react-dom` (Expo Router peer, pinned to the React version), `expo-linking`, `expo-constants`, `react-native-screens`, `react-native-safe-area-context`, `expo-status-bar`, `expo-dev-client` | Required by Expo Router and the development build | Install with `npx expo install` so versions match the SDK |
| CI | **GitHub Actions**: lint, type-check, Jest, Deno, pgTAP on every push; `swift test` on a macOS runner; Gradle unit tests; **EAS Build** on tags | | |

## 6. Builds and releases

| Need | Use | Notes |
|---|---|---|
| Native builds | **EAS Build** | The keyboard target needs its own provisioning profile; EAS credentials handle multiple targets (check current docs) |
| Store upload | **EAS Submit** | |
| Over-the-air fixes | **EAS Update** | JS only. Can't change the keyboards. Never use it to change what data is sent or collected |
| Store screenshots | Device screenshots + **Figma** | 5 languages; show the keyboard inside a chat |
| App icon | Figma | |
| Generated images and icons | **fal.ai**, local design tooling only | Run from your machine with `FAL_KEY` in `.env` (never `EXPO_PUBLIC_`, never committed). Generated files are reviewed and committed as plain assets. Never called from the app, the keyboards or Edge Functions, and never sent user data |

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
