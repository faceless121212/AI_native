import { createChunkedStorage, type KeyValueStore, safeKey } from '../secure-session-storage';

function memoryStore() {
  const map = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
  return { map, store };
}

/** A store that "dies" (throws) on the nth write. */
function dyingAfter(base: KeyValueStore, writes: number): KeyValueStore {
  let n = 0;
  return {
    ...base,
    setItemAsync: async (k, v) => {
      n += 1;
      if (n > writes) throw new Error('killed');
      await base.setItemAsync(k, v);
    },
  };
}

describe('createChunkedStorage', () => {
  it('round-trips a value larger than one chunk', async () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store);
    const session = JSON.stringify({ access_token: 'a'.repeat(5000), user: { id: 'u' } });
    await storage.setItem('sb-local-auth-token', session);
    expect(await storage.getItem('sb-local-auth-token')).toBe(session);
  });

  it('leaves no stale chunks after replacing or removing a value', async () => {
    const { map, store } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'x'.repeat(4000));
    await storage.setItem('k', 'short');
    expect([...map.keys()].sort()).toEqual(['k.1.0', 'k.chunks']);
    expect(await storage.getItem('k')).toBe('short');
    await storage.removeItem('k');
    expect(map.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it.each([0, 1, 2, 3])(
    'keeps the old session intact if the app dies after %i writes of a new one',
    async (writes) => {
      const { store } = memoryStore();
      const old = JSON.stringify({ token: 'o'.repeat(4000) });
      await createChunkedStorage(store).setItem('k', old);
      const next = JSON.stringify({ token: 'n'.repeat(4000) });
      await expect(
        createChunkedStorage(dyingAfter(store, writes)).setItem('k', next),
      ).rejects.toThrow('killed');
      // 3 chunks are written before the pointer, so the old value must still be complete.
      expect(await createChunkedStorage(store).getItem('k')).toBe(old);
    },
  );

  it('switches to the new value once the pointer is written', async () => {
    const { store } = memoryStore();
    await createChunkedStorage(store).setItem('k', 'old');
    const next = 'n'.repeat(4000); // 3 chunks + 1 pointer write
    // Dies while deleting the old generation is fine: deletes don't go through setItemAsync.
    await createChunkedStorage(dyingAfter(store, 4)).setItem('k', next);
    expect(await createChunkedStorage(store).getItem('k')).toBe(next);
  });

  it('treats a value with a missing chunk as absent', async () => {
    const { map, store } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'y'.repeat(4000));
    map.delete('k.0.1');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('only uses characters SecureStore allows in keys', () => {
    expect(safeKey('sb-abc:auth/token')).toBe('sb-abc_auth_token');
  });
});
