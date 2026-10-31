import type { ExpoConfig } from 'expo/config';

import buildConfig from '../../app.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config for apple-targets
const keyboardTarget = require('../../targets/keyboard/expo-target.config.js') as () => {
  entitlements: Record<string, string[]>;
};

function config(variant?: string): ExpoConfig {
  const previous = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant;
  else delete process.env.APP_VARIANT;
  try {
    return buildConfig({ config: {} } as never);
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

describe('keychain groups', () => {
  it.each([
    [undefined, 'app.replywise'],
    ['staging', 'app.replywise.staging'],
  ])('lists the app-only group first for %s, then the shared group', (variant, bundleId) => {
    const groups = config(variant).ios?.entitlements?.['keychain-access-groups'];
    // iOS saves items without an explicit group (the Supabase session) in the FIRST group.
    expect(groups).toEqual([
      `$(AppIdentifierPrefix)${bundleId}`,
      '$(AppIdentifierPrefix)app.replywise.shared',
    ]);
  });

  it('gives the keyboard extension only the shared group, never the app-only one', () => {
    expect(keyboardTarget().entitlements['keychain-access-groups']).toEqual([
      '$(AppIdentifierPrefix)app.replywise.shared',
    ]);
  });
});
