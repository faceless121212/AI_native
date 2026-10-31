import { fetchProfile, PROFILE_COLUMNS } from '../api/profile';

const row = {
  id: '6f1c2b8e-7c55-4d7e-9a7e-1f6f3c2d4b10',
  ui_lang: 'de',
  i_am: null,
  they_are: null,
  age_confirmed_at: null,
  timezone: 'Europe/Berlin',
  created_at: '2026-10-31T20:00:00Z',
};

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...a: unknown[]) => (calls.push(['select', ...a]), builder),
    eq: (...a: unknown[]) => (calls.push(['eq', ...a]), builder),
    single: async () => result,
  };
  return { calls, client: { from: (...a: unknown[]) => (calls.push(['from', ...a]), builder) } };
}

describe('fetchProfile', () => {
  it('reads only the signed-in user’s row and validates it', async () => {
    const { calls, client } = fakeClient({ data: row, error: null });
    await expect(fetchProfile(client as never, row.id)).resolves.toEqual(row);
    expect(calls).toEqual([
      ['from', 'profiles'],
      ['select', PROFILE_COLUMNS],
      ['eq', 'id', row.id],
    ]);
  });

  it('throws on a database error', async () => {
    const { client } = fakeClient({ data: null, error: new Error('JWT expired') });
    await expect(fetchProfile(client as never, row.id)).rejects.toThrow('JWT expired');
  });

  it('rejects rows that do not match the schema', async () => {
    const { client } = fakeClient({ data: { ...row, id: 'not-a-uuid' }, error: null });
    await expect(fetchProfile(client as never, row.id)).rejects.toThrow();
  });
});
