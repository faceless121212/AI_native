import {
  deleteDeviceKey,
  getAppGroupBool,
  getAppGroupJson,
  getDeviceKey,
  getStatus,
  hasRecentFullAccess,
  isSharedStorageSupported,
  KeyboardBridgeUnsupportedError,
  setAppGroupJson,
  setAppGroupString,
  setDeviceKey,
} from '../index';

type NativeMock = Record<string, jest.Mock | undefined>;

// The fake native module lives inside the factory: index.ts calls requireNativeModule while it is
// imported, which happens before any top-level const of this file is initialised.
jest.mock('expo', () => {
  const native: Record<string, unknown> = {};
  return { requireNativeModule: () => native, mockNative: native };
});

const { mockNative } = jest.requireMock<{ mockNative: NativeMock }>('expo');

const iosFunctions = [
  'getAppGroupBool',
  'setAppGroupBool',
  'getAppGroupString',
  'setAppGroupString',
  'getDeviceKey',
  'setDeviceKey',
  'deleteDeviceKey',
] as const;

function installIos() {
  mockNative.getStatus = jest.fn(() => ({ added: true, hasFullAccess: true, heartbeatAt: null }));
  for (const name of iosFunctions) mockNative[name] = jest.fn(() => null);
}

function installAndroidStub() {
  for (const key of Object.keys(mockNative)) delete mockNative[key];
  mockNative.getStatus = jest.fn(() => ({ added: false, hasFullAccess: false, heartbeatAt: null }));
}

beforeEach(installIos);

describe('getStatus', () => {
  it('passes the native status through', () => {
    expect(getStatus()).toEqual({ added: true, hasFullAccess: true, heartbeatAt: null });
  });
});

describe('hasRecentFullAccess', () => {
  const now = new Date('2026-11-03T10:15:00.000Z');
  const status = (hasFullAccess: boolean, heartbeatAt: string | null) => ({
    added: heartbeatAt !== null,
    hasFullAccess,
    heartbeatAt,
  });

  it('accepts a Full Access heartbeat from the last 10 minutes', () => {
    expect(hasRecentFullAccess(status(true, '2026-11-03T10:06:00.000Z'), now)).toBe(true);
  });

  it('treats an old heartbeat as not confirmed (Full Access may have been turned off)', () => {
    expect(hasRecentFullAccess(status(true, '2026-11-03T10:04:59.000Z'), now)).toBe(false);
  });

  it('is false without Full Access, without a heartbeat or with a bad timestamp', () => {
    expect(hasRecentFullAccess(status(false, '2026-11-03T10:14:00.000Z'), now)).toBe(false);
    expect(hasRecentFullAccess(status(true, null), now)).toBe(false);
    expect(hasRecentFullAccess(status(true, 'yesterday'), now)).toBe(false);
  });

  it('honours a custom window and rejects heartbeats far in the future', () => {
    expect(hasRecentFullAccess(status(true, '2026-11-03T10:14:00.000Z'), now, 30_000)).toBe(false);
    expect(hasRecentFullAccess(status(true, '2026-11-03T11:15:00.000Z'), now)).toBe(false);
  });
});

describe('App Group JSON values', () => {
  it('stores JSON as a string and removes the key for null', () => {
    setAppGroupJson('v1.lastChips', { tone: 'warm' });
    expect(mockNative.setAppGroupString).toHaveBeenLastCalledWith(
      'v1.lastChips',
      '{"tone":"warm"}',
    );
    setAppGroupJson('v1.lastChips', null);
    expect(mockNative.setAppGroupString).toHaveBeenLastCalledWith('v1.lastChips', null);
  });

  it('parses stored JSON and returns null for missing or broken values', () => {
    mockNative.getAppGroupString = jest.fn(() => '{"plan":"free","leftToday":3}');
    expect(getAppGroupJson('v1.quota')).toEqual({ plan: 'free', leftToday: 3 });
    mockNative.getAppGroupString = jest.fn(() => '{broken');
    expect(getAppGroupJson('v1.quota')).toBeNull();
    mockNative.getAppGroupString = jest.fn(() => null);
    expect(getAppGroupJson('v1.quota')).toBeNull();
  });

  it('passes plain strings and booleans through', () => {
    setAppGroupString('v1.uiLang', 'de');
    expect(mockNative.setAppGroupString).toHaveBeenLastCalledWith('v1.uiLang', 'de');
    mockNative.getAppGroupBool = jest.fn(() => true);
    expect(getAppGroupBool('v1.aiEnabled')).toBe(true);
  });
});

describe('device key', () => {
  it('reads, writes and deletes through the native module', () => {
    mockNative.getDeviceKey = jest.fn(() => 'k');
    expect(getDeviceKey()).toBe('k');
    setDeviceKey('abc');
    expect(mockNative.setDeviceKey).toHaveBeenCalledWith('abc');
    deleteDeviceKey();
    expect(mockNative.deleteDeviceKey).toHaveBeenCalled();
  });

  it('refuses an empty key', () => {
    expect(() => setDeviceKey('')).toThrow('must not be empty');
    expect(mockNative.setDeviceKey).not.toHaveBeenCalled();
  });
});

describe('platforms without shared storage yet (Android until Prompt 11)', () => {
  beforeEach(installAndroidStub);

  it('reports it and throws a clear error instead of failing silently', () => {
    expect(isSharedStorageSupported()).toBe(false);
    expect(() => setDeviceKey('abc')).toThrow(KeyboardBridgeUnsupportedError);
    expect(() => getAppGroupJson('v1.quota')).toThrow('KeyboardBridge.getAppGroupString');
  });

  it('is supported once the native functions exist', () => {
    installIos();
    expect(isSharedStorageSupported()).toBe(true);
  });
});
