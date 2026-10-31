// iOS Keyboard Extension target for @bacons/apple-targets.
// See docs/architecture.md §3–5 and CLAUDE.md (App Group, keychain group, bundle IDs).

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'keyboard',
  // Xcode target / product name. Must differ from the main app target ("Replywise"),
  // otherwise both targets share a name and PRODUCT_MODULE_NAME.
  name: 'ReplywiseKeyboard',
  // What the user sees in Settings → General → Keyboard → Keyboards and in the globe menu.
  displayName: 'Replywise',
  // Leading dot: appended to the app's bundle ID, so production is app.replywise.keyboard
  // and APP_VARIANT=staging gives app.replywise.staging.keyboard.
  bundleIdentifier: '.keyboard',
  deploymentTarget: '16.0',
  // Set explicitly; never rely on the plugin syncing these from the main app.
  entitlements: {
    'com.apple.security.application-groups': ['group.app.replywise.shared'],
    'keychain-access-groups': ['$(AppIdentifierPrefix)app.replywise.shared'],
  },
  // Info.plist (NSExtension → NSExtensionAttributes: RequestsOpenAccess, PrimaryLanguage, …) is the
  // committed targets/keyboard/Info.plist. The plugin only writes a default Info.plist when the file
  // does not exist, so ours is kept.
});
