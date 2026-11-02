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
| 4 | What Replywise can see | Three lines: "Nothing you type leaves your phone unless you tap Reply or Polish." "When you tap, only the copied message or your draft goes to our AI provider, processed in the EU." "We don't keep your chats." Buttons: "Allow AI replies" / "Not now" | Records consent (kind `ai_sharing`, policy version, timestamp). Must come before any AI call, so before Try it (Apple 5.1.2(i)). "Not now" → plain keyboard; AI can be allowed later in Settings |
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
| AI replies + Polish | 10 starter replies on install (granted when the account is created; usable only after AI consent and the 18+ check), then 3 per day (reset at local midnight) | Unlimited (fair use: lifetime 100/day; subscriptions 300/day abuse cap) |
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
| Trial ends tomorrow | 24 h before the trial converts, if the user agreed on screen 9 or in Settings | iOS: "Your free trial ends tomorrow. Then €4.99/week. Cancel anytime in your App Store subscriptions." Android: "…in your Google Play subscriptions." |
| Annual renewal soon | 7 days before an annual renewal (prepares for UK DMCC, proposed from 1 Jan 2027) | "Your Replywise year renews on 12 Mar for €39.99." |
| Free replies are back | Optional, off by default, at most once a day, only if the user ran out the day before | "Your 3 free replies are back." |

No marketing pushes. Rescheduled on every app open from RevenueCat customer info.

## 9. Safety

- 18+ gate (screen 2). App Store and Play age rating 18+.
- No sexual or explicit replies at any setting (Apple 1.1.4). Flirt level tops out at Playful.
- Refuse and return a neutral note for requests that would harass, threaten, stalk, deceive for money, pressure someone into sex, or target a person who appears to be a minor. If the incoming message suggests the other person is a minor, never flirt.
- **Crisis:** if the copied message or draft suggests self-harm, suicide or immediate danger, replies are calm and supportive, and a card shows: "If someone is in danger, call 112." plus a country line (UK Samaritans 116 123; DE TelefonSeelsorge 0800 111 0 111; FR 3114; ES 024; IT Telefono Amico 02 2327 2327; verify all numbers before launch). A server-side keyword check in all five languages also triggers the card if the AI's own signal is missing. Nothing about a crisis is stored per user; only an anonymous daily count (date, language, source) is kept to check the feature works.
- No medical, legal or therapy claims. No "coach" persona that pretends to be human.
- Abuse: reports through "Write to the maker"; per-user rate limit 20 requests/minute.

## 10. Data kept

| Data | Where | Retention |
|---|---|---|
| Settings, chips, last choices, counter cache, consent mirror, trial end date, I am / They are | Device (App Group / SharedPreferences) | Until uninstall or Delete my data |
| Anonymous user ID, app language, time zone (for the daily reset), age confirmation timestamp | Server `profiles` | Until deletion, or 12 months without sign-in or reply request (accounts with an active subscription or a lifetime purchase are kept) |
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
