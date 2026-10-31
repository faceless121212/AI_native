// SupabaseRepo against a fake client: argument mapping and error mapping, no network.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './errors.ts';
import { withErrors } from './http.ts';
import { DbError, SupabaseRepo } from './repo-supabase.ts';
import { captureConsole } from './testing/helpers.ts';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

function fakeClient(result: RpcResult) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const USER = '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b';

Deno.test('SupabaseRepo passes the minimum policy version to every gate function', async () => {
  const { client, calls } = fakeClient({ data: null, error: null });
  const repo = new SupabaseRepo(client, '2026-11-01');
  await repo.getProfile(USER);
  await repo.patchProfile(USER, { uiLang: 'de' });
  await repo.grantAiConsent(USER, '2026-11-01').catch(() => {});
  await repo.createDeviceKey(USER, 'a'.repeat(64), 'ios').catch(() => {});
  assertEquals(
    calls.map((c) => [c.fn, c.args.p_min_policy_version]),
    [
      ['profile_state', '2026-11-01'],
      ['patch_profile', '2026-11-01'],
      ['grant_ai_consent', '2026-11-01'],
      ['create_device_key', '2026-11-01'],
    ],
  );
});

Deno.test('patchProfile: SQLSTATE 23514 (check_violation) → 400 bad_request, not 500', async () => {
  const { client } = fakeClient({
    data: null,
    error: { code: '23514', message: 'unknown time zone "Europe/Atlantis"' },
  });
  const repo = new SupabaseRepo(client);
  const err = await assertRejects(
    () => repo.patchProfile(USER, { timezone: 'Europe/Atlantis' }),
    HttpError,
  );
  assertEquals([err.status, err.code], [400, 'bad_request']);
  assertEquals(err.message.includes('Atlantis'), false, 'database message is not echoed');
});

Deno.test('other database errors → DbError → 500, logged by code only', async () => {
  const { client } = fakeClient({
    data: null,
    error: { code: '23505', message: 'Key (key_hash)=(secret-hash) already exists.' },
  });
  const repo = new SupabaseRepo(client);
  await assertRejects(() => repo.createDeviceKey(USER, 'a'.repeat(64), 'ios'), DbError);
  const { result, lines } = await captureConsole(() =>
    withErrors('t', () =>
      repo.createDeviceKey(USER, 'a'.repeat(64), 'ios').then(() => new Response()),
    )(new Request('http://localhost/')),
  );
  assertEquals(result.status, 500);
  assertEquals(lines.length, 1);
  assertEquals(lines[0]!.includes('secret-hash'), false);
  assertEquals(lines[0]!.includes('23505'), true);
});
