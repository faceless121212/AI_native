import { readSupabaseConfig } from '../config';

describe('readSupabaseConfig', () => {
  it('reads the public URL and anon key', () => {
    expect(
      readSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      }),
    ).toEqual({ url: 'http://127.0.0.1:54321', anonKey: 'anon' });
  });

  it('explains what to do when a value is missing', () => {
    expect(() => readSupabaseConfig({})).toThrow(/Copy \.env\.example to \.env/);
  });
});
