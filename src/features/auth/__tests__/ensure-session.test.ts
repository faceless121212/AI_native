import type { Session } from '@supabase/supabase-js';

import { ensureAnonymousSession } from '../ensure-session';

const session = { access_token: 't', user: { id: 'u1' } } as unknown as Session;

function fakeAuth(existing: Session | null, opts: { signInError?: Error } = {}) {
  return {
    getSession: jest.fn(async () => ({ data: { session: existing }, error: null })),
    signInAnonymously: jest.fn(async () =>
      opts.signInError
        ? { data: { session: null, user: null }, error: opts.signInError }
        : { data: { session, user: session.user }, error: null },
    ),
  };
}

describe('ensureAnonymousSession', () => {
  it('reuses a stored session and does not create another account', async () => {
    const auth = fakeAuth(session);
    await expect(ensureAnonymousSession(auth as never)).resolves.toBe(session);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously on first launch, with no personal data', async () => {
    const auth = fakeAuth(null);
    await expect(ensureAnonymousSession(auth as never)).resolves.toBe(session);
    expect(auth.signInAnonymously).toHaveBeenCalledWith();
  });

  it('throws when sign-in fails (e.g. offline) so the caller retries', async () => {
    const auth = fakeAuth(null, { signInError: new Error('Network request failed') });
    await expect(ensureAnonymousSession(auth as never)).rejects.toThrow('Network request failed');
  });
});
