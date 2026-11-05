-- consume_reply / refund_reply / quota_state (spec §5, architecture §7 step 4).
-- Fixed clocks via p_now. Parallel calls are tested against the running stack in
-- supabase/functions/_shared/repo-supabase.integration.test.ts (pgTAP runs in one transaction).
begin;
\ir _helpers.psql
select plan(65);

-- Consumes one reply for p_user at p_now; returns the jsonb result.
create function tests.consume(p_user uuid, p_now timestamptz default now(), p_kind text default 'reply')
returns jsonb
language sql
as $$
  select public.consume_reply(
    p_user_id => p_user, p_local_date => null, p_min_policy_version => '2026-11-01',
    p_kind => p_kind, p_source => 'keyboard', p_tone => 'warm', p_relationship => 'friend',
    p_closeness => 3, p_formality => 'casual', p_flirt => 'off', p_now => p_now);
$$;

-- An age-confirmed, consented user in p_tz. p_starter: keep the 10 starter credits from sign-up, or
-- mark them used (so the daily allowance is used straight away).
create function tests.ai_user(p_tz text, p_starter boolean)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.create_user();
begin
  update public.profiles set age_confirmed_at = now(), timezone = p_tz where id = v_id;
  if p_starter then
    perform public.grant_ai_consent(v_id, '2026-11-01', '2026-11-01');
  else
    insert into public.consents (user_id, kind, policy_version) values (v_id, 'ai_sharing', '2026-11-01');
    -- Starter credits come with sign-up; this user has used them all (as a 90-day rollup would show).
    insert into public.credit_ledger (user_id, delta, reason, bucket) values (v_id, -10, 'rollup', 'starter');
  end if;
  return v_id;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Gate inside consume_reply
select is(public.consume_reply(gen_random_uuid(), null, '2026-11-01', 'reply', 'app') ->> 'status', 'no_profile', 'unknown user → no_profile');
select tests.create_user() as u \gset noconsent_
select is((tests.consume(:'noconsent_u')) ->> 'status', 'ai_off', 'no consent → ai_off');
update public.profiles set age_confirmed_at = now() where id = :'noconsent_u';
insert into public.consents (user_id, kind, policy_version, withdrawn_at) values (:'noconsent_u', 'ai_sharing', '2026-11-01', now());
select is((tests.consume(:'noconsent_u')) ->> 'status', 'ai_off', 'withdrawn consent → ai_off');
select is((select count(*)::int from public.ai_requests where user_id = :'noconsent_u'), 0, 'a refused gate charges and logs nothing');

-- ---------------------------------------------------------------------------------------------
-- Free: starter first, then 3/day, then bonus. London, fixed clock 2026-11-02 10:00 UTC.
select tests.ai_user('Europe/London', true) as u \gset a_
create temp table a_results (n int, r jsonb);
insert into a_results select n, tests.consume(:'a_u', '2026-11-02T10:00:00Z'::timestamptz + make_interval(mins => n)) from generate_series(1, 14) n;

select results_eq($$ select r ->> 'charge' from a_results order by n $$,
  $$ values ('starter'), ('starter'), ('starter'), ('starter'), ('starter'), ('starter'), ('starter'), ('starter'), ('starter'), ('starter'),
            ('daily'), ('daily'), ('daily'), (null) $$,
  'free: 10 starter credits, then the daily 3, then nothing');
select results_eq($$ select (r ->> 'left_today')::int from a_results order by n $$,
  $$ values (12), (11), (10), (9), (8), (7), (6), (5), (4), (3), (2), (1), (0), (0) $$,
  'left_today counts starter + daily + bonus left');
select is((select r ->> 'status' from a_results where n = 14), 'quota_empty', '14th reply → quota_empty');
select is((select r ->> 'plan' from a_results where n = 14), 'free', 'plan is free without entitlements');
select is((select r -> 'fair_use_left' from a_results where n = 1), 'null'::jsonb, 'fair_use_left is null for free users');
select is((select r ->> 'reset_at' from a_results where n = 1)::timestamptz, '2026-11-03T00:00:00Z'::timestamptz, 'London (GMT in November): resets at 00:00 UTC');
select is((select r ->> 'local_date' from a_results where n = 1), '2026-11-02', 'local date from profiles.timezone');
select is((select count(*)::int from public.ai_requests where user_id = :'a_u'), 13, 'one ai_requests row per charged reply');
select results_eq(format($$ select status, kind, source, tone, relationship, closeness::int, formality, flirt, charge, charge_date::text
  from public.ai_requests where user_id = %L order by created_at limit 1 $$, :'a_u'),
  $$ values ('started'::text, 'reply'::text, 'keyboard'::text, 'warm'::text, 'friend'::text, 3, 'casual'::text, 'off'::text, 'starter'::text, '2026-11-02'::text) $$,
  'the request row holds chips and the charge, no text');
select results_eq(format($$ select reason, sum(delta)::int, count(*)::int from public.credit_ledger where user_id = %L group by reason order by reason $$, :'a_u'),
  $$ values ('spend'::text, -10, 10), ('starter'::text, 10, 1) $$,
  'each starter use is one -1 spend row');
select is((select used from public.usage_days where user_id = :'a_u' and local_date = '2026-11-02'), 3, 'daily uses counted in usage_days');

-- Bonus (referral) credits are used only after the daily allowance.
insert into public.credit_ledger (user_id, delta, reason) values (:'a_u', 10, 'referral');
select is((tests.consume(:'a_u', '2026-11-02T11:00:00Z')) ->> 'charge', 'bonus', 'bonus credits after the daily 3');
select is((public.quota_state(:'a_u', '2026-11-02T11:00:01Z') ->> 'left_today')::int, 9, 'quota_state: 9 bonus left');

-- Next local day: the daily allowance is back and comes before bonus credits.
select is((tests.consume(:'a_u', '2026-11-03T00:00:00Z')) ->> 'charge', 'daily', 'new local day: daily allowance before bonus');
select is((public.quota_state(:'a_u', '2026-11-03T00:00:01Z') ->> 'left_today')::int, 11, 'quota_state next day: 2 daily + 9 bonus');

-- ---------------------------------------------------------------------------------------------
-- Refunds give back exactly what was charged, once.
select (tests.consume(:'a_u', '2026-11-03T08:00:00Z')) ->> 'request_id' as id \gset daily_
select is((select used from public.usage_days where user_id = :'a_u' and local_date = '2026-11-03'), 2, 'before refund: 2 daily used');
select is(public.refund_reply(:'daily_id') ->> 'status', 'ok', 'refund a daily reply');
select is((select used from public.usage_days where user_id = :'a_u' and local_date = '2026-11-03'), 1, 'refund gives the daily use back');
select is(public.refund_reply(:'daily_id') ->> 'status', 'already_refunded', 'second refund of the same request is a no-op');
select is((select used from public.usage_days where user_id = :'a_u' and local_date = '2026-11-03'), 1, '…and changes nothing');
select isnt((select refunded_at from public.ai_requests where id = :'daily_id'), null, 'refunded_at is set');

update public.usage_days set used = 3 where user_id = :'a_u' and local_date = '2026-11-03';
select (tests.consume(:'a_u', '2026-11-03T09:00:00Z')) ->> 'request_id' as id \gset bonus_
select is((select charge from public.ai_requests where id = :'bonus_id'), 'bonus', 'charged a bonus credit');
-- refund_reply reports the quota as of the real clock (now()), not the test's fixed dates, so
-- compare it with quota_state at now(); the bonus balance itself is checked at the fixed time.
select (public.refund_reply(:'bonus_id') -> 'quota' ->> 'left_today')::int as left_after \gset bonus_refund_
select is(:bonus_refund_left_after, (public.quota_state(:'a_u', now()) ->> 'left_today')::int,
  'refund of a bonus credit returns the current quota');
select is((public.quota_state(:'a_u', '2026-11-03T09:00:01Z') ->> 'left_today')::int, 9,
  'refund of a bonus credit gives the bonus credit back (9 left on 2026-11-03, daily used up)');
select results_eq(format($$ select delta from public.credit_ledger where request_id = %L order by id $$, :'bonus_id'),
  $$ values (-1), (1) $$, 'bonus refund is a +1 refund row linked to the request');
select is(public.refund_reply(gen_random_uuid()) ->> 'status', 'not_found', 'unknown request → not_found');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason, request_id, bucket) values (%L, 1, 'refund', %L, 'bonus') $$, :'a_u', :'bonus_id'),
  '23505', null, 'at most one refund row per request');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason, request_id) values (%L, -2, 'spend', gen_random_uuid()) $$, :'a_u'),
  '23514', null, 'a spend is exactly -1');

-- Starter refund: the starter credit is usable again.
select tests.ai_user('UTC', true) as u \gset s_
select (tests.consume(:'s_u', '2026-11-02T10:00:00Z')) ->> 'request_id' as id \gset starter_
select is((public.refund_reply(:'starter_id') -> 'quota' ->> 'left_today')::int, 13, 'starter refund: 10 starter + 3 daily again');
select is((tests.consume(:'s_u', '2026-11-02T10:01:00Z')) ->> 'charge', 'starter', 'refunded starter credit is used first again');

-- ---------------------------------------------------------------------------------------------
-- Reset at local midnight: Europe/London and Europe/Berlin, including DST days.
select tests.ai_user('Europe/Berlin', false) as u \gset b_
select is((tests.consume(:'b_u', '2026-11-02T22:58:00Z')) ->> 'local_date', '2026-11-02', 'Berlin 23:58 CET is still 2 Nov');
select tests.consume(:'b_u', '2026-11-02T22:58:30Z');
select tests.consume(:'b_u', '2026-11-02T22:59:00Z');
select is((tests.consume(:'b_u', '2026-11-02T22:59:59Z')) ->> 'status', 'quota_empty', 'Berlin: 3 used on 2 Nov, a 4th is refused at 23:59:59 CET');
select is((tests.consume(:'b_u', '2026-11-02T23:00:00Z')) ->> 'status', 'ok', 'Berlin: allowance back at 00:00 CET (23:00 UTC)');
select is((public.quota_state(:'b_u', '2026-11-02T23:00:01Z') ->> 'reset_at')::timestamptz, '2026-11-03T23:00:00Z'::timestamptz, 'Berlin: next reset at 00:00 CET');

-- Berlin spring-forward day (29 Mar 2026, 23 h): starts 28 Mar 23:00 UTC, ends 29 Mar 22:00 UTC.
select is((tests.consume(:'b_u', '2026-03-28T23:00:00Z')) ->> 'reset_at', '2026-03-29T22:00:00+00:00', 'Berlin DST day: reset at 00:00 CEST = 22:00 UTC');
select tests.consume(:'b_u', '2026-03-29T12:00:00Z');
select tests.consume(:'b_u', '2026-03-29T21:00:00Z');
select is((tests.consume(:'b_u', '2026-03-29T21:59:59Z')) ->> 'status', 'quota_empty', 'Berlin DST day: 3 used, refused until local midnight');
select is((tests.consume(:'b_u', '2026-03-29T22:00:00Z')) ->> 'local_date', '2026-03-30', 'Berlin: 22:00 UTC on 29 Mar is already 30 Mar');

-- London fall-back day (25 Oct 2026, 25 h): starts 24 Oct 23:00 UTC (BST), ends 26 Oct 00:00 UTC (GMT).
select tests.ai_user('Europe/London', false) as u \gset l_
select is((tests.consume(:'l_u', '2026-10-24T23:00:00Z')) ->> 'local_date', '2026-10-25', 'London: 23:00 UTC on 24 Oct is 00:00 BST on 25 Oct');
select is((public.quota_state(:'l_u', '2026-10-25T12:00:00Z') ->> 'reset_at')::timestamptz, '2026-10-26T00:00:00Z'::timestamptz, 'London DST end: day ends at 00:00 GMT');
select tests.consume(:'l_u', '2026-10-25T12:00:00Z');
select tests.consume(:'l_u', '2026-10-25T23:00:00Z');
select is((tests.consume(:'l_u', '2026-10-25T23:59:59Z')) ->> 'status', 'quota_empty', 'London: 25-hour day still one allowance');
select is((tests.consume(:'l_u', '2026-10-26T00:00:00Z')) ->> 'status', 'ok', 'London: allowance back at 00:00 GMT');

-- ---------------------------------------------------------------------------------------------
-- Paid: lifetime 100/day, subscriptions 300/day; credits untouched.
select tests.ai_user('Europe/Berlin', true) as u \gset life_
insert into public.entitlements (user_id, product, active) values (:'life_u', 'lifetime', true);
select is((tests.consume(:'life_u', '2026-11-02T10:00:00Z')) ->> 'charge', 'paid', 'lifetime: charged against fair use, not credits');
select results_eq(format($$ select r ->> 'plan', r -> 'left_today', (r ->> 'fair_use_left')::int from (select public.quota_state(%L, '2026-11-02T10:00:01Z') r) q $$, :'life_u'),
  $$ values ('lifetime'::text, 'null'::jsonb, 99) $$, 'lifetime: 99 fair-use left, left_today null');
select is((public.reply_credits(:'life_u')).starter_left, 10, 'starter credits are not used by paid plans');
update public.usage_days set used = 99 where user_id = :'life_u' and local_date = '2026-11-02';
select is((tests.consume(:'life_u', '2026-11-02T10:05:00Z')) ->> 'fair_use_left', '0', 'lifetime: 100th reply ok, 0 left');
select is((tests.consume(:'life_u', '2026-11-02T10:06:00Z')) ->> 'status', 'fair_use', 'lifetime: 101st → fair_use');

select tests.ai_user('Europe/London', false) as u \gset sub_
insert into public.entitlements (user_id, product, active, expires_at, will_renew) values (:'sub_u', 'weekly', true, '2026-11-09T00:00:00Z', true);
insert into public.usage_days (user_id, local_date, used) values (:'sub_u', '2026-11-02', 299);
select is((tests.consume(:'sub_u', '2026-11-02T10:00:00Z')) ->> 'plan', 'weekly', 'weekly subscription plan');
select is((tests.consume(:'sub_u', '2026-11-02T10:01:00Z')) ->> 'status', 'fair_use', 'subscription: 300/day cap');
select is((tests.consume(:'sub_u', '2026-11-10T10:00:00Z')) ->> 'plan', 'free', 'expired subscription → free');

insert into public.entitlements (user_id, product, active) values (:'sub_u', 'lifetime_upgrade', true);
select results_eq(format($$ select r ->> 'plan', (r ->> 'fair_use_left')::int from (select public.quota_state(%L, '2026-11-02T12:00:00Z') r) q $$, :'sub_u'),
  $$ values ('lifetime'::text, 0) $$, 'lifetime_upgrade counts as lifetime; with an active weekly the larger cap (300) applies');
update public.entitlements set active = false where user_id = :'sub_u' and product = 'lifetime_upgrade';

-- ---------------------------------------------------------------------------------------------
-- Rate limit: 20 charged requests per 60 s, across instances (counted in ai_requests).
select tests.ai_user('UTC', false) as u \gset r_
insert into public.entitlements (user_id, product, active, expires_at, will_renew) values (:'r_u', 'annual', true, '2027-11-01T00:00:00Z', true);
select is((select count(*)::int from generate_series(1, 20) n where (tests.consume(:'r_u', '2026-11-02T10:00:00Z'::timestamptz + make_interval(secs => n)) ->> 'status') = 'ok'),
  20, '20 requests within a minute are ok');
select results_eq(format($$ select r ->> 'status', (r ->> 'retry_after')::int from (select tests.consume(%L, '2026-11-02T10:00:30Z') r) q $$, :'r_u'),
  $$ values ('rate'::text, 31) $$, '21st within 60 s → rate, retry when the oldest leaves the window');
select is((tests.consume(:'r_u', '2026-11-02T10:01:01.5Z')) ->> 'status', 'ok', 'ok again once the window moved');

-- ---------------------------------------------------------------------------------------------
-- Locking and privileges
select ok((select pg_get_functiondef('public.consume_reply(uuid, date, text, text, text, text, text, integer, text, text, text[], integer, timestamptz)'::regprocedure) ~* 'from public\.profiles p where p\.id = p_user_id for update'),
  'consume_reply locks the profiles row');
select ok((select pg_get_functiondef('public.consume_reply(uuid, date, text, text, text, text, text, integer, text, text, text[], integer, timestamptz)'::regprocedure) ~* 'local_date = v_date\s+for update'),
  'consume_reply locks the usage_days row');
select tests.as_user(:'a_u');
select throws_ok(format($$ select public.consume_reply(%L, null, '2026-11-01', 'reply', 'app') $$, :'a_u'), '42501', null, 'users cannot call consume_reply');
select throws_ok(format($$ select public.refund_reply(%L) $$, :'daily_id'), '42501', null, 'users cannot call refund_reply');
select throws_ok(format($$ select public.quota_state(%L) $$, :'a_u'), '42501', null, 'users cannot call quota_state');
reset role;
select tests.as_anon();
select throws_ok(format($$ select public.consume_reply(%L, null, '2026-11-01', 'reply', 'app') $$, :'a_u'), '42501', null, 'anon cannot call consume_reply');
reset role;
select tests.clear_claims();
select tests.as_service();
select is((public.quota_state(:'a_u', '2026-11-03T09:30:00Z') ->> 'status'), 'ok', 'service role can read quota');
reset role;
select tests.clear_claims();
select is((public.quota_state(gen_random_uuid()) ->> 'status'), 'no_profile', 'quota_state for an unknown user');

select * from finish();
rollback;
