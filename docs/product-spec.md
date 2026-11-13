# Product spec v1: Replywise

Source: `docs/teardown.md` (ranked items 1–10 and section 8 "Recommended v1 scope"). This file is the single source of truth for what v1 does. If code and this file disagree, ask before changing either. Prices are starting hypotheses to test; the cost reasoning behind them is in `docs/pricing.md`, and dated product decisions are logged in `docs/decisions.md`.

## 1. The promise

"The right reply, in any chat."
Under it: "Replies are written by AI. You choose what to send."

Who it's for: adults (18+) in the UK, DE, FR, ES, IT who want better replies to a match, partner, friend, family member or colleague, in their own language.

Name: Replywise is a working name. Keyboard display name in iOS/Android settings: "Replywise".

## 2. Onboarding (containing app, in this order)

Four onboarding screens, then the paywall and sign-in (decided 2026-11-13, `docs/decisions.md`).

| # | Screen | Content | Notes |
|---|---|---|---|
| 1 | Welcome + age | "The right reply, in any chat" + 3-second looping demo of the keyboard bar inserting a reply. Buttons: "I'm 18+, let's go" / "I'm under 18" | No rating ask, no push ask. Anonymous account created silently. "I'm 18+, let's go" stores `age_confirmed_at`. "I'm under 18" → stop screen: "Replywise is for adults. AI replies are off." Keyboard still types; AI never enabled for this install: a local install flag keeps AI off whatever account later signs in, and sign-in is hidden on this install (screen 6 and Settings) |
| 2 | What Replywise can see | Three lines: "Nothing you type leaves your phone unless you tap Reply or Polish." "When you tap, only the copied message or your draft goes to our AI provider, processed in the EU." "We don't keep your chats." Buttons: "Allow AI replies" / "Not now" | Records consent (kind `ai_sharing`, policy version, timestamp). Must come before any AI call, so before Try it (Apple 5.1.2(i)). "Not now" → plain keyboard; AI can be allowed later in Settings |
| 3 | Turn on the keyboard | One screen, two steps in one animated guide: (a) add the keyboard, (b) Allow Full Access (iOS). Buttons: "Open Settings" / "I've done it". "Open Settings" opens the app's own page in iOS Settings (which lists Keyboards → Replywise, and the Full Access switch under it). Full Access text: "Typing works without it. AI replies need it, because the keyboard has to reach our server when you tap Reply. We never send what you type unless you tap." Android: "Open Settings" opens input method settings, then the keyboard picker; instead of the Full Access step: "Android will warn that keyboards can collect what you type. Replywise only sends text when you tap Reply or Polish." | Full Access is skippable: "I've done it" always moves on, and typing works without it. Detection: iOS from the keyboard's heartbeat in the App Group (which needs Full Access; without it the user's "I've done it" is all the app knows, architecture §5); Android from the enabled IME list. A tick shows each step the app could confirm. Home's status card shows anything still missing, with "Fix" |
| 4 | Try it | In-app text field pre-filled with a sample incoming message in the device language (e.g. de: "Hey, wie war dein Wochenende? 😊"), a tone picker (the tones of §3.2 for the default relationship, Friend), Reply → 3 real reply cards, each labelled "AI suggestion" | Uses 1 of the 10 starter replies. The aha before price. Skipped if consent was "Not now". The field is also a place to open the new keyboard once, which lets the iOS app see the Full Access heartbeat |
| 5 | Paywall | See §6. ✕ visible at once; ✕ leads to Sign in, then Home on the free tier. Switch "Remind me before the trial ends" | Shown once in onboarding |
| 6 | Sign in | "Continue with Apple" (iOS), "Continue with Google", "Continue with email" (email + password, with "Forgot password?"). "Not now" → Home. One-line notice: "We use your email only to sign you in and send account emails." + Privacy link | Skippable. Links the anonymous account to the identity, so the device key, consent, quota and RevenueCat app user ID are kept (architecture §4). Lets the user keep their account and subscription on a new phone. Apple: request only the email scope (no full name); Google: no scopes beyond the default sign-in. No marketing email, ever: the email is used only for sign-in and account emails (confirm address, reset password). Not shown on an under-18 install |

Then Home, which shows how to use the keyboard ("Copy their message, switch to Replywise with the globe key, tap Reply") and the replies left.

Removed on 2026-11-13: the "Who do you text most?" screen (the default relationship stays Friend and can be changed in Settings and in the keyboard's chip panel), the separate Full Access screen (now step (b) of screen 3), the Reminder screen (now the switch on the paywall) and the Done screen (its how-to and counter are on Home).

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
- A request the AI refuses (spec §9) or that fails before any card is shown is refunded (decided 2026-11-02).

### 3.5 Keyboard states (bar messages)

Most messages fit one line. The bar grows to two lines for the longer ones (No Full Access, its Settings path, Out of free replies, Last trial day), which are over 70 characters in English and longer in German and French (decided 2026-11-02; limits in `locales/length-exceptions.json`).


| State | Bar shows |
|---|---|
| No Full Access | "Turn on Full Access in Settings for AI replies. Typing works without it." (+ the Settings path as text) |
| No AI consent / under 18 / consent withdrawn | "AI replies are off. Turn them on in the Replywise app." |
| Not signed up yet (app never opened) | "Open the Replywise app once to set up AI replies." |
| Offline | "No connection. AI replies need the internet." |
| Out of free replies | "Out of free replies. More tomorrow, or go unlimited in the Replywise app." (the keyboard cannot open the app) |
| Fair-use cap reached (paid) | "Daily limit reached. Back tomorrow." |
| AI provider down | "AI replies are having trouble. Try again in a minute." |
| Last trial day | "Your free trial ends tomorrow: €29.99/year after that. Manage in the Replywise app." (price from the store, mirrored by the app) |
| Crisis detected | Crisis card (see §9) above the reply cards |

## 4. Reply quality rules (all languages)

- 3 replies that differ in approach (e.g. a question back, a statement, a light joke), each ≤ 200 characters unless the incoming message is long.
- Sound like a real person texting: short sentences, no hashtags, no "As an AI", no quotes around the text.
- Respect grammatical gender from Settings "I am" / "They are" (woman, man, rather not say). With "rather not say", use gender-neutral phrasing where the language allows. Never assume the user is a man.
- Emoji: match the incoming message (none if it has none; at most one otherwise).
- Banned per language: pet names to people who just met, pick-up-line clichés, "greasy" lines, passive-aggressive phrasing. Lists in the prompt files.
- Per-language rules: address form, gender agreement, punctuation (Spanish ¿ ¡, French spaces before ? ! ; :), UK spelling for English.

## 5. Free vs paid

| | Free | Unlimited (Annual) |
|---|---|---|
| Typing | ✓ | ✓ |
| AI replies + Polish | 10 starter replies on install (granted when the account is created; usable only after AI consent and the 18+ check), then 3 per day (reset at local midnight) | Unlimited (fair use: up to N replies a day, disclosed on the paywall and in the terms; N is 300 in the server today, and 300 vs 100 is open, `docs/pricing.md`) |
| All tones, chips, formality, languages | ✓ | ✓ |
| Referral bonus | +10 replies for you and your friend after the friend's first inserted reply | n/a |

- One "reply" = one Reply, ↻ More, chip update or Polish request.
- Counter is authoritative on the server (by user ID); the keyboard shows a cached value from the App Group.
- Never tie free uses to ratings, reviews or shares on social media.

## 6. Paywall

Shown once in onboarding (screen 5), then only when the user taps "Go unlimited" (Home, Settings, out-of-replies card in the app).

- **One plan: Annual**, 3-day free trial (store introductory offer). EUR reference price **€29.99/year**, used to configure App Store Connect and Play Console; other currencies use the stores' price tiers. Weekly and Lifetime were removed on 2026-11-13. Rationale: `docs/pricing.md`.
- The price per billing period always comes from the store at runtime, in local currency. Never a hard-coded amount in the app, the template or the keyboard.
- **Built with RevenueCat Paywalls** (`react-native-purchases-ui`): the app's paywall route embeds `RevenueCatUI.Paywall` for the current offering, with the reminder switch rendered by the app under it. The template and its copy (all 5 languages) are configured remotely in the RevenueCat dashboard, so a template change ships without an app release and must be checked against the list below first. `presentPaywall` is not used, because it can't hold the switch.
- **Required template settings** (CLAUDE.md rule 8; check them on every template change):
  - ✕ (close button) visible from the first frame: no "show after a delay" setting, 44 pt hit area. ✕ → onboarding: Sign in, then Home on the free tier; elsewhere: back to where the user came from, free tier. Never replays the intro.
  - The price per billing period from RevenueCat's store price variables ("€29.99/year" in the user's currency). The billed "€X/year" is the most prominent price text, never smaller than "3 days free". No "free" headline without the post-trial price next to it.
  - No RevenueCat per-day, per-week or per-month price variables and no relative-discount variables; no strikethrough or "save X%".
  - The purchase button (CTA) never says only "Try free"; it names the plan or the price (e.g. "Start 3 days free, then €29.99/year").
  - No countdown, timer, scarcity or "limited offer" element.
  - Trial timeline: "Today: free · {date}: charged €29.99/year" (or "Day 3: charged €29.99/year" where the template can't show the date), price from the store. The timeline never promises a reminder: the reminder belongs to the app-drawn switch row, which the user can turn off.
  - Renewal text under the button: "3 days free, then €29.99 per year. Renews until you cancel in App Store subscriptions." (Android: "…in Google Play subscriptions."), with the price from the store variable. A user who isn't eligible for the trial (the store decides) sees the template's no-trial text: "€29.99 per year. Renews until you cancel in …".
  - Links: Terms, Privacy, Restore purchases.
  - Fair-use line: "Fair use: up to {{count}} replies a day" (`paywall:fairUse`), drawn by the app under the template next to the reminder switch, with the same number in the terms. The number comes from the server's cap (300 today; 300 vs 100 open, `docs/pricing.md`), never typed into copy.
  - A Maestro flow (`e2e/paywall-close.yaml`) checks on every build that the ✕ is visible on the first frame and leads to the free tier.
- **Switch "Remind me before the trial ends"**, rendered by the app under the paywall, on by default. Only if it is on when the trial starts does the app ask for OS notification permission and schedule the trial reminder (§8). Off → no prompt. It can be changed later in Settings → Reminders. The switch is hidden when the user isn't eligible for the trial, and it is not visually tied to the purchase button (its own row, not inside or directly on the CTA).
- **Template change control.** The template text is remote copy, so it is controlled like code:
  - A reviewed copy of the template text for each locale lives in the repo (`locales/<lang>/paywall-template.md`); the dashboard must match it.
  - Every dashboard change is signed off by `i18n-localizer` and `privacy-compliance` before it is published.
  - Dashboard access is restricted to the people who publish paywalls.
  - The Maestro ✕ flow also runs on a schedule against the production offering, so a dashboard change that hides the ✕ is caught without an app build.
  - Template copy sits outside `locales/` JSON, an exception to CLAUDE.md rule 9 the user still has to confirm (`docs/decisions.md`).
- Manage or cancel subscription and Request a refund live in Settings (§7).
- Family Sharing: later.

## 7. Containing app screens

- **Home:** how to use it ("Copy their message, switch to Replywise with the globe key, tap Reply"), keyboard status card (Added ✓/✗, Full Access ✓/✗, with "Fix" buttons that reopen the setup guide), replies left today, Try-it field, "Go unlimited" (free users), a trial-ends banner on the last trial day when trial-reminder notifications are denied (§8), provider-down banner.
- **Settings:** Sign in / Sign out (shows the signed-in email, or Apple / Google; Sign out revokes this phone's device key and clears it from the keychain, then signs out of Supabase and RevenueCat; what the app does after sign-out is open, see `docs/decisions.md`) · App language · Keyboard language and layout · Default relationship (Friend unless changed) · I am / They are · Formality default · Allow AI replies (on/off = consent / withdraw) · Reminders (trial reminder, free replies are back) · Manage or cancel subscription (DE: "Verträge hier kündigen") · Request a refund (Apple link on iOS; Play order history on Android) · Restore purchases · Invite friends · Enter a friend's code · Write to the maker · Privacy · Terms · Delete my data (before deleting, warns that a subscription is not cancelled by deleting data, with a link to the store's subscription management) · App version.
- **Invite friends:** personal link `https://replywise.app/r/<code>` via share sheet. The landing page shows the code and store buttons. The friend enters the code in Settings. +10 replies for both after the friend's first inserted reply. No cash payouts.
- **Write to the maker:** text field (≤ 2,000 chars) + optional reply email. Attaches app version, OS, language and plan status. Never chat text. "We reply within 48 hours, in your language."

## 8. Notifications (local only)

| Notification | When | Copy (en) |
|---|---|---|
| Trial ends tomorrow | 24 h before the trial converts (Day 2 of 3), if the paywall switch "Remind me before the trial ends" was on when the trial started, or the user turned it on in Settings. If notification permission is denied: an in-app banner on Home and the keyboard's last-trial-day bar (§3.5) instead | iOS: "Your free trial ends tomorrow. Then €29.99/year. Cancel anytime in your App Store subscriptions." Android: "…in your Google Play subscriptions." (price from the store) |
| Annual renewal soon | 7 days before an annual renewal (prepares for UK DMCC, proposed from 1 Jan 2027) | "Your Replywise year renews on 12 Mar for €29.99." (price from the store) |
| Free replies are back | Optional, off by default, at most once a day, only if the user ran out the day before | "Your 3 free replies are back." |

No marketing pushes. Rescheduled on every app open from RevenueCat customer info.

## 9. Safety

- 18+ gate (screen 1). App Store and Play age rating 18+.
- No sexual or explicit replies at any setting (Apple 1.1.4). Flirt level tops out at Playful.
- Refuse and return a neutral note for requests that would harass, threaten, stalk, deceive for money, pressure someone into sex, or target a person who appears to be a minor. If the incoming message suggests the other person is a minor, never flirt. A server-side check also catches an incoming message that states, in the first person, an age under 18 or a school year of a minor: replies to a Match or Partner are refused (and refunded) before any AI call, unless the message suggests a crisis; for everyone else Flirty is replaced by Warm.
- **Crisis:** if the copied message or draft suggests self-harm, suicide or immediate danger, replies are calm and supportive, and a card shows: "If someone is in danger, call 112." plus a country line (UK Samaritans 116 123; DE TelefonSeelsorge 0800 111 0 111; FR 3114; ES 024; IT Telefono Amico 02 2327 2327; verify all numbers before launch). A server-side keyword check in all five languages also triggers the card if the AI's own signal is missing. Nothing about a crisis is stored per user; only an anonymous daily count (date, language, source) is kept to check the feature works.
- No medical, legal or therapy claims. No "coach" persona that pretends to be human.
- Abuse: reports through "Write to the maker"; per-user rate limit 20 requests/minute.

## 10. Data kept

| Data | Where | Retention |
|---|---|---|
| Settings, chips, last choices, counter cache, consent mirror, trial end date, I am / They are | Device (App Group / SharedPreferences) | Until uninstall or Delete my data |
| User ID (anonymous until the user signs in), app language, time zone (for the daily reset), age confirmation timestamp | Server `profiles` | Until deletion, or 12 months without sign-in or reply request (accounts with an active subscription are kept) |
| Email address, a pending email change (`email_change`, until confirmed or abandoned: purged after 24 h unconfirmed), and the Apple or Google account identity (provider user ID and the email it shares; with Apple this can be a private relay address), if the user signs in. Email sign-in: the password only as a hash. Supabase also copies the provider's name and avatar URL into `identity_data` / `raw_user_meta_data`: we request no name scope and strip any name or avatar the provider still sends right after sign-in | Supabase Auth (`auth.users`, `auth.identities`) | Until account deletion: "Delete my data" deletes the auth user; the 12-month inactive-account purge above deletes it too |
| Consent records (kind, policy version, granted/withdrawn timestamps) | Server `consents` | Until deletion (decided 2026-11-02; confirm with counsel) |
| Device keys (hash only) | Server `device_keys` | Until rotated or deletion |
| Daily usage counter, starter and bonus credits, per-reply spend and refund rows | Server `usage_days`, `credit_ledger` | 90 days for days; spend and refund rows folded into one balance row after 90 days; grants until deletion |
| AI request metadata: time, kind, source (keyboard/app), language, tone, relationship, closeness, formality, flirt level, provider, model, prompt version, tokens, cost, latency, status, charge type and refund time, number of cards, safety flags (refused/redacted; never crisis). **No text, no I am / They are.** | Server `ai_requests` | 90 days, then aggregated without user ID |
| Crisis count: date, language, source, number of crisis cards shown. **No user link.** | Server `crisis_daily` | Until aggregated reporting is no longer needed (decide before launch) |
| Feedback: 👍/👎 and inserted, linked to request metadata and user ID (for Delete my data and referral rewards). **No text.** | Server `reply_events` | 12 months |
| Entitlement state from RevenueCat webhook | Server `entitlements` | Until deletion |
| Referral codes and redemptions | Server `referrals` | Until deletion |
| Support messages (what the user wrote to us), app version, OS, language, plan | Server `support_messages` + inbox | 12 months |
| **Chat text (copied message, draft, replies) and I am / They are** | **Memory only during the request; sent to the AI provider with no retention** (production: Bedrock EU / Mistral EU; the direct Claude API used on staging has its own retention and is not EU-only, see `docs/processors.md`) | **Never stored, never used for training, never logged** |

No contacts, photos, location, phone number or ad identifiers. No email unless the user signs in (Apple, Google or email) or gives one for a support reply. No marketing email.

## 11. Languages

English (UK), German, French, Spanish (Spain), Italian for the app, both keyboards, notifications, privacy pages, store listings and screenshots. App UI uses the informal form (du, tu, tú, tu). Prompt rules per language in `supabase/functions/_shared/prompts/lang/<lang>.v1.md`. Native-speaker review of 50 replies per language per tone group before launch.

## 12. Analytics events (PostHog, no personal data, no text)

App (client): `onboarding_step_viewed {step}`, `age_gate {passed}`, `ai_consent {granted}`, `try_it_reply_shown`, `keyboard_added`, `full_access_granted`, `paywall_viewed {source}`, `paywall_closed`, `trial_started`, `purchase {product}`, `reminder_opt_in {granted}`, `referral_shared`, `referral_redeemed`, `support_sent`, `consent_withdrawn`, `data_deleted`.

Server (from Edge Functions, keyed by user ID, never by email): `reply_requested {kind, lang, tone, relationship, closeness, formality, source: keyboard|app}`, `reply_shown {latency_ms, provider}`, `reply_inserted {card_index}`, `reply_feedback {rating}`, `quota_hit {plan}`, `provider_fallback`, `safety_flag {type}`.

## 13. Compliance must-haves

- Apple 4.4.1 keyboard rules (typing without Full Access, next-keyboard key, AI as an extra); 5.1.2(i) explicit AI-sharing consent; 3.1.2 subscription disclosures; 4.8 Login Services (Sign in with Apple is offered on iOS because Google sign-in is); 5.1.1(v) in-app account deletion ("Delete my data" deletes the auth user); no rating incentives; 1.1.4 no sexual content; age rating 18+.
- Google Play: IME and clipboard policies, data safety form (email for account management, if the user signs in), account deletion in the app and through a web link, subscriptions policy (clear trial terms).
- EU AI Act Art. 50(1): users told replies are AI-generated (labels, onboarding line). Art. 50(2) machine-readable marking of plain text and whether recipients must be told: open, to verify with counsel before 2 Dec 2026.
- GDPR: privacy notice covering the other person's messages, lawful basis, DPIA, deletion in Settings, processor agreements.
- Consumer: Apple runs the EU 14-day withdrawal for App Store purchases (link to it; don't promise our own); no fake scarcity or countdowns (UCPD Annex I No 7); no "free" that hides the post-trial price (Annex I No 20); DE cancel entry labelled "Verträge hier kündigen" opening store management (§312k BGB scope for store billing unsettled); UK DMCC reminders (proposed 1 Jan 2027).
- App Privacy label: no tracking. Contact info (email) is linked to the user for app functionality and account management when they sign in. Usage data and diagnostics: to decide (privacy-compliance). PostHog server events and RevenueCat use the user ID, which becomes linked once the user signs in; options in `docs/decisions.md`.

## 14. Out of scope for v1

Screenshot input, word prediction and themes, per-contact memory, openers from a bio, chat analysis card, custom personas or "my voice", inline translation, chat practice, night quiet mode, regional language variants (es-MX, fr-CA, de-CH, en-US), web purchase, human coaching, cash referrals. See the backlog in `docs/teardown.md`.
