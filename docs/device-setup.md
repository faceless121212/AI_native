# Running Replywise on your phones

How to build the development app (with the keyboard) to a real iPhone and a real Android phone, and how to turn the keyboard on. Written for Prompt 0, where the keyboard shows a single "Replywise" row and a switch key. Keep this file up to date as later prompts add setup steps.

## One-time setup on your Mac

```bash
git clone https://github.com/faceless121212/AI_native.git replywise
```

```bash
cd replywise && npm ci
```

```bash
cp .env.example .env
```

In `.env`, set `APPLE_TEAM_ID` to your Apple Developer Team ID (developer.apple.com → Membership details). It signs both the app and the keyboard.

You need Xcode (with your Apple ID added under Settings → Accounts), Android Studio (with an SDK installed and `ANDROID_HOME` set), and the phones connected by USB with developer mode on (iPhone: Settings → Privacy & Security → Developer Mode; Android: Developer options → USB debugging).

## iPhone

```bash
npx expo prebuild --clean -p ios
```

```bash
npx expo run:ios --device
```

Pick your iPhone from the list. The first build asks Xcode for signing:

- If signing still fails, check `APPLE_TEAM_ID` in `.env`, run `npx expo prebuild --clean -p ios` again, and look at Signing & Capabilities in `ios/Replywise.xcworkspace` for **both** targets (`Replywise` and `ReplywiseKeyboard`).
- Both targets use the App Group `group.app.replywise.shared` and the keychain group `$(AppIdentifierPrefix)app.replywise.shared`. With automatic signing, Xcode registers the App IDs `app.replywise` and `app.replywise.keyboard` and the App Group for you; otherwise create them in the Apple Developer portal and enable the App Group on both IDs. Staging builds (`APP_VARIANT=staging`) use separate IDs and groups (`app.replywise.staging`, `app.replywise.staging.keyboard`, `group.app.replywise.staging.shared`), so staging and production can be installed side by side.
- `targets/keyboard/Tests/`, `Package.swift` and SwiftPM's `.build/` and `.swiftpm/` folders are kept out of the keyboard build by `plugins/with-keyboard-target-exclusions.js`. If an Xcode build ever fails on `import XCTest`, run `npx expo prebuild --clean -p ios` and tell Claude.

Turn the keyboard on:

1. Settings → General → Keyboard → Keyboards → Add New Keyboard…
2. Under "Third-Party Keyboards", tap **Replywise**. Don't turn on Full Access; it isn't needed yet.
3. Open Notes (or any text field), tap and hold the globe key under the keyboard (or the 🌐 key on the keyboard), and choose **Replywise**.
4. You should see a row with "Replywise". On iPhones with a Home button there's also a globe key in the row; on Face ID iPhones the system globe sits below the keyboard instead. Tap the globe key to go back to your normal keyboard; tap and hold it to see the keyboard list.

## Android phone

```bash
npx expo run:android --device
```

Pick your phone from the list. Then turn the keyboard on (menu names differ a little between phone makers):

1. Settings → System → Keyboard (or "Languages & input") → On-screen keyboard → Manage keyboards.
2. Turn on **Replywise**. Android warns that the keyboard may collect what you type; accept it. Replywise doesn't send anything yet, and later only sends text when you tap Reply or Polish.
3. Open any text field, tap the keyboard icon in the navigation bar (or the switch-keyboard key on your current keyboard), and choose **Replywise**.
4. You should see "Replywise" and a language key that switches back to your other keyboard.

## Day-to-day

After the first native build you only need the dev server for JavaScript changes:

```bash
npx expo start --dev-client
```

Rebuild with `npx expo run:ios --device` or `npx expo run:android --device` whenever anything native changes (anything in `targets/`, `modules/`, `plugins/` or `app.config.ts`).

To build the staging variant (`app.replywise.staging` and `app.replywise.staging.keyboard`), prefix the commands with `APP_VARIANT=staging`. With EAS: `eas build --profile development --platform ios` (EAS asks for credentials for both the app and the keyboard extension).
