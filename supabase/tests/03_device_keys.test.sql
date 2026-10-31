-- device_keys: no client access, creation gated on age + consent, rotation, hash format,
-- lookup for auth, revocation is final and scoped to the owner.
begin;
\ir _helpers.psql
select plan(24);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

-- Gate
select tests.as_service();
select is(public.create_device_key(:'user_a_a', tests.fake_hash('a1'), 'ios') ->> 'status', 'age_required',
  'no key without age confirmation');
select public.patch_profile(:'user_a_a', p_age_confirmed => true) is not null as ok \gset
select is(public.create_device_key(:'user_a_a', tests.fake_hash('a1'), 'ios') ->> 'status', 'ai_off',
  'no key without AI consent');
select public.grant_ai_consent(:'user_a_a', 'v1') ->> 'status' as g \gset
select public.create_device_key(:'user_a_a', tests.fake_hash('a1'), 'ios') as k1 \gset
select is(:'k1'::jsonb ->> 'status', 'ok', 'key created after age + consent');
select is((:'k1'::jsonb ->> 'rotated')::int, 0, 'first key rotates nothing');
select is((select key_hash from public.device_keys where id = (:'k1'::jsonb ->> 'key_id')::uuid), tests.fake_hash('a1'),
  'only the hash is stored');
select is(public.create_device_key(:'user_b_b', tests.fake_hash('b1'), 'ios') ->> 'status', 'age_required',
  'user B has no consent → no key');

-- Rotation per platform
select public.create_device_key(:'user_a_a', tests.fake_hash('a2'), 'ios') as k2 \gset
select is((:'k2'::jsonb ->> 'rotated')::int, 1, 'a new iOS key revokes the earlier iOS key');
select isnt((select revoked_at from public.device_keys where key_hash = tests.fake_hash('a1')), null, 'old key revoked');
select public.create_device_key(:'user_a_a', tests.fake_hash('a3'), 'android') as k3 \gset
select is((:'k3'::jsonb ->> 'rotated')::int, 0, 'an Android key leaves the iOS key alone');

-- Format and uniqueness
reset role;
select throws_ok(format($$ insert into public.device_keys (user_id, key_hash, platform) values (%L, 'not-a-hash', 'ios') $$, :'user_a_a'),
  '23514', null, 'key_hash must be 64 lowercase hex chars');
select throws_ok(format($$ insert into public.device_keys (user_id, key_hash, platform) values (%L, %L, 'ios') $$, :'user_a_a', upper(tests.fake_hash('zz'))),
  '23514', null, 'upper-case hex is rejected');
select throws_ok(format($$ insert into public.device_keys (user_id, key_hash, platform) values (%L, %L, 'web') $$, :'user_a_a', tests.fake_hash('zz')),
  '23514', null, 'platform must be ios or android');
select throws_ok(format($$ insert into public.device_keys (user_id, key_hash, platform) values (%L, %L, 'ios') $$, :'user_b_b', tests.fake_hash('a2')),
  '23505', null, 'key_hash is unique');

-- Lookup (auth.ts)
select tests.as_service();
select results_eq(format('select user_id, revoked from public.lookup_device_key(%L)', tests.fake_hash('a2')),
  format('values (%L::uuid, false)', :'user_a_a'), 'live key → owner, not revoked');
select isnt((select last_used_at from public.device_keys where key_hash = tests.fake_hash('a2')), null,
  'lookup records last_used_at');
select results_eq(format('select user_id, revoked from public.lookup_device_key(%L)', tests.fake_hash('a1')),
  format('values (%L::uuid, true)', :'user_a_a'), 'revoked key → revoked = true');
select is((select last_used_at from public.device_keys where key_hash = tests.fake_hash('a1')), null,
  'a revoked key is not touched');
select is_empty(format('select * from public.lookup_device_key(%L)', tests.fake_hash('unknown')), 'unknown hash → no row');

-- Revocation scoped to the owner, final
select is(public.revoke_device_keys(:'user_b_b', (:'k2'::jsonb ->> 'key_id')::uuid), 0,
  'user B cannot revoke user A''s key');
select is(public.revoke_device_keys(:'user_a_a', (:'k2'::jsonb ->> 'key_id')::uuid), 1, 'revoke one key');
select is(public.revoke_device_keys(:'user_a_a'), 1, 'revoke all remaining keys');
select throws_ok(format($$ update public.device_keys set revoked_at = null where user_id = %L $$, :'user_a_a'),
  '23001', null, 'revocation cannot be undone');
reset role;

-- No client access at all
select tests.as_user(:'user_a_a');
select throws_ok('select * from public.device_keys', '42501', null, 'user cannot read device_keys, not even own');
select tests.as_anon();
select throws_ok('select * from public.device_keys', '42501', null, 'anon cannot read device_keys');
reset role;

select * from finish();
rollback;
