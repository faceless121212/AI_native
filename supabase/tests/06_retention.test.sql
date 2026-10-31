-- run_retention(now): fixed clock 2026-12-31 12:00 UTC.
--   ai_requests      older than 90 days (before 2026-10-02 12:00) → ai_requests_daily, then deleted
--   usage_days       local_date before 2026-10-02
--   reply_events     older than 12 months (before 2025-12-31 12:00)
--   support_messages older than 12 months
begin;
\ir _helpers.psql
select plan(16);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

insert into public.ai_requests (id, user_id, kind, source, lang, provider, model, prompt_version, tokens_in, tokens_out, cost_micro_eur, status, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', :'user_a_a', 'reply', 'keyboard', 'de', 'bedrock', 'model-a', 'v1', 100, 50, 300, 'ok', '2026-09-01T10:00:00Z'),
  ('a0000000-0000-4000-8000-000000000002', :'user_b_b', 'reply', 'keyboard', 'de', 'bedrock', 'model-a', 'v1', 200, 100, 600, 'ok', '2026-09-01T20:00:00Z'),
  ('a0000000-0000-4000-8000-000000000003', :'user_a_a', 'polish', 'app', null, 'mistral', 'model-m', 'v1', 10, 5, 20, 'error', '2026-09-02T08:00:00Z'),
  ('a0000000-0000-4000-8000-000000000004', :'user_a_a', 'reply', 'app', 'fr', 'bedrock', 'model-a', 'v1', 70, 30, 150, 'ok', '2026-10-02T12:00:01Z'),
  ('a0000000-0000-4000-8000-000000000005', :'user_b_b', 'reply', 'app', 'fr', 'bedrock', 'model-a', 'v1', 1, 1, 1, 'ok', '2026-12-30T09:00:00Z');
insert into public.reply_events (request_id, user_id, card_index, type, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', :'user_a_a', 0, 'inserted', '2026-09-01T10:01:00Z'),
  (null, :'user_a_a', 1, 'up', '2025-12-31T11:59:59Z'),
  (null, :'user_b_b', 2, 'down', '2025-12-31T12:00:01Z');
insert into public.usage_days (user_id, local_date, used)
values (:'user_a_a', '2026-10-01', 3), (:'user_a_a', '2026-10-02', 1), (:'user_b_b', '2026-12-31', 2);
insert into public.support_messages (user_id, body, created_at)
values (:'user_a_a', 'old', '2025-12-30T00:00:00Z'), (:'user_b_b', 'recent', '2026-01-15T00:00:00Z');

create temp table cost_before as select * from public.daily_cost;

select tests.as_service();
select is(public.run_retention('2026-12-31T12:00:00Z'),
  '{"ai_requests": 3, "usage_days": 1, "reply_events": 1, "support_messages": 1}'::jsonb,
  'run_retention reports what it removed');
reset role;

select set_eq('select id::text from public.ai_requests',
  $$ values ('a0000000-0000-4000-8000-000000000004'), ('a0000000-0000-4000-8000-000000000005') $$,
  'ai_requests: rows older than 90 days are gone, newer ones stay (cutoff is exclusive)');
select results_eq(
  $$ select date, kind, source, lang, provider, model, prompt_version, status, requests, tokens_in, tokens_out, cost_micro_eur
     from public.ai_requests_daily order by date, provider $$,
  $$ values
     ('2026-09-01'::date, 'reply'::text, 'keyboard'::text, 'de'::text, 'bedrock'::text, 'model-a'::text, 'v1'::text, 'ok'::text, 2::bigint, 300::bigint, 150::bigint, 900::bigint),
     ('2026-09-02'::date, 'polish', 'app', null, 'mistral', 'model-m', 'v1', 'error', 1, 10, 5, 20) $$,
  'purged requests are aggregated per UTC day and metadata, across users');
select is_empty('select 1 from information_schema.columns where table_schema = $$public$$ and table_name = $$ai_requests_daily$$ and column_name = $$user_id$$',
  'the aggregate keeps no user_id');
select set_eq('select * from public.daily_cost', 'select * from cost_before',
  'daily_cost totals are the same before and after the purge');

select results_eq($$ select request_id, type from public.reply_events order by created_at $$,
  $$ values (null::uuid, 'down'::text), (null::uuid, 'inserted'::text) $$,
  'reply_events: older than 12 months deleted; feedback for a purged request stays (request_id null)');
select set_eq('select local_date from public.usage_days', $$ values ('2026-10-02'::date), ('2026-12-31'::date) $$,
  'usage_days: local dates older than 90 days deleted');
select set_eq('select body from public.support_messages', $$ values ('recent') $$,
  'support_messages: older than 12 months deleted');

-- Idempotent: a second run removes nothing and changes no totals.
select tests.as_service();
select is(public.run_retention('2026-12-31T12:00:00Z'),
  '{"ai_requests": 0, "usage_days": 0, "reply_events": 0, "support_messages": 0}'::jsonb,
  'a second run on the same day removes nothing');
reset role;
select is((select sum(requests)::int from public.ai_requests_daily), 3, 'aggregate unchanged by the second run');

-- A later purge folds into the existing aggregate row (null columns match too).
insert into public.ai_requests (user_id, kind, source, lang, provider, model, prompt_version, tokens_in, tokens_out, cost_micro_eur, status, created_at)
values (:'user_a_a', 'reply', 'keyboard', 'de', 'bedrock', 'model-a', 'v1', 1, 1, 1, 'ok', '2026-09-01T23:00:00Z'),
       (:'user_a_a', 'polish', 'app', null, 'mistral', 'model-m', 'v1', 1, 1, 1, 'error', '2026-09-02T09:00:00Z');
select tests.as_service();
select is((public.run_retention('2026-12-31T12:00:00Z') ->> 'ai_requests')::int, 2, 'late rows are purged');
reset role;
select is((select requests::int from public.ai_requests_daily where date = '2026-09-01'), 3, 'folded into the existing day row');
select is((select requests::int from public.ai_requests_daily where date = '2026-09-02'), 2, 'rows with null lang fold too (nulls not distinct)');
select is((select count(*)::int from public.ai_requests_daily), 2, 'no duplicate aggregate rows');

select throws_ok($$ select public.run_retention(null) $$, '22023', null, 'the clock is required');

-- Clients cannot run it.
select tests.as_user(:'user_a_a');
select throws_ok($$ select public.run_retention(now()) $$, '42501', null, 'users cannot run retention');
reset role;

select * from finish();
rollback;
