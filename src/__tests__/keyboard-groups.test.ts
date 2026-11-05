// Ties the RUNTIME group rules in Swift (keyboard Core and keyboard-bridge) to the BUILD-TIME
// source of truth config/app-groups.js. If someone renames a group in config/app-groups.js, this
// fails until both Swift derivations follow.
import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import buildConfig from '../../app.config';
import { appGroupsFor } from '../../config/app-groups';
import {
  APP_GROUP_BOOL_KEYS,
  APP_GROUP_JSON_KEYS,
  APP_GROUP_STRING_KEYS,
} from '../../modules/keyboard-bridge/index';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config for apple-targets
const keyboardTarget = require('../../targets/keyboard/expo-target.config.js') as () => {
  bundleIdentifier: string;
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

const root = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const coreSwift = read('targets/keyboard/Core/SharedGroups.swift');
const bridgeSwift = read('modules/keyboard-bridge/ios/BridgeGroups.swift');
const contractSwift = read('targets/keyboard/Core/AppGroupContract.swift');

// index.ts imports the native module at load time.
jest.mock('expo', () => ({ requireNativeModule: () => ({}) }));

describe.each([undefined, 'staging'])('variant %s', (variant) => {
  const groups = appGroupsFor(variant);

  it('App Group is group.<app bundle ID>.shared', () => {
    expect(groups.appGroup).toBe(`group.${groups.bundleId}.shared`);
  });

  it('shared keychain group is $(AppIdentifierPrefix)<app bundle ID>.shared', () => {
    expect(groups.sharedKeychainGroup).toBe(`$(AppIdentifierPrefix)${groups.bundleId}.shared`);
  });

  it('keyboard target: the App Group and ONLY the shared keychain group', () => {
    const { entitlements } = withVariant(variant, () => keyboardTarget());
    expect(entitlements['com.apple.security.application-groups']).toEqual([groups.appGroup]);
    expect(entitlements['keychain-access-groups']).toEqual([groups.sharedKeychainGroup]);
  });

  it('app: the app-only keychain group FIRST (default for items saved without a group)', () => {
    const config = withVariant(variant, () => buildConfig({ config: {} } as never) as ExpoConfig);
    expect(config.ios?.entitlements?.['keychain-access-groups']).toEqual([
      groups.appKeychainGroup,
      groups.sharedKeychainGroup,
    ]);
    expect(config.ios?.entitlements?.['com.apple.security.application-groups']).toEqual([
      groups.appGroup,
    ]);
  });
});

it('the keyboard bundle ID is <app bundle ID>.keyboard', () => {
  expect(keyboardTarget().bundleIdentifier).toBe('.keyboard');
  expect(coreSwift).toContain('public static let extensionSuffix = ".keyboard"');
});

it.each([
  ['keyboard Core', coreSwift],
  ['keyboard-bridge', bridgeSwift],
])('%s derives the same names at runtime', (_name, source) => {
  expect(source).toContain('"group.\\(appID).shared"');
  expect(source).toContain('"\\(teamPrefix)\\(appID).shared"');
});

it('keyboard and bridge use the same device-key keychain item', () => {
  const value = (source: string, pattern: RegExp) => pattern.exec(source)?.[1];
  const coreService = value(coreSwift, /static let service = "([^"]+)"/);
  const coreAccount = value(coreSwift, /static let account = "([^"]+)"/);
  expect(coreService).toBeTruthy();
  expect(coreAccount).toBeTruthy();
  expect(value(bridgeSwift, /static let deviceKeyService = "([^"]+)"/)).toBe(coreService);
  expect(value(bridgeSwift, /static let deviceKeyAccount = "([^"]+)"/)).toBe(coreAccount);
});

it('the app Info.plist carries the team prefix for the bridge', () => {
  const config = buildConfig({ config: {} } as never) as ExpoConfig;
  expect(config.ios?.infoPlist?.AppIdentifierPrefix).toBe('$(AppIdentifierPrefix)');
  expect(bridgeSwift).toContain('static let infoPlistTeamPrefixKey = "AppIdentifierPrefix"');
});

describe('App Group keys are the same in index.ts, the keyboard and the bridge', () => {
  const tsBool = [...APP_GROUP_BOOL_KEYS].sort();
  const tsString = [...APP_GROUP_STRING_KEYS, ...APP_GROUP_JSON_KEYS].sort();

  it('keyboard Core (AppGroupContract.swift) lists exactly these keys', () => {
    const swiftKeys = [...contractSwift.matchAll(/case \w+ = "(v1\.[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(swiftKeys.sort()).toEqual([...tsBool, ...tsString].sort());
  });

  it('keyboard-bridge (BridgeAppGroup) types them the same way', () => {
    const set = (name: string) => {
      const body = new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`).exec(
        bridgeSwift,
      )?.[1];
      expect(body).toBeDefined();
      return [...(body ?? '').matchAll(/"(v1\.[A-Za-z]+)"/g)].map((m) => m[1]).sort();
    };
    expect(set('boolKeys')).toEqual(tsBool);
    expect(set('stringKeys')).toEqual(tsString);
  });
});
