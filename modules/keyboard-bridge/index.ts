import { requireNativeModule } from 'expo';

/** What the app knows about the system keyboard (docs/architecture.md §5). */
export type KeyboardStatus = {
  /**
   * iOS: the keyboard has written a heartbeat, i.e. it was opened at least once WITH Full Access.
   * iOS has no public API to list enabled keyboards, so before Full Access is on this stays false
   * even when the keyboard is added. Android: defined with the IME (Prompt 11).
   */
  added: boolean;
  /**
   * iOS: the LAST heartbeat reported Full Access. It can be stale: with Full Access turned off the
   * keyboard can no longer write, so check `heartbeatAt` (see `hasRecentFullAccess`).
   */
  hasFullAccess: boolean;
  /** ISO timestamp of the keyboard's last heartbeat, or null if it never wrote one. */
  heartbeatAt: string | null;
};

/** App Group keys by storage type (docs/architecture.md §5, targets/keyboard/Core/AppGroupContract.swift). */
export const APP_GROUP_BOOL_KEYS = ['v1.aiEnabled'] as const;
export const APP_GROUP_STRING_KEYS = ['v1.uiLang', 'v1.trialEndsAt'] as const;
export const APP_GROUP_JSON_KEYS = [
  'v1.defaults',
  'v1.lastChips',
  'v1.quota',
  'v1.providerDown',
  'v1.keyboardHeartbeat',
] as const;

export type AppGroupBoolKey = (typeof APP_GROUP_BOOL_KEYS)[number];
export type AppGroupStringKey = (typeof APP_GROUP_STRING_KEYS)[number];
export type AppGroupJsonKey = (typeof APP_GROUP_JSON_KEYS)[number];

type KeyboardBridgeNativeModule = {
  getStatus(): KeyboardStatus;
  // iOS only so far; the Android module adds them with the IME (Prompt 11).
  getAppGroupBool?(key: string): boolean | null;
  setAppGroupBool?(key: string, value: boolean | null): void;
  getAppGroupString?(key: string): string | null;
  setAppGroupString?(key: string, value: string | null): void;
  getDeviceKey?(): string | null;
  setDeviceKey?(key: string): void;
  deleteDeviceKey?(): void;
};

const KeyboardBridge = requireNativeModule<KeyboardBridgeNativeModule>('KeyboardBridge');

/** Thrown when this platform's native module doesn't have the function yet. */
export class KeyboardBridgeUnsupportedError extends Error {
  constructor(name: string) {
    super(`KeyboardBridge.${name} is not available on this platform yet`);
    this.name = 'KeyboardBridgeUnsupportedError';
  }
}

type OptionalNativeName = Exclude<keyof KeyboardBridgeNativeModule, 'getStatus'>;
type NativeFn<K extends OptionalNativeName> = NonNullable<KeyboardBridgeNativeModule[K]>;

/** Calls an optional native function, or throws KeyboardBridgeUnsupportedError if it's missing. */
function call<K extends OptionalNativeName>(
  name: K,
  ...args: Parameters<NativeFn<K>>
): ReturnType<NativeFn<K>> {
  const fn: unknown = KeyboardBridge[name];
  if (typeof fn !== 'function') throw new KeyboardBridgeUnsupportedError(name);
  return (fn as (...a: unknown[]) => ReturnType<NativeFn<K>>).apply(KeyboardBridge, args);
}

/** Whether App Group and device-key functions exist on this platform. */
export function isSharedStorageSupported(): boolean {
  return (
    typeof KeyboardBridge.getAppGroupString === 'function' &&
    typeof KeyboardBridge.setDeviceKey === 'function'
  );
}

export function getStatus(): KeyboardStatus {
  return KeyboardBridge.getStatus();
}

/** Default freshness window: the guide treats an older heartbeat as "Full Access not confirmed". */
export const FULL_ACCESS_HEARTBEAT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * True when the keyboard reported Full Access recently (docs/architecture.md §5: no heartbeat with
 * hasFullAccess=true in the last 10 minutes after the guide means not granted).
 */
export function hasRecentFullAccess(
  status: KeyboardStatus,
  now: Date,
  maxAgeMs: number = FULL_ACCESS_HEARTBEAT_MAX_AGE_MS,
): boolean {
  if (!status.hasFullAccess || !status.heartbeatAt) return false;
  const at = Date.parse(status.heartbeatAt);
  if (Number.isNaN(at)) return false;
  const age = now.getTime() - at;
  // A heartbeat slightly in the future (clock skew between processes is ~0) still counts.
  return age <= maxAgeMs && age >= -60_000;
}

export function getAppGroupBool(key: AppGroupBoolKey): boolean | null {
  return call('getAppGroupBool', key) ?? null;
}

/** `null` removes the key. */
export function setAppGroupBool(key: AppGroupBoolKey, value: boolean | null): void {
  call('setAppGroupBool', key, value);
}

export function getAppGroupString(key: AppGroupStringKey): string | null {
  return call('getAppGroupString', key) ?? null;
}

/** `null` removes the key. */
export function setAppGroupString(key: AppGroupStringKey, value: string | null): void {
  call('setAppGroupString', key, value);
}

/** Parsed JSON value, or null when the key is missing or holds invalid JSON. Validate with zod. */
export function getAppGroupJson(key: AppGroupJsonKey): unknown {
  const raw = call('getAppGroupString', key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Stores `value` as a JSON string; `null` or `undefined` removes the key. */
export function setAppGroupJson(key: AppGroupJsonKey, value: unknown): void {
  call('setAppGroupString', key, value == null ? null : JSON.stringify(value));
}

/** The keyboard's device key from the shared keychain group, or null. Never log it. */
export function getDeviceKey(): string | null {
  return call('getDeviceKey') ?? null;
}

export function setDeviceKey(key: string): void {
  if (key.length === 0) throw new Error('Device key must not be empty');
  call('setDeviceKey', key);
}

export function deleteDeviceKey(): void {
  call('deleteDeviceKey');
}
