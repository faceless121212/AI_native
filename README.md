# Replywise

A keyboard that writes the reply for you, in any chat app. Copy the other person's message, switch to Replywise with the globe key, tap **Reply**, pick one of three suggestions. It replies in the chat's language (English, German, French, Spanish, Italian) with the right formality (du/Sie, tu/vous, tú/usted, tu/Lei).

- **Platforms:** iOS and Android. The containing app is Expo (React Native, TypeScript). The keyboards are native: an iOS Keyboard Extension in Swift/SwiftUI and an Android `InputMethodService` in Kotlin. React Native never runs inside a keyboard.
- **Markets:** UK, Germany, France, Spain, Italy. Five languages at launch. Age 18+.
- **Model:** typing is always free. AI replies: 10 starter replies, then 3 free per day. Unlimited: Weekly €4.99 (3-day free trial), Annual €39.99 (pre-selected), Lifetime €59.99 (one-time, fair use up to 100 replies a day).
- **Privacy promise:** nothing you type leaves your phone unless you tap Reply or Polish. Then only the copied message and your draft go to an EU-hosted AI. We don't keep your chats. No keystroke logging, ever.

The product is based on a teardown of the Chinese reply keyboards (Lovekey #4 in CN Utilities top-grossing, 高情商键盘 #16 in Reference, single-day chart pull on 25 Oct 2026) and the Western screenshot apps. See `docs/teardown.md`.

## Files Step 0 creates

| File | What it is | Who reads it |
|---|---|---|
| `README.md` | Part A of this document | You |
| `inventory.md` | Every tool, service and account to use, with why, cost and setup order | You |
| `BUILD.md` | This document; Part C has the 16 build prompts | You → Claude Code |
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
- **Honest money.** Visible ✕ on the paywall, exact trial terms, a reminder before the charge, a lifetime that stays lifetime.
- **No sexual content, 18+ only, every suggestion labelled as AI.**

## Build order at a glance

| Phase | Prompts | Result |
|---|---|---|
| Foundation | 0–2 | Repo with app + keyboard targets, design system, 5 languages, Supabase schema with security rules |
| AI core | 3–4 | The AI proxy with quotas and fallback, versioned prompts and an eval set |
| iOS keyboard | 5–6 | Native keyboard that types offline, then the reply bar with streaming replies |
| App | 7–10 | Onboarding with consent and keyboard setup, paywall with trial reminder and lifetime, free counter and referral, home and settings |
| Android | 11 | Native Android keyboard with the same reply bar |
| Trust | 12–14 | AI quality and safety pass, monitoring and cost, accessibility and translation pass |
| Launch | 15 | Store listings, privacy labels, builds ready to submit |

Plan on 8–12 weeks of evenings for one person, most of it in prompts 5, 6, 11 and 12.

## Running it

See `docs/device-setup.md` for building to a real iPhone and Android phone and turning on the keyboard.
