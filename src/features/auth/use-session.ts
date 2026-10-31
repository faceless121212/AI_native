import { useQuery } from '@tanstack/react-query';

import { getSupabase } from '@/api/supabase';

import { ensureAnonymousSession } from './ensure-session';

export const sessionQueryKey = ['session'] as const;

/** The anonymous Supabase session, created silently on first launch and retried when offline. */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => ensureAnonymousSession(getSupabase().auth),
    staleTime: Infinity,
    retry: true,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });
}
