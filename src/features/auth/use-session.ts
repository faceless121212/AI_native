import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { getSupabase } from '@/api/supabase';

import { ensureAnonymousSession } from './ensure-session';

export const sessionQueryKey = ['session'] as const;

/**
 * Keeps the cached session in step with supabase-js: refreshed tokens replace it, and a sign-out
 * (revoked refresh token, Delete my data) drops it so a new anonymous session is created.
 * Code that calls the API should still read the JWT from auth.getSession() at call time.
 */
export function syncSessionCache(
  auth: Pick<SupabaseClient['auth'], 'onAuthStateChange'>,
  queryClient: QueryClient,
) {
  const { data } = auth.onAuthStateChange((event, session) => {
    if (session) queryClient.setQueryData(sessionQueryKey, session);
    else if (event === 'SIGNED_OUT')
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  });
  return () => data.subscription.unsubscribe();
}

/** The anonymous Supabase session, created silently on first launch and retried when offline. */
export function useSession() {
  const queryClient = useQueryClient();
  useEffect(() => syncSessionCache(getSupabase().auth, queryClient), [queryClient]);
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => ensureAnonymousSession(getSupabase().auth),
    staleTime: Infinity,
    retry: true,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
  });
}
