// End-to-end over the local Supabase stack: real GoTrue anonymous sign-in, real SQL functions,
// the real handlers. Opt-in (needs `supabase start`):
//   eval "$(supabase status -o env)" && SUPABASE_INTEGRATION=1 SUPABASE_URL=$API_URL \
//     SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_ANON_KEY=$ANON_KEY \
//     deno test --no-lock --config supabase/functions/deno.json --allow-env --allow-net=127.0.0.1 supabase/functions
import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { authenticate } from './auth.ts';
import { createServiceClient } from './db.ts';
import { hashDeviceKey } from './device-key.ts';
import { withErrors } from './http.ts';
import { HttpError } from './errors.ts';
import { CURRENT_AI_POLICY_VERSION } from './policy.ts';
import { SupabaseRepo, supabaseAuthDeps } from './repo-supabase.ts';
import {
  ConsentResponse,
  DeviceKeyCreateResponse,
  DeviceKeyRevokeResponse,
  ProfileResponse,
} from './schemas.ts';
import { bearer, device, jsonRequest } from './testing/helpers.ts';
import { handleConsent } from '../consent/handler.ts';
import { handleDeviceKey } from '../device-key/handler.ts';
import { handleProfile } from '../profile/handler.ts';

const enabled = Deno.env.get('SUPABASE_INTEGRATION') === '1';

async function anonymousSignIn(): Promise<{ token: string; userId: string }> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  return { token: body.access_token, userId: body.user.id };
}

Deno.test({
  name: 'integration: sign-in → profile → consent → device key → withdraw',
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = createServiceClient();
    const auth = supabaseAuthDeps(db);
    const repo = new SupabaseRepo(db);
    const profile = withErrors('profile', (r) => handleProfile(r, { auth, repo }));
    const consent = withErrors('consent', (r) => handleConsent(r, { auth, repo }));
    const deviceKey = withErrors('device-key', (r) => handleDeviceKey(r, { auth, repo }));
    const { token, userId } = await anonymousSignIn();

    // Trigger created the profile.
    let res = await profile(new Request('http://localhost/', { headers: bearer(token) }));
    let p = ProfileResponse.parse(await res.json());
    assertEquals([p.id, p.aiEnabled, p.ageConfirmedAt], [userId, false, null]);

    // No key and no consent before age confirmation.
    res = await deviceKey(jsonRequest('POST', { platform: 'ios' }, bearer(token)));
    assertEquals([res.status, (await res.json()).error], [403, 'age_required']);
    res = await consent(
      jsonRequest(
        'POST',
        { action: 'grant', policyVersion: CURRENT_AI_POLICY_VERSION },
        bearer(token),
      ),
    );
    assertEquals([res.status, (await res.json()).error], [403, 'age_required']);

    res = await profile(
      jsonRequest(
        'PATCH',
        { ageConfirmed: true, uiLang: 'de', timezone: 'europe/berlin' },
        bearer(token),
      ),
    );
    p = ProfileResponse.parse(await res.json());
    assertMatch(p.ageConfirmedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assertEquals([p.uiLang, p.timezone], ['de', 'Europe/Berlin']);
    res = await profile(jsonRequest('PATCH', { timezone: 'Europe/Atlantis' }, bearer(token)));
    assertEquals(res.status, 400);
    // The database itself refuses a non-canonical name: 23514 → 400, not 500.
    const dbErr = await repo.patchProfile(userId, { timezone: 'europe/berlin' }).catch((e) => e);
    assertEquals(dbErr instanceof HttpError && [dbErr.status, dbErr.code], [400, 'bad_request']);

    // Unknown policy version: refused before the database.
    res = await consent(
      jsonRequest('POST', { action: 'grant', policyVersion: 'v1' }, bearer(token)),
    );
    assertEquals([res.status, (await res.json()).error], [400, 'unknown_policy_version']);

    res = await deviceKey(jsonRequest('POST', { platform: 'ios' }, bearer(token)));
    assertEquals([res.status, (await res.json()).error], [403, 'ai_off']);

    // Grant twice: starter credits once.
    const grants = await Promise.all(
      [1, 2, 3].map(async () =>
        ConsentResponse.parse(
          await (
            await consent(
              jsonRequest(
                'POST',
                { action: 'grant', policyVersion: CURRENT_AI_POLICY_VERSION },
                bearer(token),
              ),
            )
          ).json(),
        ),
      ),
    );
    assertEquals(grants.filter((g) => g.action === 'grant' && g.starterCreditsGranted).length, 1);
    const { data: credits } = await db
      .from('credit_ledger')
      .select('delta, reason')
      .eq('user_id', userId);
    assertEquals(credits, [{ delta: 10, reason: 'starter' }]);

    // A raised minimum turns AI off for this consent (same SQL gate as device keys and reply).
    const stricter = new SupabaseRepo(db, '2099-01-01');
    assertEquals((await stricter.getProfile(userId))?.aiEnabled, false);
    assertEquals((await stricter.createDeviceKey(userId, 'f'.repeat(64), 'ios')).status, 'ai_off');

    // Device key: stored as hash, authenticates, raw key not in the DB.
    res = await deviceKey(jsonRequest('POST', { platform: 'ios' }, bearer(token)));
    assertEquals(res.status, 201);
    const created = DeviceKeyCreateResponse.parse(await res.json());
    const { data: rows } = await db.from('device_keys').select('key_hash').eq('id', created.keyId);
    assertEquals(rows, [{ key_hash: await hashDeviceKey(created.key) }]);
    const ctx = await authenticate(
      new Request('http://localhost/', { headers: device(created.key) }),
      auth,
      { allow: ['device'] },
    );
    assertEquals([ctx.userId, ctx.deviceKeyId], [userId, created.keyId]);

    // Withdraw → AI off, key revoked → 401.
    res = await consent(jsonRequest('POST', { action: 'withdraw' }, bearer(token)));
    const w = ConsentResponse.parse(await res.json());
    assertEquals(w.action === 'withdraw' && w.revokedDeviceKeys, 1);
    const err = await authenticate(
      new Request('http://localhost/', { headers: device(created.key) }),
      auth,
      { allow: ['device'] },
    ).catch((e) => e);
    assertEquals(err.status, 401);
    p = ProfileResponse.parse(
      await (await profile(new Request('http://localhost/', { headers: bearer(token) }))).json(),
    );
    assertEquals(p.aiEnabled, false);

    // Regrant: new key, then revoke all.
    await consent(
      jsonRequest(
        'POST',
        { action: 'grant', policyVersion: CURRENT_AI_POLICY_VERSION },
        bearer(token),
      ),
    );
    await deviceKey(jsonRequest('POST', { platform: 'android' }, bearer(token)));
    res = await deviceKey(jsonRequest('DELETE', { scope: 'all' }, bearer(token)));
    assertEquals(DeviceKeyRevokeResponse.parse(await res.json()).revoked, 1);

    await db.auth.admin.deleteUser(userId);
  },
});
