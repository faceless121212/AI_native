import type { Session, SupabaseClient } from '@supabase/supabase-js';

type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'signInAnonymously'>;

/**
 * Returns the stored session, or signs in anonymously on first launch (spec §2 screen 1:
 * "Anonymous account created silently"). No email, phone or name is ever sent.
 * Throws when offline so the caller can retry; typing and the rest of the app don't wait on it.
 */
export async function ensureAnonymousSession(auth: AuthClient): Promise<Session> {
  const existing = await auth.getSession();
  if (existing.error) throw existing.error;
  if (existing.data.session) return existing.data.session;

  const created = await auth.signInAnonymously();
  if (created.error) throw created.error;
  if (!created.data.session) throw new Error('Anonymous sign-in returned no session');
  return created.data.session;
}
