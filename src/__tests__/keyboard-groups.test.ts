// Ties the RUNTIME group rules in Swift (keyboard Core and keyboard-bridge) to the BUILD-TIME
// source of truth config/app-groups.js. If someone renames a group in config/app-groups.js, this
// fails until both Swift derivations follow.
import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import buildConfig from '../../app.config';
import { appGroupsFor } from '../../config/app-groups';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config for apple-targets
const keyboardTarget = require('../../targets/keyboard/expo-target.config.js') as () => {
  bundleIdentifier: string;
};

const root = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const coreSwift = read('targets/keyboard/Core/SharedGroups.swift');
const bridgeSwift = read('modules/keyboard-bridge/ios/BridgeGroups.swift');

describe.each([undefined, 'staging'])('variant %s', (variant) => {
  const groups = appGroupsFor(variant);

  it('App Group is group.<app bundle ID>.shared', () => {
    expect(groups.appGroup).toBe(`group.${groups.bundleId}.shared`);
  });

  it('shared keychain group is $(AppIdentifierPrefix)<app bundle ID>.shared', () => {
    expect(groups.sharedKeychainGroup).toBe(`$(AppIdentifierPrefix)${groups.bundleId}.shared`);
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
