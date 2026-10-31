import * as SecureStore from 'expo-secure-store';

// Supabase session storage backed by the OS keychain / keystore (expo-secure-store).
// A session (access + refresh token + user) is a few KB, and SecureStore warns above ~2 KB per
// value on Android, so values are split into chunks. This is the app's own keychain, NOT the
// shared keychain group: the keyboard never sees the Supabase session (architecture §4).

const CHUNK_SIZE = 1800;

export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(store: KeyValueStore = SecureStore) {
  const countKey = (key: string) => `${safeKey(key)}.chunks`;
  const chunkKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeItem(key: string): Promise<void> {
    const count = Number((await store.getItemAsync(countKey(key))) ?? '0');
    await Promise.all(
      Array.from({ length: count }, (_, i) => store.deleteItemAsync(chunkKey(key, i))),
    );
    await store.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const raw = await store.getItemAsync(countKey(key));
      if (raw === null) return null;
      const count = Number(raw);
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, i) => store.getItemAsync(chunkKey(key, i))),
      );
      // A missing chunk means a half-written value: treat the session as absent.
      if (chunks.some((c) => c === null)) return null;
      return chunks.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      await removeItem(key);
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
      await Promise.all(chunks.map((chunk, i) => store.setItemAsync(chunkKey(key, i), chunk)));
      // Written last, so a crash mid-write leaves no readable half value.
      await store.setItemAsync(countKey(key), String(chunks.length));
    },

    removeItem,
  };
}
