// Public client config from EXPO_PUBLIC_* variables (.env, see .env.example). These values are
// public by design: the anon key only works within Row Level Security.

export type SupabaseConfig = { url: string; anonKey: string };

export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in (local: `supabase status`).',
    );
  }
  return { url, anonKey };
}
