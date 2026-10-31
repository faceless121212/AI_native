-- consents + starter credits: gate, idempotent grant, starter credits exactly once, withdraw
-- revokes device keys, owner-only reads.
begin;
\ir _helpers.psql
select plan(27);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

select tests.as_service();

-- Age gate
select is(public.grant_ai_consent(:'user_a_a', 'v1') ->> 'status', 'age_required',
  'grant without age confirmation → age_required');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 0, 'no consent row stored');
select is((select count(*)::int from public.credit_ledger where user_id = :'user_a_a'), 0, 'no starter credits');
select is(public.grant_ai_consent(gen_random_uuid(), 'v1') ->> 'status', 'no_profile', 'unknown user → no_profile');

select public.patch_profile(:'user_a_a', p_age_confirmed => true) is not null as ok \gset
select is(public.ai_allowed(:'user_a_a'), false, 'age alone does not enable AI');

-- First grant
select public.grant_ai_consent(:'user_a_a', 'v1') as g1 \gset
select is(:'g1'::jsonb ->> 'status', 'ok', 'first grant ok');
select is((:'g1'::jsonb ->> 'starter_granted')::boolean, true, 'first grant adds starter credits');
select is(public.ai_allowed(:'user_a_a'), true, 'AI allowed after age + consent');
select results_eq(
  format($$ select delta, reason from public.credit_ledger where user_id = %L $$, :'user_a_a'),
  $$ values (10, 'starter'::text) $$, 'ledger has exactly +10 starter');

-- Re-grant same version: idempotent
select is((public.grant_ai_consent(:'user_a_a', 'v1') ->> 'starter_granted')::boolean, false,
  'second grant adds no credits');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 1,
  'same policy version → no new consent row');

-- New policy version → new row, still no credits
select is((public.grant_ai_consent(:'user_a_a', 'v2') ->> 'policy_version'), 'v2', 'grant for v2 recorded');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 2, 'v2 adds a row');

-- Withdraw revokes all device keys
select public.create_device_key(:'user_a_a', tests.fake_hash('a-ios'), 'ios') ->> 'status' as k1 \gset
select public.create_device_key(:'user_a_a', tests.fake_hash('a-android'), 'android') ->> 'status' as k2 \gset
select is(:'k1' || :'k2', 'okok', 'two device keys created');
select public.withdraw_ai_consent(:'user_a_a') as w \gset
select is((:'w'::jsonb ->> 'withdrawn')::int, 2, 'withdraw marks every active consent row');
select is((:'w'::jsonb ->> 'revoked_device_keys')::int, 2, 'withdraw revokes every device key');
select is((select count(*)::int from public.device_keys where user_id = :'user_a_a' and revoked_at is null), 0,
  'no live device keys after withdraw');
select is(public.ai_allowed(:'user_a_a'), false, 'AI off after withdraw');

-- Regrant after withdraw: AI back on, credits still only once
select is((public.grant_ai_consent(:'user_a_a', 'v2') ->> 'starter_granted')::boolean, false,
  'regrant after withdraw adds no credits');
select is(public.ai_allowed(:'user_a_a'), true, 'AI on again after regrant');
select is((select sum(delta)::int from public.credit_ledger where user_id = :'user_a_a' and reason = 'starter'), 10,
  'starter credits total 10 after grant, regrant, withdraw, regrant');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 10, 'starter') $$, :'user_a_a'),
  '23505', null, 'a second starter row is impossible (unique index; safe under concurrent grants)');

-- Append-only history
select throws_ok(format($$ update public.consents set policy_version = 'v9' where user_id = %L $$, :'user_a_a'),
  '23001', null, 'consent rows cannot be rewritten');
reset role;
select tests.clear_claims();

-- RLS
select tests.as_user(:'user_a_a');
select is((select count(*)::int from public.consents), 3, 'user A reads their own consent history');
select tests.as_user(:'user_b_b');
select is_empty('select 1 from public.consents', 'user B cannot see user A''s consents');
select throws_ok(format($$ insert into public.consents (user_id, kind, policy_version) values (%L, 'ai_sharing', 'v1') $$, :'user_b_b'),
  '42501', null, 'clients cannot record consent directly (only via the consent function)');
select tests.as_anon();
select throws_ok('select * from public.consents', '42501', null, 'anon cannot read consents');
reset role;

select * from finish();
rollback;
