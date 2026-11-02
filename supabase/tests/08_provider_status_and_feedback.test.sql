-- record_provider_failure (3 failures in 60 s → down 5 min) and record_reply_event.
begin;
\ir _helpers.psql
select plan(17);

-- Circuit breaker, fixed clock.
select is(public.record_provider_failure('anthropic', '2026-11-02T10:00:00Z'), null, '1st failure: still up');
select is(public.record_provider_failure('anthropic', '2026-11-02T10:00:20Z'), null, '2nd failure: still up');
select is(public.record_provider_failure('anthropic', '2026-11-02T10:00:59Z'), '2026-11-02T10:05:59Z'::timestamptz, '3rd failure within 60 s: down for 5 minutes');
select results_eq($$ select failure_count, window_started_at, last_error_at from public.provider_status where provider = 'anthropic' $$,
  $$ values (0, null::timestamptz, '2026-11-02T10:00:59Z'::timestamptz) $$, 'marking down starts a new window');
select is(public.record_provider_failure('mistral', '2026-11-02T10:00:00Z'), null, 'mistral 1st');
select is(public.record_provider_failure('mistral', '2026-11-02T10:00:30Z'), null, 'mistral 2nd');
select is(public.record_provider_failure('mistral', '2026-11-02T10:01:00Z'), null, '3rd failure 60 s after the 1st: new window, still up');
select is((select failure_count from public.provider_status where provider = 'mistral'), 1, 'window restarted at the 3rd failure');
select is((select down_until from public.provider_status where provider = 'bedrock'), null, 'other providers unaffected');
select throws_ok($$ select public.record_provider_failure('openai') $$, '23514', null, 'unknown provider rejected');
select tests.create_user() as u \gset x_
select tests.as_user(:'x_u');
select throws_ok($$ select public.record_provider_failure('bedrock') $$, '42501', null, 'users cannot mark providers down');
reset role;
select tests.clear_claims();

-- Feedback: own request, delivered card only, once per (card, type).
select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_
insert into public.ai_requests (id, user_id, kind, source, status, cards)
values ('11111111-1111-4111-8111-111111111111', :'user_a_a', 'reply', 'keyboard', 'ok', 3),
       ('22222222-2222-4222-8222-222222222222', :'user_a_a', 'reply', 'keyboard', 'error', 0),
       ('33333333-3333-4333-8333-333333333333', :'user_a_a', 'polish', 'keyboard', 'partial', 1);
select is(public.record_reply_event(:'user_a_a', '11111111-1111-4111-8111-111111111111', 2, 'inserted'), 'ok', 'own request, delivered card → ok');
select is(public.record_reply_event(:'user_a_a', '11111111-1111-4111-8111-111111111111', 2, 'inserted'), 'duplicate', 'same card and type again → duplicate');
select is(public.record_reply_event(:'user_b_b', '11111111-1111-4111-8111-111111111111', 0, 'up'), 'not_found', 'someone else''s request → not_found');
select is(public.record_reply_event(:'user_a_a', '22222222-2222-4222-8222-222222222222', 0, 'up'), 'not_found', 'failed request → not_found');
select is(public.record_reply_event(:'user_a_a', '33333333-3333-4333-8333-333333333333', 1, 'down'), 'not_found', 'card index beyond delivered cards → not_found');
select is((select count(*)::int from public.reply_events), 1, 'only the first event was stored');

select * from finish();
rollback;
