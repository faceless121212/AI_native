// Single source for the iOS App Group and shared keychain group per build variant.
// Used by app.config.ts (the app) and targets/keyboard/expo-target.config.js (the keyboard), so
// both targets always agree. Staging and production are fully separate (decided 2026-11-02):
// with both installed on one iPhone they never share settings or the keyboard's device key.
// CommonJS because the keyboard target config is loaded with require().

/** @param {string | undefined} appVariant process.env.APP_VARIANT */
function appGroupsFor(appVariant) {
  const staging = appVariant === 'staging';
  const suffix = staging ? '.staging' : '';
  const bundleId = `app.replywise${suffix}`;
  return {
    variant: staging ? 'staging' : 'production',
    bundleId,
    appGroup: `group.app.replywise${suffix}.shared`,
    // Shared with the keyboard extension: holds ONLY the keyboard's device key.
    sharedKeychainGroup: `$(AppIdentifierPrefix)app.replywise${suffix}.shared`,
    // App-only group, listed FIRST in the app's entitlements so items saved without an explicit
    // group (the Supabase session) never land in the shared group.
    appKeychainGroup: `$(AppIdentifierPrefix)${bundleId}`,
  };
}

module.exports = { appGroupsFor };
