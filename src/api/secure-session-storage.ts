import * as SecureStore from 'expo-secure-store';

// Supabase session storage backed by the OS keychain / keystore (expo-secure-store).
// A session (access + refresh token + user) is a few KB, and SecureStore warns above ~2 KB per
// value on Android, so values are split into chunks. On iOS no keychainAccessGroup is passed, so
// items go to the FIRST group in the app's keychain-access-groups entitlement, which app.config.ts
// keeps as the app-only group. The keyboard extension only has the shared group, so it never
// sees the Supabase session (architecture §4). Checked by src/__tests__/app-config.test.ts.
//
// Crash safety: each write goes to a new "generation" of chunk keys. The pointer
// (`<key>.chunks` = "<generation>:<count>") is switched only after every new chunk exists, and
// the old generation is deleted last. A crash at any point leaves either the old or the new
// value fully readable, never a mix and never nothing (losing the session would silently create
// a new anonymous account and lose the user's consent and credits).

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

type Pointer = { generation: number; count: number };

function parsePointer(raw: string | null): Pointer | null {
  const match = raw ? /^(\d+):(\d+)$/.exec(raw) : null;
  return match ? { generation: Number(match[1]), count: Number(match[2]) } : null;
}

export function createChunkedStorage(store: KeyValueStore = SecureStore) {
  const pointerKey = (key: string) => `${safeKey(key)}.chunks`;
  const chunkKey = (key: string, generation: number, i: number) =>
    `${safeKey(key)}.${generation}.${i}`;

  const readPointer = async (key: string) =>
    parsePointer(await store.getItemAsync(pointerKey(key)));

  const deleteGeneration = (key: string, p: Pointer) =>
    Promise.all(
      Array.from({ length: p.count }, (_, i) =>
        store.deleteItemAsync(chunkKey(key, p.generation, i)),
      ),
    );

  return {
    async getItem(key: string): Promise<string | null> {
      const p = await readPointer(key);
      if (!p) return null;
      const chunks = await Promise.all(
        Array.from({ length: p.count }, (_, i) =>
          store.getItemAsync(chunkKey(key, p.generation, i)),
        ),
      );
      if (chunks.some((c) => c === null)) return null;
      return chunks.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      const previous = await readPointer(key);
      const next: Pointer = {
        generation: previous ? previous.generation + 1 : 0,
        count: 0,
      };
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
      next.count = chunks.length;
      await Promise.all(
        chunks.map((chunk, i) => store.setItemAsync(chunkKey(key, next.generation, i), chunk)),
      );
      await store.setItemAsync(pointerKey(key), `${next.generation}:${next.count}`);
      if (previous) await deleteGeneration(key, previous);
    },

    async removeItem(key: string): Promise<void> {
      const p = await readPointer(key);
      await store.deleteItemAsync(pointerKey(key));
      if (p) await deleteGeneration(key, p);
    },
  };
}
