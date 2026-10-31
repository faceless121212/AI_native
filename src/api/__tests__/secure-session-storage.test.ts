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

describe('createChunkedStorage', () => {
  it('round-trips a value larger than one chunk', async () => {
    const { map, store } = memoryStore();
    const storage = createChunkedStorage(store);
    const session = JSON.stringify({ access_token: 'a'.repeat(5000), user: { id: 'u' } });
    await storage.setItem('sb-local-auth-token', session);
    expect(await storage.getItem('sb-local-auth-token')).toBe(session);
    expect(map.get('sb-local-auth-token.chunks')).toBe('3');
  });

  it('removes every chunk, also when a shorter value replaces a longer one', async () => {
    const { map, store } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'x'.repeat(4000));
    await storage.setItem('k', 'short');
    expect([...map.keys()].sort()).toEqual(['k.0', 'k.chunks']);
    await storage.removeItem('k');
    expect(map.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('treats a half-written value as missing', async () => {
    const { map, store } = memoryStore();
    const storage = createChunkedStorage(store);
    await storage.setItem('k', 'y'.repeat(4000));
    map.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('only uses characters SecureStore allows in keys', () => {
    expect(safeKey('sb-abc:auth/token')).toBe('sb-abc_auth_token');
  });
});
