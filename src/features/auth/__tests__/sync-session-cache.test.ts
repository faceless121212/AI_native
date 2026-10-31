import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';

import { sessionQueryKey, syncSessionCache } from '../use-session';

function fakeAuth() {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  const unsubscribe = jest.fn();
  return {
    emit: (event: AuthChangeEvent, session: Session | null) => listener?.(event, session),
    unsubscribe,
    auth: {
      onAuthStateChange: (cb: typeof listener) => {
        listener = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  };
}

const session = (token: string) =>
  ({ access_token: token, user: { id: 'u1' } }) as unknown as Session;

describe('syncSessionCache', () => {
  it('replaces the cached session after a token refresh', () => {
    const qc = new QueryClient();
    const f = fakeAuth();
    syncSessionCache(f.auth as never, qc);
    qc.setQueryData(sessionQueryKey, session('old'));
    f.emit('TOKEN_REFRESHED', session('new'));
    expect(qc.getQueryData<Session>(sessionQueryKey)?.access_token).toBe('new');
  });

  it('invalidates the cache on sign-out so a new anonymous session is created', () => {
    const qc = new QueryClient();
    const f = fakeAuth();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    syncSessionCache(f.auth as never, qc);
    f.emit('SIGNED_OUT', null);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionQueryKey });
  });

  it('unsubscribes on cleanup', () => {
    const f = fakeAuth();
    const stop = syncSessionCache(f.auth as never, new QueryClient());
    stop();
    expect(f.unsubscribe).toHaveBeenCalled();
  });
});
