import { requireNativeModule } from 'expo';

/** What the app knows about the system keyboard (docs/architecture.md §5). */
export type KeyboardStatus = {
  /** The keyboard is added in system settings (iOS) / enabled as an input method (Android). */
  added: boolean;
  /** iOS: the last keyboard heartbeat reported Full Access. Android has no Full Access; its meaning there is defined with the real implementation. */
  hasFullAccess: boolean;
  /** ISO timestamp of the keyboard's last heartbeat, or null if it never opened. */
  heartbeatAt: string | null;
};

type KeyboardBridgeNativeModule = {
  getStatus(): KeyboardStatus;
};

const KeyboardBridge = requireNativeModule<KeyboardBridgeNativeModule>('KeyboardBridge');

/** Prompt 0 stub: always returns `{ added: false, hasFullAccess: false, heartbeatAt: null }`. */
export function getStatus(): KeyboardStatus {
  return KeyboardBridge.getStatus();
}
