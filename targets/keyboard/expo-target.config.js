// iOS Keyboard Extension target for @bacons/apple-targets.
// See docs/architecture.md §3–5 and CLAUDE.md (App Group, keychain group, bundle IDs).

const { appGroupsFor } = require('../../config/app-groups');

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => {
  // Same variant switch as app.config.ts, so app and keyboard always share the same groups.
  const groups = appGroupsFor(process.env.APP_VARIANT);
  return {
    type: 'keyboard',
    // Xcode target / product name. Must differ from the main app target ("Replywise"),
    // otherwise both targets share a name and PRODUCT_MODULE_NAME.
    name: 'ReplywiseKeyboard',
    // What the user sees in Settings → General → Keyboard → Keyboards and in the globe menu.
    displayName: 'Replywise',
    // Leading dot: appended to the app's bundle ID, so production is app.replywise.keyboard
    // and APP_VARIANT=staging gives app.replywise.staging.keyboard.
    bundleIdentifier: '.keyboard',
    deploymentTarget: '16.4',
    // Set explicitly; never rely on the plugin syncing these from the main app.
    // The keyboard gets only the SHARED keychain group, never the app-only one.
    entitlements: {
      'com.apple.security.application-groups': [groups.appGroup],
      'keychain-access-groups': [groups.sharedKeychainGroup],
    },
    // Info.plist (NSExtension → NSExtensionAttributes: RequestsOpenAccess, PrimaryLanguage, …) is the
    // committed targets/keyboard/Info.plist. The plugin only writes a default Info.plist when the file
    // does not exist, so ours is kept.
  };
};
