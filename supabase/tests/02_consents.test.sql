-- consents + starter credits: gate, idempotent grant, starter credits exactly once (granted at
-- sign-up, never by consent), withdraw
-- revokes device keys, owner-only reads.
begin;
\ir _helpers.psql
select plan(34);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

select tests.as_service();

-- Age gate
select is(public.grant_ai_consent(:'user_a_a', '2026-11-01', '2026-11-01') ->> 'status', 'age_required',
  'grant without age confirmation → age_required');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 0, 'no consent row stored');
select results_eq(format($$ select delta, reason from public.credit_ledger where user_id = %L $$, :'user_a_a'),
  $$ values (10, 'starter'::text) $$, 'starter credits come with sign-up, not consent');
select is(public.grant_ai_consent(gen_random_uuid(), '2026-11-01', '2026-11-01') ->> 'status', 'no_profile', 'unknown user → no_profile');

select public.patch_profile(:'user_a_a', p_min_policy_version => '2026-11-01', p_age_confirmed => true) is not null as ok \gset
select is(public.ai_allowed(:'user_a_a', '2026-11-01'), false, 'age alone does not enable AI');

-- First grant
select public.grant_ai_consent(:'user_a_a', '2026-11-01', '2026-11-01') as g1 \gset
select is(:'g1'::jsonb ->> 'status', 'ok', 'first grant ok');
select ok(not (:'g1'::jsonb ? 'starter_granted'), 'consent no longer reports or grants starter credits');
select is(public.ai_allowed(:'user_a_a', '2026-11-01'), true, 'AI allowed after age + consent');
select results_eq(
  format($$ select delta, reason from public.credit_ledger where user_id = %L $$, :'user_a_a'),
  $$ values (10, 'starter'::text) $$, 'ledger has exactly +10 starter');

-- Re-grant same version: idempotent
select is((select (public.grant_ai_consent(:'user_a_a', '2026-11-01', '2026-11-01') ->> 'status') || ':' || (select count(*) from public.credit_ledger where user_id = :'user_a_a')), 'ok:1',
  'second grant adds no credits');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 1,
  'same policy version → no new consent row');

-- New policy version → new row, still no credits
select is((public.grant_ai_consent(:'user_a_a', '2026-12-01', '2026-11-01') ->> 'policy_version'), '2026-12-01', 'grant for 2026-12-01 recorded');
select is((select count(*)::int from public.consents where user_id = :'user_a_a'), 2, 'a newer version adds a row');

-- Withdraw revokes all device keys
select public.create_device_key(:'user_a_a', tests.fake_hash('a-ios'), 'ios', '2026-11-01') ->> 'status' as k1 \gset
select public.create_device_key(:'user_a_a', tests.fake_hash('a-android'), 'android', '2026-11-01') ->> 'status' as k2 \gset
select is(:'k1' || :'k2', 'okok', 'two device keys created');
select public.withdraw_ai_consent(:'user_a_a') as w \gset
select is((:'w'::jsonb ->> 'withdrawn')::int, 2, 'withdraw marks every active consent row');
select is((:'w'::jsonb ->> 'revoked_device_keys')::int, 2, 'withdraw revokes every device key');
select is((select count(*)::int from public.device_keys where user_id = :'user_a_a' and revoked_at is null), 0,
  'no live device keys after withdraw');
select is(public.ai_allowed(:'user_a_a', '2026-11-01'), false, 'AI off after withdraw');

-- Regrant after withdraw: AI back on, credits still only once
select is((select (public.grant_ai_consent(:'user_a_a', '2026-12-01', '2026-11-01') ->> 'status') || ':' || (select count(*) from public.credit_ledger where user_id = :'user_a_a')), 'ok:1',
  'regrant after withdraw adds no credits');
select is(public.ai_allowed(:'user_a_a', '2026-11-01'), true, 'AI on again after regrant');
select is((select sum(delta)::int from public.credit_ledger where user_id = :'user_a_a' and reason = 'starter'), 10,
  'starter credits total 10 after grant, regrant, withdraw, regrant');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 10, 'starter') $$, :'user_a_a'),
  '23505', null, 'a second starter row is impossible (unique index; safe under concurrent grants)');

-- Policy versions: format and minimum enforced in SQL too (the Edge Function checks the list).
select is(public.grant_ai_consent(:'user_a_a', 'v9', '2026-11-01') ->> 'status', 'unknown_policy_version',
  'a version that is not a YYYY-MM-DD date is refused');
select is(public.grant_ai_consent(:'user_a_a', '2026-10-01', '2026-11-01') ->> 'status', 'unknown_policy_version',
  'a version below the minimum is refused');
select is(public.ai_allowed(:'user_a_a', '2026-12-01'), true, 'consent to 2026-12-01 satisfies minimum 2026-12-01');
select is(public.ai_allowed(:'user_a_a', '2027-01-01'), false,
  'raising the minimum above the consented version turns AI off until the user consents again');
select throws_ok(format($$ select public.ai_allowed(%L, 'latest') $$, :'user_a_a'), '22023', null,
  'the minimum must be a valid version');
select throws_ok(format($$ select public.grant_ai_consent(%L, '2026-11-01', null) $$, :'user_a_a'), '22023', null,
  'the minimum is required');
reset role;
-- A legacy row in another format (e.g. old local data) never satisfies the gate, even if latest.
insert into public.consents (user_id, kind, policy_version) values (:'user_b_b', 'ai_sharing', 'v1');
update public.profiles set age_confirmed_at = now() where id = :'user_b_b';
select is(public.ai_allowed(:'user_b_b', '2026-11-01'), false, 'a non-date legacy consent does not enable AI');
delete from public.consents where user_id = :'user_b_b';
select tests.as_service();

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
select throws_ok(format($$ insert into public.consents (user_id, kind, policy_version) values (%L, 'ai_sharing', '2026-11-01') $$, :'user_b_b'),
  '42501', null, 'clients cannot record consent directly (only via the consent function)');
select tests.as_anon();
select throws_ok('select * from public.consents', '42501', null, 'anon cannot read consents');
reset role;

select * from finish();
rollback;
