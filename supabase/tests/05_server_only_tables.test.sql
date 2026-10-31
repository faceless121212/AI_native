-- ai_requests, reply_events, support_messages, provider_status, device_keys (see 03) and the
-- daily_cost view: no client can read or write them; RLS denies even if a grant slipped in;
-- metadata-only constraints.
begin;
\ir _helpers.psql
select plan(35);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_

insert into public.ai_requests (id, user_id, kind, source, lang, tone, relationship, closeness, formality, flirt, provider, model, prompt_version, tokens_in, tokens_out, cost_micro_eur, status)
values
  ('11111111-1111-4111-8111-111111111111', :'user_a_a', 'reply', 'keyboard', 'de', 'warm', 'friend', 3, 'casual', 'off', 'bedrock', 'eu.anthropic.claude-test-v1:0', 'v1', 120, 60, 450, 'ok'),
  ('22222222-2222-4222-8222-222222222222', :'user_b_b', 'polish', 'app', 'fr', 'calm', 'colleague', 2, 'formal', 'off', 'mistral', 'mistral-small-test', 'v1', 80, 40, 150, 'ok');
insert into public.reply_events (request_id, user_id, card_index, type)
values ('11111111-1111-4111-8111-111111111111', :'user_a_a', 0, 'inserted'),
       ('22222222-2222-4222-8222-222222222222', :'user_b_b', 1, 'up');
insert into public.support_messages (user_id, body, app_version, os, ui_lang, plan)
values (:'user_a_a', 'The keyboard does not show up.', '0.1.0', 'iOS 26.1', 'en', 'free');

-- authenticated: permission denied on every server-only object
select tests.as_user(:'user_a_a');
select throws_ok('select * from public.ai_requests', '42501', null, 'user cannot read ai_requests');
select throws_ok('select * from public.reply_events', '42501', null, 'user cannot read reply_events');
select throws_ok('select * from public.support_messages', '42501', null, 'user cannot read support_messages');
select throws_ok('select * from public.provider_status', '42501', null, 'user cannot read provider_status');
select throws_ok('select * from public.daily_cost', '42501', null, 'user cannot read daily_cost');
select throws_ok('select * from public.ai_requests_daily', '42501', null, 'user cannot read ai_requests_daily');
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source) values (%L, 'reply', 'app') $$, :'user_a_a'), '42501', null, 'user cannot insert ai_requests');
select throws_ok(format($$ insert into public.reply_events (user_id, card_index, type) values (%L, 0, 'up') $$, :'user_a_a'), '42501', null, 'user cannot insert reply_events');
select throws_ok(format($$ insert into public.support_messages (user_id, body) values (%L, 'hi') $$, :'user_a_a'), '42501', null, 'user cannot insert support_messages');
select throws_ok($$ update public.provider_status set down_until = now() $$, '42501', null, 'user cannot update provider_status');

-- anon: same
select tests.as_anon();
select throws_ok('select * from public.ai_requests', '42501', null, 'anon cannot read ai_requests');
select throws_ok('select * from public.reply_events', '42501', null, 'anon cannot read reply_events');
select throws_ok('select * from public.support_messages', '42501', null, 'anon cannot read support_messages');
select throws_ok('select * from public.provider_status', '42501', null, 'anon cannot read provider_status');
select throws_ok('select * from public.daily_cost', '42501', null, 'anon cannot read daily_cost');
select throws_ok('select * from public.ai_requests_daily', '42501', null, 'anon cannot read ai_requests_daily');
reset role;
select tests.clear_claims();

-- Defence in depth: even with a stray SELECT grant, RLS (no policies) returns nothing.
grant select on public.ai_requests, public.ai_requests_daily, public.reply_events, public.support_messages, public.provider_status, public.device_keys to authenticated;
select tests.as_user(:'user_a_a');
select is_empty('select 1 from public.ai_requests', 'RLS hides ai_requests even with a grant (A cannot see own or B''s)');
select is_empty('select 1 from public.reply_events', 'RLS hides reply_events even with a grant');
select is_empty('select 1 from public.support_messages', 'RLS hides support_messages even with a grant');
select is_empty('select 1 from public.provider_status', 'RLS hides provider_status even with a grant');
select is_empty('select 1 from public.device_keys', 'RLS hides device_keys even with a grant');
select is_empty('select 1 from public.ai_requests_daily', 'RLS hides ai_requests_daily even with a grant');
reset role;
select tests.clear_claims();

-- Service role sees everything; daily_cost aggregates per UTC day and provider.
select tests.as_service();
select is((select count(*)::int from public.ai_requests), 2, 'service role reads ai_requests');
select results_eq($$ select provider, requests, tokens_in, tokens_out, cost_micro_eur from public.daily_cost order by provider $$,
  $$ values ('bedrock'::text, 1::bigint, 120::bigint, 60::bigint, 450::bigint), ('mistral'::text, 1::bigint, 80::bigint, 40::bigint, 150::bigint) $$,
  'daily_cost sums requests, tokens and cost per provider');
select set_eq('select provider from public.provider_status', $$ values ('bedrock'), ('mistral') $$, 'provider_status has bedrock and mistral');
reset role;

-- Metadata-only constraints: no free text can be smuggled into ai_requests / reply_events.
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, model) values (%L, 'reply', 'app', 'hey how was your weekend?') $$, :'user_a_a'), '23514', null, 'ai_requests.model only accepts an identifier');
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, safety_flags) values (%L, 'reply', 'app', array['crisis', 'he said he would hurt me']) $$, :'user_a_a'), '23514', null, 'ai_requests.safety_flags only accepts known flags');
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, tone) values (%L, 'reply', 'app', 'sarcastic') $$, :'user_a_a'), '23514', null, 'ai_requests.tone is from the chip list');
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, closeness) values (%L, 'reply', 'app', 6) $$, :'user_a_a'), '23514', null, 'ai_requests.closeness is 1–5');
select throws_ok(format($$ insert into public.ai_requests (user_id, kind, source, status) values (%L, 'reply', 'app', 'whatever') $$, :'user_a_a'), '23514', null, 'ai_requests.status is from the list');
select throws_ok(format($$ insert into public.reply_events (user_id, card_index, type) values (%L, 3, 'up') $$, :'user_a_a'), '23514', null, 'reply_events.card_index is 0–2');
select throws_ok(format($$ insert into public.support_messages (user_id, body) values (%L, repeat('x', 2001)) $$, :'user_a_a'), '23514', null, 'support body is at most 2000 chars');
select throws_ok(format($$ insert into public.support_messages (user_id, body, reply_email) values (%L, 'hi', 'not an email') $$, :'user_a_a'), '23514', null, 'reply_email must look like an email');

-- Feedback outlives its request row (12 months vs 90 days).
delete from public.ai_requests where id = '11111111-1111-4111-8111-111111111111';
select results_eq(format($$ select request_id, type from public.reply_events where user_id = %L $$, :'user_a_a'),
  $$ values (null::uuid, 'inserted'::text) $$, 'deleting a request keeps its reply_events with request_id null');

-- Owner deletion cascades
delete from auth.users where id = :'user_b_b';
select is_empty(format('select 1 from public.ai_requests where user_id = %1$L union all select 1 from public.reply_events where user_id = %1$L', :'user_b_b'),
  'deleting a user removes their ai_requests and reply_events');

select * from finish();
rollback;
