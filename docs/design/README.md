# App design (v3, 2026-11-13)

Interactive mock-ups live in a private design canvas (ask the owner for access).
This folder keeps what the app build needs from it.

## Flow

1. Welcome + 18+ check — "The right reply, in any chat." Buttons: "I'm 18+, let's go" / "I'm under 18"
2. Privacy — AI consent ("Only when you tap", "Never kept", "Processed in the EU"). Allow AI replies / Not now
3. Turn on the keyboard — Add New Keyboard → Replywise → Allow Full Access (skippable)
4. Try it — tone picker, 3 cards labelled "AI suggestion"
5. Paywall — annual only, 3-day free trial, ✕ top-left from the first frame, "Remind me before the trial ends" switch (RevenueCat Paywalls template)
6. Sign in — Apple / Google / email + password, "Not now" skips
7. Home — setup card, replies-left ring, try-it field, see it in a chat, invite
8. Keyboard in a chat — Reply / Polish bar, 3 suggestion cards, keys

All copy above is English mock copy; real strings go through `locales/` in all 5 languages.

## Visual tokens

| Token | Value |
|---|---|
| Font | Plus Jakarta Sans 400–800 (headlines 34/38, 800, -0.035em) |
| Background | `#FAFAF7` |
| Ink / text | `#101114` |
| Muted text | `#5E6270` |
| Accent | `#5B47FF` (white text on it passes AA) |
| Accent soft / on soft | `#EFEDFF` / `#3A2BC2` |
| Success | `#0F7A55` on `#E3F5EC` |
| Brand gradient (decorative only) | `#5B47FF → #9B6BFF → #FF9F7A`, 150° |
| Primary button | ink pill, 56 px high, radius 28 |
| Cards | white, radius 24, soft shadow |

## Icons

Custom set on a 24 px grid, 1.8 stroke, round caps and joins, drawn on a soft lilac tile
(`#EFEDFF`, radius ≈ 33% of the tile). The four-point concave **spark** marks AI everywhere:
tile corner, Reply button, "AI suggestion" tag, logo.

## AI-generated illustrations

`assets/images/onboarding/{welcome,privacy,keyboard,paywall,signin}.webp` (1024², WebP q82).
Generated with fal.ai `fal-ai/flux-pro/v1.1`; prompts in `image-prompts.json`.
Style: soft 3D clay, violet / lilac / peach, plain warm off-white background, no text.
Decorative: render with an empty accessibility label.
