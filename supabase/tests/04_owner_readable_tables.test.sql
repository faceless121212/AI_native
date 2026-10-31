-- usage_days, credit_ledger, entitlements, referrals: owner reads own rows only; no client writes;
-- anon reads nothing; table constraints.
begin;
\ir _helpers.psql
select plan(38);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

-- Rows for both users, written as the server would.
insert into public.usage_days (user_id, local_date, used) values
  (:'user_a_a', '2026-10-30', 2), (:'user_b_b', '2026-10-30', 1);
insert into public.credit_ledger (user_id, delta, reason) values
  (:'user_a_a', 10, 'starter'), (:'user_b_b', 10, 'referral');
insert into public.entitlements (user_id, product, active) values
  (:'user_a_a', 'lifetime', true), (:'user_b_b', 'annual', true);
insert into public.referrals (code, owner_id) values ('AAAA2222', :'user_a_a'), ('BBBB3333', :'user_b_b');

-- Per table: A sees only A, B sees only B, A cannot write, anon cannot read.
select tests.as_user(:'user_a_a');
select results_eq('select user_id from public.usage_days', format('values (%L::uuid)', :'user_a_a'), 'usage_days: A sees only own');
select results_eq('select user_id from public.credit_ledger', format('values (%L::uuid)', :'user_a_a'), 'credit_ledger: A sees only own');
select results_eq('select user_id from public.entitlements', format('values (%L::uuid)', :'user_a_a'), 'entitlements: A sees only own');
select results_eq('select code from public.referrals', $$ values ('AAAA2222'::text) $$, 'referrals: A sees only own code');

select throws_ok(format($$ insert into public.usage_days (user_id, local_date) values (%L, '2026-10-31') $$, :'user_a_a'), '42501', null, 'usage_days: no client insert');
select throws_ok(format($$ update public.usage_days set used = 0 where user_id = %L $$, :'user_a_a'), '42501', null, 'usage_days: no client update');
select throws_ok(format($$ delete from public.usage_days where user_id = %L $$, :'user_b_b'), '42501', null, 'usage_days: no client delete');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 100, 'admin') $$, :'user_a_a'), '42501', null, 'credit_ledger: no client insert');
select throws_ok(format($$ delete from public.credit_ledger where user_id = %L $$, :'user_a_a'), '42501', null, 'credit_ledger: no client delete');
select throws_ok(format($$ insert into public.entitlements (user_id, product, active) values (%L, 'weekly', true) $$, :'user_a_a'), '42501', null, 'entitlements: no client insert');
select throws_ok(format($$ update public.entitlements set active = true where user_id = %L $$, :'user_b_b'), '42501', null, 'entitlements: no client update');
select throws_ok(format($$ insert into public.referrals (code, owner_id) values ('CCCC4444', %L) $$, :'user_a_a'), '42501', null, 'referrals: no client insert');
select throws_ok(format($$ update public.referrals set redeemed_by = %L where code = 'BBBB3333' $$, :'user_a_a'), '42501', null, 'referrals: no client redeem');

select tests.as_user(:'user_b_b');
select results_eq('select user_id from public.usage_days', format('values (%L::uuid)', :'user_b_b'), 'usage_days: B sees only own');
select results_eq('select user_id from public.credit_ledger', format('values (%L::uuid)', :'user_b_b'), 'credit_ledger: B sees only own');
select results_eq('select user_id from public.entitlements', format('values (%L::uuid)', :'user_b_b'), 'entitlements: B sees only own');
select results_eq('select code from public.referrals', $$ values ('BBBB3333'::text) $$, 'referrals: B sees only own code');
select is_empty(format('select 1 from public.usage_days where user_id = %L', :'user_a_a'), 'usage_days: B cannot see A even by id');

-- A user with no rows sees nothing.
reset role;
select tests.create_user() as c \gset user_c_
select tests.as_user(:'user_c_c');
select is_empty('select 1 from public.usage_days union all select 1 from public.credit_ledger union all select 1 from public.entitlements union all select 1 from public.referrals',
  'a new user sees no usage, credits, entitlements or referrals');

select tests.as_anon();
select throws_ok('select * from public.usage_days', '42501', null, 'anon cannot read usage_days');
select throws_ok('select * from public.credit_ledger', '42501', null, 'anon cannot read credit_ledger');
select throws_ok('select * from public.entitlements', '42501', null, 'anon cannot read entitlements');
select throws_ok('select * from public.referrals', '42501', null, 'anon cannot read referrals');
reset role;
select tests.clear_claims();

-- Constraints
select throws_ok(format($$ insert into public.usage_days (user_id, local_date, used) values (%L, '2026-10-31', -1) $$, :'user_a_a'), '23514', null, 'usage_days.used >= 0');
select throws_ok(format($$ insert into public.usage_days (user_id, local_date) values (%L, '2026-10-30') $$, :'user_a_a'), '23505', null, 'one usage row per user and local day');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 0, 'admin') $$, :'user_a_a'), '23514', null, 'credit_ledger.delta is never 0');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 5, 'gift') $$, :'user_a_a'), '23514', null, 'credit_ledger.reason is from the list');
select throws_ok(format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, -10, 'starter') $$, :'user_b_b'), '23514', null, 'starter credits are positive');
select throws_ok(format($$ update public.credit_ledger set delta = 99 where user_id = %L $$, :'user_a_a'), '23001', null, 'credit_ledger is append-only');
select throws_ok(format($$ update public.entitlements set expires_at = now() where user_id = %L and product = 'lifetime' $$, :'user_a_a'), '23514', null, 'lifetime never expires');
select throws_ok(format($$ insert into public.entitlements (user_id, product, is_trial) values (%L, 'annual', true) $$, :'user_a_a'), '23514', null, 'only weekly has a trial');
select throws_ok(format($$ insert into public.entitlements (user_id, product) values (%L, 'monthly') $$, :'user_a_a'), '23514', null, 'unknown product rejected');
select throws_ok(format($$ insert into public.referrals (code, owner_id) values ('short', %L) $$, :'user_a_a'), '23514', null, 'referral code is 8 chars from the safe alphabet');
select throws_ok(format($$ insert into public.referrals (code, owner_id) values ('OOOO1111', %L) $$, :'user_a_a'), '23514', null, 'look-alike characters are not used in codes');
select throws_ok(format($$ update public.referrals set redeemed_by = %L, redeemed_at = now() where code = 'AAAA2222' $$, :'user_a_a'), '23514', null, 'no self-redeem');
update public.referrals set redeemed_by = :'user_c_c', redeemed_at = now() where code = 'AAAA2222';
insert into public.referrals (code, owner_id) values ('DDDD5555', :'user_b_b');
select throws_ok(format($$ update public.referrals set redeemed_by = %L, redeemed_at = now() where code = 'DDDD5555' $$, :'user_c_c'), '23505', null, 'one redemption per user');
select throws_ok($$ update public.referrals set redeemed_by = null, redeemed_at = null, rewarded_at = now() where code = 'BBBB3333' $$, '23514', null, 'no reward without a redemption');

-- Owner deletion cascades
delete from auth.users where id = :'user_a_a';
select is_empty(format('select 1 from public.usage_days where user_id = %1$L union all select 1 from public.credit_ledger where user_id = %1$L union all select 1 from public.entitlements where user_id = %1$L union all select 1 from public.referrals where owner_id = %1$L', :'user_a_a'),
  'deleting a user removes their usage, credits, entitlements and codes');

select * from finish();
rollback;
