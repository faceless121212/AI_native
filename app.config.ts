import type { ConfigContext, ExpoConfig } from 'expo/config';

// APP_VARIANT picks the bundle ID: "staging" → app.replywise.staging, anything else → app.replywise.
// The keyboard extension follows with ".keyboard" (targets/keyboard/expo-target.config.js).
const variant = process.env.APP_VARIANT === 'staging' ? 'staging' : 'production';
const isStaging = variant === 'staging';

const BUNDLE_ID = isStaging ? 'app.replywise.staging' : 'app.replywise';
const APP_GROUP = 'group.app.replywise.shared';
const KEYCHAIN_GROUP = '$(AppIdentifierPrefix)app.replywise.shared';

export default ({ config }: ConfigContext): ExpoConfig => ({
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
    supportsTablet: false,
    deploymentTarget: '16.0',
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP],
      'keychain-access-groups': [KEYCHAIN_GROUP],
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
  plugins: ['expo-router', 'expo-dev-client', '@bacons/apple-targets'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: variant,
    appGroup: APP_GROUP,
  },
});
