import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_GROUP = 'group.app.replywise.shared';
// Shared with the keyboard extension: holds ONLY the keyboard's device key (architecture §4).
const KEYCHAIN_GROUP = '$(AppIdentifierPrefix)app.replywise.shared';

export default ({ config }: ConfigContext): ExpoConfig => {
  // APP_VARIANT picks the bundle ID: "staging" → app.replywise.staging, else app.replywise.
  // The keyboard extension follows with ".keyboard" (targets/keyboard/expo-target.config.js).
  const variant = process.env.APP_VARIANT === 'staging' ? 'staging' : 'production';
  const isStaging = variant === 'staging';
  const BUNDLE_ID = isStaging ? 'app.replywise.staging' : 'app.replywise';
  // App-only group, listed FIRST: iOS stores keychain items without an explicit access group in
  // the first group of this list, so the Supabase session stays out of the shared group.
  const APP_KEYCHAIN_GROUP = `$(AppIdentifierPrefix)${BUNDLE_ID}`;

  return {
    ...config,
    name: isStaging ? 'Replywise Staging' : 'Replywise',
    slug: 'replywise',
    scheme: 'replywise',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: BUNDLE_ID,
      // Signing team for the app AND the keyboard extension (apple-targets reads it for both).
      // Set APPLE_TEAM_ID in .env; without it `expo prebuild --clean` drops the team every time.
      appleTeamId: process.env.APPLE_TEAM_ID,
      supportsTablet: false,
      deploymentTarget: '16.0',
      entitlements: {
        'com.apple.security.application-groups': [APP_GROUP],
        'keychain-access-groups': [APP_KEYCHAIN_GROUP, KEYCHAIN_GROUP],
      },
    },
    android: {
      package: BUNDLE_ID,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      'expo-dev-client',
      // Must stay BEFORE @bacons/apple-targets: Expo runs mods in reverse registration order, and this
      // plugin patches the Xcode group apple-targets creates (see the plugin's header comment).
      './plugins/with-keyboard-target-exclusions',
      '@bacons/apple-targets',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      keychainGroups: { app: APP_KEYCHAIN_GROUP, shared: KEYCHAIN_GROUP },
      // Set EAS_PROJECT_ID after `eas init` (eas.json uses appVersionSource "remote").
      eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
      appVariant: variant,
      appGroup: APP_GROUP,
    },
  };
};
