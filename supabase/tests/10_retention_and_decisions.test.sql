-- User decisions (Prompt 3): starter credits at sign-up, credit_ledger fold after 90 days,
-- anonymous crisis_daily count, inactive-account purge after 12 months. Fixed clocks.
begin;
\ir _helpers.psql
select plan(32);

-- ---------------------------------------------------------------------------------------------
-- Starter credits at sign-up, exactly once; consent adds nothing; spending needs consent + 18+.
select tests.create_user() as u \gset s_
select results_eq(format($$ select delta, reason from public.credit_ledger where user_id = %L $$, :'s_u'),
  $$ values (10, 'starter'::text) $$, 'sign-up grants +10 starter credits');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 10, 'starter') $$, :'s_u'),
  '23505', null, 'a second starter row is impossible');
select is(public.consume_reply(:'s_u', null, '2026-11-01', 'reply', 'app') ->> 'status', 'ai_off',
  'credits can''t be spent without consent and 18+');
update public.profiles set age_confirmed_at = now() where id = :'s_u';
select is(public.grant_ai_consent(:'s_u', '2026-11-01', '2026-11-01') ->> 'status', 'ok', 'consent');
select is((select count(*)::int from public.credit_ledger where user_id = :'s_u'), 1, 'consent adds no credits');
select is(public.consume_reply(:'s_u', null, '2026-11-01', 'reply', 'app') ->> 'charge', 'starter', 'then the starter credits are used first');
select isnt((select last_reply_at from public.profiles where id = :'s_u'), null, 'a request stamps profiles.last_reply_at');

-- ---------------------------------------------------------------------------------------------
-- Inactive accounts: no activity for 12 months, unless subscribed (annual, active). Clock 2026-12-31.
create function tests.old_user(p_created timestamptz)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.create_user();
begin
  update auth.users set created_at = p_created, last_sign_in_at = null where id = v_id;
  return v_id;
end;
$$;
select tests.old_user('2025-06-01T00:00:00Z') as u \gset gone_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset replied_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset signedin_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset keyused_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset sub_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset expired_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset trial_
select tests.old_user('2025-06-01T00:00:00Z') as u \gset cancelled_
select tests.old_user('2026-06-01T00:00:00Z') as u \gset young_

insert into public.ai_requests (user_id, kind, source, status, created_at) values (:'replied_u', 'reply', 'app', 'ok', '2026-03-01T00:00:00Z');
update auth.users set last_sign_in_at = '2026-02-01T00:00:00Z' where id = :'signedin_u';
insert into public.device_keys (user_id, key_hash, platform, last_used_at) values (:'keyused_u', tests.fake_hash('inactive-key'), 'ios', '2026-05-01T00:00:00Z');
insert into public.entitlements (user_id, product, active, expires_at, will_renew) values
  (:'sub_u', 'annual', true, '2027-01-05T00:00:00Z', true),
  (:'expired_u', 'annual', true, '2026-06-01T00:00:00Z', false),
  (:'cancelled_u', 'annual', false, '2027-03-01T00:00:00Z', false);
insert into public.entitlements (user_id, product, active, is_trial, trial_ends_at, expires_at, will_renew) values
  (:'trial_u', 'annual', true, true, '2027-01-02T00:00:00Z', '2027-01-02T00:00:00Z', true);
insert into public.consents (user_id, kind, policy_version) values (:'gone_u', 'ai_sharing', '2026-11-01');

select set_eq(
  format($$ select a from public.inactive_accounts('2026-12-31T12:00:00Z') a where a in (%L, %L, %L, %L, %L, %L, %L, %L, %L) $$,
    :'gone_u', :'replied_u', :'signedin_u', :'keyused_u', :'sub_u', :'expired_u', :'trial_u', :'cancelled_u', :'young_u'),
  format($$ values (%L::uuid), (%L::uuid), (%L::uuid) $$, :'gone_u', :'expired_u', :'cancelled_u'),
  'inactive: no sign-in, reply or key use for 12 months, and no active annual subscription (a trial counts; expired or inactive rows do not)');

select tests.as_service();
select ok((public.run_retention('2026-12-31T12:00:00Z') ->> 'inactive_accounts')::int >= 3, 'run_retention deletes inactive accounts');
reset role;
select tests.clear_claims();
select is_empty(format($$ select 1 from auth.users where id in (%L, %L, %L) $$, :'gone_u', :'expired_u', :'cancelled_u'), 'the inactive auth users are gone');
select is_empty(format($$ select 1 from public.profiles where id = %1$L union all select 1 from public.consents where user_id = %1$L union all select 1 from public.credit_ledger where user_id = %1$L $$, :'gone_u'),
  'their rows went with them (cascade), consents included');
select is((select count(*)::int from auth.users where id in (:'replied_u', :'signedin_u', :'keyused_u', :'sub_u', :'trial_u', :'young_u')), 6,
  'active, subscribed (trial included) and young accounts stay');
select tests.as_user(:'young_u');
select throws_ok($$ select public.inactive_accounts(now()) $$, '42501', null, 'users cannot list inactive accounts');
reset role;
select tests.clear_claims();

-- ---------------------------------------------------------------------------------------------
-- credit_ledger fold: spend/refund rows older than 90 days → one rollup per user and bucket.
select tests.create_user() as u \gset f_
insert into public.credit_ledger (user_id, delta, reason, created_at) values (:'f_u', 10, 'referral', '2026-08-01T00:00:00Z');
insert into public.credit_ledger (user_id, delta, reason, request_id, bucket, created_at) values
  (:'f_u', -1, 'spend', gen_random_uuid(), 'starter', '2026-09-01T00:00:00Z'),
  (:'f_u', -1, 'spend', gen_random_uuid(), 'starter', '2026-09-01T00:00:01Z'),
  (:'f_u', -1, 'spend', gen_random_uuid(), 'starter', '2026-09-01T00:00:02Z'),
  (:'f_u', -1, 'spend', gen_random_uuid(), 'bonus', '2026-09-02T00:00:00Z'),
  (:'f_u', -1, 'spend', gen_random_uuid(), 'bonus', '2026-09-02T00:00:01Z'),
  (:'f_u', -1, 'spend', gen_random_uuid(), 'starter', '2026-12-30T00:00:00Z'),
  (:'f_u', -1, 'spend', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bonus', '2026-12-30T00:00:01Z'),
  (:'f_u', 1, 'refund', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bonus', '2026-12-30T00:00:02Z');
-- A starter refund that is old too.
insert into public.credit_ledger (user_id, delta, reason, request_id, bucket, created_at)
select :'f_u', 1, 'refund', l.request_id, 'starter', '2026-09-01T00:00:03Z'
from public.credit_ledger l where l.user_id = :'f_u' and l.created_at = '2026-09-01T00:00:00Z';

create temp table bal_before as select * from public.reply_credits(:'f_u');
select results_eq('select starter_left, bonus_left from bal_before', $$ values (7, 8) $$, 'set-up: 7 starter, 8 bonus');

select tests.as_service();
select is((public.run_retention('2026-12-31T12:00:00Z') ->> 'credit_rows_folded')::int >= 6, true, 'old spend/refund rows were folded');
reset role;
select tests.clear_claims();
select results_eq(format('select starter_left, bonus_left from public.reply_credits(%L)', :'f_u'), 'select starter_left, bonus_left from bal_before',
  'balances unchanged by the fold');
select is_empty(format($$ select 1 from public.credit_ledger where user_id = %L and reason in ('spend', 'refund') and created_at < '2026-10-02T12:00:00Z' $$, :'f_u'),
  'no per-reply rows older than 90 days remain');
select results_eq(format($$ select bucket, delta from public.credit_ledger where user_id = %L and reason = 'rollup' order by bucket $$, :'f_u'),
  $$ values ('bonus'::text, -2), ('starter'::text, -2) $$, 'one rollup per bucket with the folded sum');
select results_eq(format($$ select reason, delta from public.credit_ledger where user_id = %L and reason in ('starter', 'referral') order by reason $$, :'f_u'),
  $$ values ('referral'::text, 10), ('starter'::text, 10) $$, 'grant rows are kept as they are');
select is((select count(*)::int from public.credit_ledger where user_id = :'f_u' and request_id is not null), 3, 'recent per-reply rows stay');

create temp table rows_after_first as
  select reason, bucket, delta, request_id from public.credit_ledger where user_id = :'f_u';
select tests.as_service();
select is((public.run_retention('2026-12-31T12:00:00Z') ->> 'credit_rows_folded')::int, 0, 'second run folds nothing');
reset role;
select tests.clear_claims();
select set_eq(format('select reason, bucket, delta, request_id from public.credit_ledger where user_id = %L', :'f_u'),
  'select * from rows_after_first', 'idempotent: same rows after a second run');

-- Later: the recent rows age too and merge into the same single rollup per bucket.
select tests.as_service();
select public.run_retention('2027-04-15T00:00:00Z');
reset role;
select tests.clear_claims();
select results_eq(format($$ select bucket, delta from public.credit_ledger where user_id = %L and reason = 'rollup' order by bucket $$, :'f_u'),
  $$ values ('bonus'::text, -2), ('starter'::text, -3) $$, 'later fold merges into one rollup per bucket');
select results_eq(format('select starter_left, bonus_left from public.reply_credits(%L)', :'f_u'), 'select starter_left, bonus_left from bal_before',
  'balances still unchanged');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason, request_id, bucket) values (%L, -1, 'rollup', gen_random_uuid(), 'starter') $$, :'f_u'),
  '23514', null, 'a rollup has no request_id');

-- ---------------------------------------------------------------------------------------------
-- crisis_daily: anonymous counts only.
select columns_are('public', 'crisis_daily', array['date', 'lang', 'source', 'count', 'created_at', 'updated_at'],
  'crisis_daily has no user column');
select tests.as_service();
-- Start from an empty table: other suites (e.g. the Deno integration test) may already have
-- counted real crisis cards in this database. The whole file runs in a rolled-back transaction.
delete from public.crisis_daily;
select public.increment_crisis_daily('de', 'keyboard', '2026-11-02T10:00:00Z');
select public.increment_crisis_daily('de', 'keyboard', '2026-11-02T23:59:00Z');
select public.increment_crisis_daily('fr', 'app', '2026-11-02T12:00:00Z');
select results_eq($$ select date::text, lang, source, count::int from public.crisis_daily where date = '2026-11-02' order by lang $$,
  $$ values ('2026-11-02', 'de'::text, 'keyboard'::text, 2), ('2026-11-02', 'fr'::text, 'app'::text, 1) $$,
  'increments per UTC day, language and source');
reset role;
select tests.clear_claims();
select throws_ok($$ select public.increment_crisis_daily('xx', 'app') $$, '23514', null, 'only known languages');
select tests.as_user(:'f_u');
select throws_ok('select * from public.crisis_daily', '42501', null, 'users cannot read crisis_daily');
select throws_ok($$ select public.increment_crisis_daily('de', 'app') $$, '42501', null, 'users cannot increment it');
reset role;
select tests.as_anon();
select throws_ok('select * from public.crisis_daily', '42501', null, 'anon cannot read crisis_daily');
reset role;
select tests.clear_claims();
grant select on public.crisis_daily to authenticated;
select tests.as_user(:'f_u');
select is_empty('select 1 from public.crisis_daily', 'RLS hides crisis_daily even with a stray grant');
reset role;

select * from finish();
rollback;
