# Decisions

Product and technical decisions made by the user, newest first. `docs/product-spec.md` and `docs/architecture.md` hold the resulting behaviour; this page says what was decided, when, and what is still open. Earlier decisions are recorded inline where they were made (e.g. "decided 2026-11-02" in the spec, `docs/processors.md`).

## 2026-11-13 (later the same day): answers to the open questions

The user's answers, given to the coordinator on 2026-11-13. They supersede the matching parts of the entry below.

1. **Subscriber fair-use cap: 100 replies a day** (was 300). Migration `20261113130000_fair_use_cap_100.sql`: `reply_plan` returns (`annual`, 100). Disclosed on the paywall ("Fair use: up to 100 replies a day") and in the terms. Worst case ≈€11/year against ≈€21 net (`docs/pricing.md`).
2. **Sign-in is Apple + Google only; email + password is dropped completely.** The user wants the Supabase service only, and Supabase's built-in email sender is for testing only. Replywise sends no email, so there is no SMTP provider. Supabase Auth still stores the email Apple or Google shares (possibly an Apple private relay address; spec §10). Email sign-up stays off in `supabase/config.toml`. Sign-in notice: "We use your Apple or Google sign-in only to keep your plan on all your devices." + Privacy link.
3. **Paywall template text: explicit exception to CLAUDE.md rule 9 approved.** The RevenueCat template copy lives in the dashboard, under the controls in spec §6 (reviewed copy per locale in the repo, sign-off by i18n-localizer and privacy-compliance, restricted dashboard access, scheduled Maestro ✕ check). CLAUDE.md is edited by the coordinator.
4. **Identity already has an account on a new phone:** switch to that account and delete the guest account with its starter credits (architecture §4.1 step 4).
5. **After Sign out, AI is off until the user signs in again.** Typing keeps working; Reply / Polish show the keyboard bar state "Sign in to use AI replies" with an "Open app" action (spec §3.5, architecture §5–6, `v1.signedOut`); Home shows a sign-in card; no new anonymous account is created. Strings are in all 5 locales and the generated keyboard files; the Swift / Kotlin state-machine work is a follow-up in BUILD.md Prompt 8b.

## 2026-11-13: Onboarding, paywall, sign-in, pricing, backend

Approved by the user on 2026-11-13.

1. **Onboarding is 4 screens** (spec §2): Welcome with the 18+ check ("I'm 18+, let's go" / "I'm under 18"), Privacy / AI consent ("Not now" allowed), Turn on the keyboard (add keyboard, then Allow Full Access on iOS, on one screen; "Open Settings" / "I've done it"; Full Access skippable), Try it (tone picker, 3 cards labelled "AI suggestion"; skipped after "Not now"). Then Paywall, Sign in, Home. Removed: "Who do you text most" (default relationship stays Friend, changeable in Settings and the keyboard), the separate Full Access screen, the Reminder screen (now a switch on the paywall) and the Done screen (Home shows the how-to and replies left).
2. **Paywall** (spec §6): Annual only, €29.99/year EUR reference price, 3-day free trial; Weekly and Lifetime removed everywhere. Price per period from the store at runtime. ✕ from the first frame → Sign in → Home on the free tier. Switch "Remind me before the trial ends" (on by default; asks for notification permission only if on when the trial starts). Trial timeline Today / Day 2 reminder / Day 3 charge. Renewal text "3 days free, then €29.99 per year. Renews until you cancel in App Store subscriptions." (Android: Google Play). Built with **RevenueCat Paywalls**, configured remotely; the template must keep CLAUDE.md rule 8 (spec §6 lists the settings) and a Maestro test checks the ✕. Free tier unchanged; the subscriber fair-use cap unchanged (300/day; later that day set to 100/day, see above); the lifetime 100/day line removed.
3. **Sign in after the paywall, skippable** (spec §2 screen 6, architecture §4.1): Continue with Apple (iOS), Google, email + password with "Forgot password?" (email + password dropped later that day, see above). Supabase Auth links the identity to the existing anonymous user; RevenueCat `logIn` with the Supabase user ID. Sign in with Apple is required on iOS because Google is offered (App Store 4.8). Libraries: expo-apple-authentication and @react-native-google-signin/google-signin (`inventory.md` §1 has the reasoning). New personal data: the Apple / Google identity and the email it shares, in Supabase Auth, kept until account deletion (spec §10). Settings gains Sign in / Sign out.
4. **Pricing rationale**: `docs/pricing.md`.
5. **Backend stays Supabase.** The user asked whether to move to Firebase and chose to stay on Supabase: the schema, RLS, pgTAP tests, consent and quota SQL and the `reply` Edge Function already run there; the data stays in Frankfurt; Postgres + RLS fits the rules in CLAUDE.md (rule 10); and anonymous-to-permanent account linking with Apple and Google sign-in is supported by Supabase Auth. (`inventory.md` §10 also keeps Firebase Analytics out for tracking reasons.)

### What changed in the repo

- Docs: spec §2, §3.5, §5–10, §12–13; architecture §2–4, §7–8, §11–12; inventory §1, §3, §4, §7, §8, §10; processors; BUILD.md (Part A, prompts 7–10, 14, 15, new prompt 8b); README; this page and `docs/pricing.md`.
- Database: migration `20261113130000_fair_use_cap_100.sql` (cap 100, later the same day) and `20261113120000_annual_only_plan.sql` (entitlements product `annual` only, trial allowed on annual, lifetime constraint dropped, `reply_plan` returns `annual`/300, `inactive_accounts` keeps only active annual subscribers, `support_messages.plan` is `free`/`annual`).
- API contract: `Plan` is `free | annual` (`schemas.ts`, `docs/reply-api.json`).
- App: the in-app `PlanCard` component and the paywall strings it used were removed (the paywall is now RevenueCat's). New strings for the age buttons, the keyboard-setup buttons, the paywall reminder switch, sign-in and Sign in / Sign out, in all 5 languages. The trial-ends notifications and the keyboard's last-trial-day bar now say per year.

### Open questions

Still open after the answers above.

- **Reminder switch placement:** RevenueCat templates can't run app logic, so the app draws the switch under the embedded `RevenueCatUI.Paywall`. Check on a small phone that the ✕, the price, the renewal text and the switch all fit without scrolling in all 5 languages; if not, decide where the switch goes.
- **Apple on Android:** Sign in with Apple is offered on iOS only; an iPhone user moving to Android would sign in with Google. Confirm, or add Apple's web flow on Android.
- **Sign-in analytics:** spec §12 has no sign-in events. Add e.g. `sign_in {method}` and `sign_in_skipped`?
- **App Privacy label and Play data safety:** the email Apple or Google shares is linked to identity for signed-in users. PostHog server events and RevenueCat use the user ID, which becomes linked once the user signs in. Two options: (a) declare usage data and purchases as linked to identity; (b) use a separate random analytics ID for PostHog that is never joined to the account (RevenueCat stays on the user ID and is declared linked). privacy-compliance to decide with the user.
- **"Open app" on iOS:** a keyboard extension has no supported API to open its containing app. If no supported way exists, the iOS SIGNED_OUT bar shows the text only. Confirm that's acceptable.
- **Inactive-account purge as an Edge Function:** to revoke the Apple token and delete the RevenueCat customer like Delete my data, the purge must move out of SQL into a scheduled Edge Function (follow-up; architecture §4.1 step 6).
- **CLAUDE.md and `.claude/agents/`** were updated on 2026-11-13 to the annual-only plan (rule 8 and the release-manager, privacy-compliance and test-engineer checklists).

### Decided (moved from open, 2026-11-13)

- Subscriber cap → 100/day.
- Email sending → none: no email + password sign-in, no SMTP provider.
- CLAUDE.md rule 9 exception for paywall template copy → approved.
- Sign-in where the identity already has an account → switch, delete the guest account and its starter credits.
- After Sign out → AI off until sign-in; no new anonymous account.
- Fair-use number on the paywall → 100.

### Before launch

Launch-only items from the 2026-11-13 privacy review. None blocks merging the docs change.

- **DPIA** (`docs/dpia.md`): add sign-in (Apple / Google identity and the email it shares), Apple token storage, and the linked-ID analytics decision.
- **Privacy notice:** sign-in data and purpose (keeping the plan on all devices; Replywise sends no email), Apple and Google as independent controllers, Supabase Auth logs, retention until account deletion, deletion steps (Apple token revoked, RevenueCat customer deleted), the fair-use cap. Also the terms: the fair-use number.
- **GDPR Art. 32 auth hardening** (Supabase Auth): email sign-up kept off (no passwords), rate limits on sign-in and anonymous sign-up, CAPTCHA on anonymous sign-up if abuse appears, nonce checks on Apple / Google ID tokens, short JWT expiry with refresh-token rotation (on), redirect allow-list limited to `replywise://`, Apple refresh tokens encrypted at rest with the key in Edge Function secrets, service-role key only in Edge Functions, auth logs reviewed for email exposure.
- **App Privacy label field list:** Contact info → Email address shared by Apple / Google (linked; app functionality, account management); Identifiers → User ID (linked or not, per the analytics decision); Purchases → Purchase history (RevenueCat); Usage data → Product interaction (PostHog); Diagnostics → Crash data, Performance data (Sentry); no tracking. Keep in sync with spec §10.
- **Google Play data safety field list:** Personal info → Email address from Google sign-in (collected, not shared, optional, account management); App activity → App interactions; App info and performance → Crash logs, Diagnostics; Financial info → Purchase history; encryption in transit yes; deletion request in the app and at `https://replywise.app/delete`.
- **UK DMCC reminders:** the annual renewal reminder (spec §8) and any trial-end reminder rules once the subscription regime starts (proposed 1 Jan 2027); confirm scope for store billing.
- **Charge date on the trial timeline:** confirm the RevenueCat template can show the actual charge date ("{date}: charged €29.99/year") in all 5 locales; otherwise use "Day 3: charged €29.99/year".
- **RevenueCat transfer-purchases setting:** choose how purchases move when a store account is used by another app user ID (sign-in on a second phone, the deleted anonymous account): "transfer to new App User ID" vs "keep with original", and test it with sandbox accounts.
