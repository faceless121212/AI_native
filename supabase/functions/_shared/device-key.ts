// Device keys for the keyboards (architecture §4, §12): 32 random bytes, base64url without
// padding, and only the SHA-256 hex digest of the key string is ever stored.

export const DEVICE_KEY_BYTES = 32;
export const DEVICE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const padded = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function generateDeviceKey(): string {
  const bytes = new Uint8Array(DEVICE_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function isDeviceKeyFormat(key: string): boolean {
  return DEVICE_KEY_PATTERN.test(key) && base64UrlDecode(key).byteLength === DEVICE_KEY_BYTES;
}

/** SHA-256 over the UTF-8 bytes of the key string, as 64 lowercase hex chars. */
export async function hashDeviceKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
