import type { ConfigContext, ExpoConfig } from 'expo/config';

import { appGroupsFor } from './config/app-groups';

export default ({ config }: ConfigContext): ExpoConfig => {
  // APP_VARIANT picks the bundle ID, App Group and keychain groups (config/app-groups.js).
  // The keyboard extension follows with ".keyboard" (targets/keyboard/expo-target.config.js).
  const groups = appGroupsFor(process.env.APP_VARIANT);
  const variant = groups.variant;
  const isStaging = variant === 'staging';
  const BUNDLE_ID = groups.bundleId;
  const APP_GROUP = groups.appGroup;
  const KEYCHAIN_GROUP = groups.sharedKeychainGroup;
  const APP_KEYCHAIN_GROUP = groups.appKeychainGroup;

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
      infoPlist: {
        // Team prefix ("ABCDE12345.") for modules/keyboard-bridge, which writes the device key to
        // the shared keychain group $(AppIdentifierPrefix)<bundle ID>.shared at runtime. Xcode
        // expands it from the signing team; the bridge falls back to a keychain probe if empty.
        AppIdentifierPrefix: '$(AppIdentifierPrefix)',
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
