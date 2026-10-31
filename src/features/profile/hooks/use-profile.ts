import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/api/supabase';
import { useSession } from '@/features/auth/use-session';

import { fetchProfile } from '../api/profile';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function useProfile() {
  const session = useSession();
  const userId = session.data?.user.id;
  return useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(getSupabase(), userId as string),
    enabled: Boolean(userId),
  });
}
