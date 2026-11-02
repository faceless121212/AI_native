import type { ExpoConfig } from 'expo/config';

import buildConfig from '../../app.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config for apple-targets
const keyboardTarget = require('../../targets/keyboard/expo-target.config.js') as () => {
  entitlements: Record<string, string[]>;
};

function withVariant<T>(variant: string | undefined, fn: () => T): T {
  const previous = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant;
  else delete process.env.APP_VARIANT;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

const appConfig = (variant?: string): ExpoConfig =>
  withVariant(variant, () => buildConfig({ config: {} } as never));

describe.each([
  [undefined, 'app.replywise', 'group.app.replywise.shared', 'app.replywise.shared'],
  [
    'staging',
    'app.replywise.staging',
    'group.app.replywise.staging.shared',
    'app.replywise.staging.shared',
  ],
])('variant %s', (variant, bundleId, appGroup, sharedGroup) => {
  it('lists the app-only keychain group first, then the shared group', () => {
    // iOS saves items without an explicit group (the Supabase session) in the FIRST group.
    expect(appConfig(variant).ios?.entitlements?.['keychain-access-groups']).toEqual([
      `$(AppIdentifierPrefix)${bundleId}`,
      `$(AppIdentifierPrefix)${sharedGroup}`,
    ]);
  });

  it('uses its own App Group, shared by app and keyboard', () => {
    expect(appConfig(variant).ios?.entitlements?.['com.apple.security.application-groups']).toEqual(
      [appGroup],
    );
    const keyboard = withVariant(variant, () => keyboardTarget());
    expect(keyboard.entitlements['com.apple.security.application-groups']).toEqual([appGroup]);
  });

  it('gives the keyboard only the shared keychain group, never the app-only one', () => {
    const keyboard = withVariant(variant, () => keyboardTarget());
    expect(keyboard.entitlements['keychain-access-groups']).toEqual([
      `$(AppIdentifierPrefix)${sharedGroup}`,
    ]);
  });
});

it('staging and production never share a group', () => {
  const prod = appConfig();
  const staging = appConfig('staging');
  const groups = (c: ExpoConfig) => [
    ...(c.ios?.entitlements?.['com.apple.security.application-groups'] as string[]),
    ...(c.ios?.entitlements?.['keychain-access-groups'] as string[]),
  ];
  expect(groups(prod).filter((g) => groups(staging).includes(g))).toEqual([]);
});
