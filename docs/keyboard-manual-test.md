# Keyboard manual test (iOS and Android)

Fill this in on real phones before a keyboard change counts as done (CLAUDE.md, Definition of done). One copy of the tables per test run: put the date, build and phone at the top, write ✓ / ✗ / n/a in each cell, and note anything odd under "Notes". Measured numbers go in the "Numbers" table with the method used.

Prompt 5 covers typing only (no Reply or Polish yet). Rows marked **(P6)** start with Prompt 6.

| Run | Value |
|---|---|
| Date | |
| Build (app version and build number, `git rev-parse --short HEAD`) | |
| iPhone (model, iOS version) | |
| Android phone (model, Android version) | |
| Tester | |

## 1. Setup and status

| Check | iOS | Android |
|---|---|---|
| Keyboard appears in the system keyboard list after install | | |
| Added, Full Access **off**: keyboard opens, typing works, bar shows "Turn on Full Access in Settings for AI replies. Typing works without it." and the Settings path | | n/a |
| Turn Full Access **on**, open the keyboard once, then open the app: app shows "Added ✓ / Full Access ✓" (heartbeat) | | n/a |
| Turn Full Access **off** again: app no longer shows Full Access ✓ after 10 minutes (heartbeat is stale) | | n/a |
| Full Access on, app never opened (fresh install): bar shows "Open the Replywise app once to set up AI replies." | | |
| AI consent withdrawn in the app: bar shows "AI replies are off. Turn them on in the Replywise app." on the next open | | |
| Staging and production installed side by side: each keyboard reads only its own app's settings | | |

**Setup detection (iOS).** iOS has no public API that lists enabled keyboards. The app treats the keyboard as "added" once the keyboard has written its heartbeat (`v1.keyboardHeartbeat` in the App Group), which needs Full Access. Before Full Access is on, the app can't tell whether the keyboard was added. We don't read the undocumented `AppleKeyboards` preference.

## 2. Typing (Full Access off AND airplane mode on)

Do every row twice on iOS: once with Full Access off, once in airplane mode with Full Access on.

| Check | iOS FA off | iOS offline | Android offline |
|---|---|---|---|
| en-GB QWERTY: type "Hello, how are you?" | | | |
| de QWERTZ: ü ö ä keys, ß on long-press of s, type "Schöne Grüße" | | | |
| fr AZERTY: apostrophe key, é è à ç ù on long-press, type "Ça va, l'été ?" | | | |
| es QWERTY with ñ: type "¿Mañana?" (¿ on long-press of ?) | | | |
| it QWERTY: à è ì ò ù on long-press, type "Perché sì" | | | |
| Layout follows the app setting (Full Access on) / the device language (Full Access off) | | | |
| Shift: one tap = one capital letter | | | |
| Double-tap shift = caps lock (key shows caps lock symbol), tap again = off | | | |
| Autocapitalise at field start, after ". ", "! ", "? " and after a line break | | | |
| No autocapitalise in a field with autocapitalization off (e.g. a URL or e-mail field) | | | |
| Double space → ". " after a word; not in URL / e-mail / search fields | | | |
| Delete: one tap deletes one character (emoji with skin tone = one) | | | |
| Delete held: repeats after 0.5 s, speeds up, then deletes whole words after about 2 s | | | |
| Space, return; return label matches the host (send in Messages, search in Safari, go, done, next…) | | | |
| Return disabled (greyed) in empty fields that ask for it (e.g. Messages search) | | | |
| 123 → numbers, #+= → symbols, ABC → letters; back to letters after space or ' on the numbers page | | | |
| £ on the en-GB numbers page, € on de/fr/es/it | | | |
| Globe key shown on iPhones with a Home button; tap switches, long-press shows the keyboard list | | n/a | |
| Fast two-thumb typing keeps the letter order (type "the quick brown fox" quickly) | | | |
| Key click plays only when Settings → Sounds & Haptics → Keyboard Feedback → Sound is on | | | |
| Light haptic on key press with Full Access on; none with Full Access off (iOS can't read the system Haptic switch; see note) | | n/a | |

Note on haptics (iOS): there is no public API to read Settings → Sounds & Haptics → Keyboard Feedback → Haptic, and feedback generators are expected to do nothing in a keyboard extension without Full Access. Record here what the iPhone actually does in both cases.

## 3. Host apps

| Host app | Typing iOS | Typing Android | Reply / Polish **(P6)** |
|---|---|---|---|
| WhatsApp | | | |
| Messages / Google Messages | | | |
| Notes / Keep | | | |
| Instagram | | | |
| Tinder | | | |
| Hinge | | | |
| Gmail | | | |
| A password field (e.g. Settings → Wi-Fi → Other, or a login screen) | | | |

Password field: iOS usually swaps to the system keyboard; if Replywise shows, the bar must be empty (typing only) and nothing AI-related appears. Android: AI never offered in password fields or with `IME_FLAG_NO_PERSONALIZED_LEARNING`.

## 4. Display and accessibility

| Check | iOS | Android |
|---|---|---|
| Dark mode: keys, bar text and popups readable | | |
| Host asks for a dark keyboard in light mode (e.g. some apps' dark search bars) | | n/a |
| Largest text (Settings → Accessibility → Display & Text Size → Larger Text, max slider): bar text grows and is not cut off; keys unchanged | | |
| Landscape: keys fit, bar is at most two lines, globe key reachable | | |
| VoiceOver / TalkBack: every key reads its label (Shift, Caps lock, Delete, space, return label, Numbers, Letters, More symbols, Next keyboard) | | |
| VoiceOver: double-tap types the key; touch typing mode types on lift | | |
| VoiceOver: on a, e, o… swipe up/down offers the accents as actions, double-tap inserts | | |
| VoiceOver: bar message is announced once when the keyboard opens | | |
| Voice Control: "tap Shift", "tap Delete" work | | |

## 5. Numbers

| Measure | Target | iOS result | Android result | Method |
|---|---|---|---|---|
| Memory peak, 50 open/close cycles (typing only) | < 40 MB (iOS) | | | Xcode memory gauge, see below |
| Memory after the 50th close, compared with the 1st | no growth | | | Instruments Allocations, see below |
| Leaks after 50 cycles | 0 | | | Instruments Leaks |
| Memory peak during 20 streamed replies **(P6)** | < 40 MB | | | memory gauge |
| First frame after switching to the keyboard | < 250 ms | | | see below |
| Key press to character | < 16 ms | | | see below |
| Tap Reply to first card / third card, 4G and Wi-Fi **(P6)** | ≤ 1.5 s / ≤ 3 s | | | stopwatch from screen recording |

Measure on an older iPhone if you have one (iPhone SE 2nd gen or iPhone 11); write the model in the Run table.

### iOS: memory with Xcode (memory gauge)

1. `npx expo run:ios --device` once, so the app and keyboard are installed with a debug build.
2. Open `ios/Replywise.xcworkspace` in Xcode. In the scheme menu (top bar) choose **ReplywiseKeyboard** and your iPhone.
3. Product → Run (⌘R). Xcode asks "Choose an app to run": pick **Notes** (or WhatsApp). Notes opens on the phone.
4. In Notes, tap into a note and switch to Replywise with the globe key. Xcode attaches to the keyboard process.
5. Open the Debug navigator (⌘7) and click **Memory**. The gauge shows the keyboard extension's memory, with the high-water mark.
6. Open/close cycle = switch to another keyboard with the globe key and back to Replywise, or dismiss the keyboard (scroll down in the note) and tap the note again. Do 50 cycles, typing a few words in some of them. Write the highest value the gauge showed, and the value after the 50th close.

### iOS: Allocations and Leaks (Instruments)

1. Scheme **ReplywiseKeyboard**, then Product → Profile (⌘I). Pick **Notes** as the app to run when asked.
2. Choose the **Allocations** template; also add the **Leaks** instrument with the + button in the Instruments toolbar.
3. Press record. In Notes, switch to Replywise.
4. In Allocations, set Generation marks: click **Mark Generation** after the first open, then after every 10 cycles. A growing "Growth" column between generations means memory is kept per open (look for `KeyboardModel`, `UIHostingController`, `KeyView`).
5. After 50 cycles stop recording. Leaks must show no red leak marks; note the "All Heap & Anonymous VM" persistent bytes at the end.

### iOS: first frame and key latency

- First frame: Instruments → **App Launch** is not available for extensions; use the **Time Profiler** template with "Record Waiting Threads" on, switch to the keyboard, and measure from the `viewDidLoad` of `KeyboardViewController` to the first `CA::Transaction::commit` in the keyboard process (signposts if available). Simpler alternative: record the screen at 60 fps (Control Centre → Screen Recording) and count frames between the globe tap and the first visible keys (1 frame ≈ 16.7 ms).
- Key latency: Time Profiler while typing fast for 10 s; the main thread time per touch (from the touch event to `insertText`) must stay under 16 ms. A slow-motion camera recording (240 fps) of finger and screen is an independent check.

### Android

- Memory: Android Studio → Profiler → select `app.replywise` → Memory. Do the 50 cycles (hide / show the keyboard), force GC, and note the Java/Kotlin + native totals.
- First frame / latency: Profiler → CPU (System Trace) while switching to the keyboard and typing.

## Notes

-
