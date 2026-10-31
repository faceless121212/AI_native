// Supabase clients for Edge Functions. The service-role key exists only here, inside Edge
// Functions (CLAUDE.md rule 10); clients never see it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Service-role client: bypasses RLS. Use only for the user's own rows, by explicit user ID. */
export function createServiceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: NO_SESSION });
}

/** Client acting as the caller (RLS applies), from their access token. */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
