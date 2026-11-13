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
8. **Honest money.** Paywall ✕ visible from the first frame and leads to the free tier. Price per billing period in local currency from the store, never hard-coded. No countdowns, no scarcity, no per-day/week/month headline, no strikethrough or "save X%". One plan: annual with a 3-day free trial; the trial terms and the post-trial price are always shown, and a purchase never changes meaning. Never trade free uses for ratings or reviews.
9. **Every user-facing string goes through i18n** in all 5 locales (en-GB, de, fr, es, it), in the app and in both keyboards. Keyboards read strings generated from `locales/` (see architecture §9). No hard-coded text. One exception (decided 2026-11-13): the paywall template copy lives in the RevenueCat dashboard; a reviewed copy per locale stays in the repo and every dashboard change is signed off by `i18n-localizer` and `privacy-compliance` (spec §6).
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
npm run test:functions                  # Edge Function tests (fake LLM provider; deno test with supabase/functions/deno.json)
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
- Edge Function secrets via `supabase secrets set`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (direct Claude API: development and staging only, see inventory §3), `LLM_PROVIDER_PRIMARY` / `LLM_PROVIDER_FALLBACK` (`bedrock|mistral|anthropic`), `APP_ENV` (`local|staging|production`), `LLM_MODE` (`fake|live`), `REVENUECAT_WEBHOOK_SECRET`, `POSTHOG_KEY`, `SENTRY_DSN`, `DAILY_COST_ALERT_EUR`.
- App Group: `group.app.replywise.shared`. Keychain access group: `$(AppIdentifierPrefix)app.replywise.shared` (shared with the keyboard; holds only the device key). The app lists its own group `$(AppIdentifierPrefix)app.replywise` first, so the Supabase session never lands in the shared group. Bundle IDs: `app.replywise` (app), `app.replywise.keyboard` (extension). Android package `app.replywise`. Staging (`APP_VARIANT=staging`) uses fully separate names with `.staging` (`group.app.replywise.staging.shared`, `app.replywise.staging`, …). All of these come from `config/app-groups.js`.
- Local and CI use `LLM_MODE=fake` (deterministic canned replies). Only staging and production call real models.

## Definition of done

- Behaviour matches `docs/product-spec.md`.
- `/verify` passes.
- New strings exist in all 5 locales and in the generated keyboard string files.
- Reviewed by `code-reviewer`; keyboard changes also by `keyboard-extension-engineer`; prompt changes also by `prompt-engineer` with an eval report.
- Anything touching a keyboard was tried on a real iPhone and a real Android phone, with Full Access on and off, in at least two host apps (WhatsApp and Messages / Google Messages).
