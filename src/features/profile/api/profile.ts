import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { Lang } from '@shared/schemas';

// Row of public.profiles as the user may read it (RLS: own row only). Column names follow
// docs/architecture.md §8 and supabase/migrations. "I am" / "They are" are not stored on the
// server (decided 2026-11-02): they live on the device and are sent with each reply request.
export const ProfileRowSchema = z.object({
  id: z.uuid(),
  ui_lang: Lang,
  age_confirmed_at: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
});
export type ProfileRow = z.infer<typeof ProfileRowSchema>;

export const PROFILE_COLUMNS = 'id, ui_lang, age_confirmed_at, timezone, created_at';

/** Reads the signed-in user's profile row (created by a trigger on sign-up). */
export async function fetchProfile(client: Pick<SupabaseClient, 'from'>, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) throw error;
  return ProfileRowSchema.parse(data);
}
