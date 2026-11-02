-- Review fixes (Prompt 3): rate-limit clock, per-bucket credit refunds, free-limit source,
-- abandoned-request sweeper, mid-request re-check, no storable 'crisis' flag.
begin;
\ir _helpers.psql
select plan(23);

create function tests.ai_user2(p_starter boolean)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.create_user();
begin
  update public.profiles set age_confirmed_at = now() where id = v_id;
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

create function tests.consume2(p_user uuid, p_now timestamptz)
returns jsonb
language sql
as $$
  select public.consume_reply(p_user, null, '2026-11-01', 'reply', 'app', p_now => p_now);
$$;

-- ---------------------------------------------------------------------------------------------
-- Rate limit counts requests committed "after" this transaction's start (no upper bound).
select tests.ai_user2(false) as u \gset r_
insert into public.entitlements (user_id, product, active) values (:'r_u', 'annual', true);
insert into public.ai_requests (user_id, kind, source, status, created_at)
select :'r_u', 'reply', 'app', 'ok', '2026-11-02T10:00:05Z'::timestamptz from generate_series(1, 20);
select is(tests.consume2(:'r_u', '2026-11-02T10:00:00Z') ->> 'status', 'rate',
  'rows newer than the caller''s clock (committed by a transaction that held the lock first) still count');
select ok(
  (select pg_get_functiondef('public.consume_reply(uuid, date, text, text, text, text, text, integer, text, text, text[], integer, timestamptz)'::regprocedure)
     ~* 'v_now := coalesce\(p_now, clock_timestamp\(\)\)'),
  'without a fixed clock, consume_reply reads clock_timestamp() after the lock');

-- Without p_now the real clock is used and the row gets it.
select tests.ai_user2(false) as u \gset c_
select is(public.consume_reply(:'c_u', null, '2026-11-01', 'reply', 'app') ->> 'status', 'ok', 'consume without a fixed clock');
select ok((select created_at >= now() from public.ai_requests where user_id = :'c_u'), 'created_at is the clock after the lock, not before the transaction');

-- ---------------------------------------------------------------------------------------------
-- Credits per bucket: a starter refund after an interleaved bonus spend goes back to starter.
select tests.ai_user2(true) as u \gset b_
-- Use 9 starter credits and the daily 3 directly: 1 starter left.
insert into public.ai_requests (id, user_id, kind, source, status, charge)
select gen_random_uuid(), :'b_u', 'reply', 'app', 'ok', 'starter' from generate_series(1, 9);
insert into public.credit_ledger (user_id, delta, reason, request_id, bucket)
select :'b_u', -1, 'spend', r.id, 'starter' from public.ai_requests r where r.user_id = :'b_u';
insert into public.usage_days (user_id, local_date, used) values (:'b_u', '2026-11-02', 3);
insert into public.credit_ledger (user_id, delta, reason) values (:'b_u', 10, 'referral');
select results_eq(format('select starter_left, bonus_left from public.reply_credits(%L)', :'b_u'), $$ values (1, 10) $$, 'set-up: 1 starter, 10 bonus');
select (tests.consume2(:'b_u', '2026-11-02T10:00:00Z')) ->> 'request_id' as id \gset last_starter_
select is((select charge from public.ai_requests where id = :'last_starter_id'), 'starter', 'last starter credit spent');
select is(tests.consume2(:'b_u', '2026-11-02T10:00:01Z') ->> 'charge', 'bonus', 'then a bonus credit (daily used up)');
select is(public.refund_reply(:'last_starter_id') ->> 'status', 'ok', 'refund the starter request');
select results_eq(format('select starter_left, bonus_left from public.reply_credits(%L)', :'b_u'), $$ values (1, 9) $$,
  'the refund goes back to starter, the bonus spend stays a bonus spend');
select is((select bucket from public.credit_ledger where request_id = :'last_starter_id' and reason = 'refund'), 'starter', 'refund row carries the bucket');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason, request_id) values (%L, -1, 'spend', gen_random_uuid()) $$, :'b_u'),
  '23514', null, 'new spend rows must name their bucket');

-- One source for the daily allowance.
select is(public.daily_free_limit(), 3, 'daily_free_limit() is 3');
select is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'usage_days' and column_name = 'free_limit'),
  'daily_free_limit()', 'usage_days.free_limit defaults to daily_free_limit()');

-- ---------------------------------------------------------------------------------------------
-- Sweeper: 'started' rows older than 5 minutes are refunded and marked abandoned.
select tests.ai_user2(true) as u \gset s_
select (tests.consume2(:'s_u', '2026-11-02T10:00:00Z')) ->> 'request_id' as id \gset old_
select (tests.consume2(:'s_u', '2026-11-02T10:04:00Z')) ->> 'request_id' as id \gset fresh_
select (tests.consume2(:'s_u', '2026-11-02T10:00:30Z')) ->> 'request_id' as id \gset done_
update public.ai_requests set status = 'ok' where id = :'done_id';
-- Earlier sections left 'started' rows of other users; finish them so only this user's count.
update public.ai_requests set status = 'ok' where status = 'started' and user_id <> :'s_u';
select is(public.sweep_abandoned_requests('2026-11-02T10:06:00Z'), 1, 'one abandoned row swept');
select results_eq(format($$ select id::text, status, refunded_at is not null from public.ai_requests where user_id = %L order by created_at $$, :'s_u'),
  format($$ values (%L, 'abandoned', true), (%L, 'ok', false), (%L, 'started', false) $$, :'old_id', :'done_id', :'fresh_id'),
  'old started row refunded and abandoned; finished and recent rows untouched');
select results_eq(format('select starter_left from public.reply_credits(%L)', :'s_u'), $$ values (8) $$, 'the abandoned starter credit came back');
select is(public.sweep_abandoned_requests('2026-11-02T10:06:00Z'), 0, 'sweeping again changes nothing');
select results_eq($$ select schedule, command from cron.job where jobname = 'replywise-sweep-abandoned' $$,
  $$ values ('*/5 * * * *'::text, 'select public.sweep_abandoned_requests(now())'::text) $$, 'sweeper runs every 5 minutes');

-- ---------------------------------------------------------------------------------------------
-- Mid-request re-check.
select tests.ai_user2(true) as u \gset k_
select tests.ai_user2(true) as u \gset other_
insert into public.device_keys (id, user_id, key_hash, platform) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :'k_u', tests.fake_hash('k1'), 'ios'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', :'other_u', tests.fake_hash('k2'), 'ios');
select ok(public.reply_still_allowed(:'k_u', '2026-11-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'consented user with a live key');
select ok(not public.reply_still_allowed(:'k_u', '2026-11-01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'someone else''s key → false');
update public.device_keys set revoked_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ok(not public.reply_still_allowed(:'k_u', '2026-11-01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'revoked key → false');
select public.withdraw_ai_consent(:'k_u');
select ok(not public.reply_still_allowed(:'k_u', '2026-11-01'), 'withdrawn consent → false (JWT request)');

-- ---------------------------------------------------------------------------------------------
-- 'crisis' can't be stored.
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, safety_flags) values (%L, 'reply', 'app', array['crisis']) $$, :'k_u'),
  '23514', null, 'the crisis flag is not storable');

select * from finish();
rollback;
