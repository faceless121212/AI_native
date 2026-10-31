-- profiles: created by the auth trigger, owner-only reads, no client writes, server patch rules.
begin;
\ir _helpers.psql
select plan(22);

select tests.create_user() as a \gset user_a_
select tests.create_user() as b \gset user_b_
select tests.create_user(false) as c \gset user_c_

-- Trigger
select is((select count(*)::int from public.profiles where id in (:'user_a_a', :'user_b_b', :'user_c_c')), 3,
  'a profiles row is created for every new auth user (anonymous or not)');
select results_eq(
  format($$ select ui_lang, i_am, they_are, age_confirmed_at, timezone from public.profiles where id = %L $$, :'user_a_a'),
  $$ values ('en'::text, null::text, null::text, null::timestamptz, 'UTC'::text) $$,
  'new profile has defaults and no age confirmation');

-- RLS: owner reads own row only
select tests.as_user(:'user_a_a');
select results_eq('select id from public.profiles', format('values (%L::uuid)', :'user_a_a'),
  'user A sees only their own profile');
select is_empty(format('select 1 from public.profiles where id = %L', :'user_b_b'),
  'user A cannot see user B''s profile');
select throws_ok(format($$ update public.profiles set ui_lang = 'de' where id = %L $$, :'user_a_a'),
  '42501', null, 'user A cannot update even their own profile directly');
select throws_ok(format($$ update public.profiles set ui_lang = 'de' where id = %L $$, :'user_b_b'),
  '42501', null, 'user A cannot update user B''s profile');
select throws_ok(format($$ insert into public.profiles (id) values (%L) $$, gen_random_uuid()),
  '42501', null, 'user A cannot insert profiles');
select throws_ok(format($$ delete from public.profiles where id = %L $$, :'user_b_b'),
  '42501', null, 'user A cannot delete profiles');
select throws_ok('select tests.create_user()', '42501', null,
  'user A cannot insert into auth.users');

select tests.as_user(:'user_b_b');
select results_eq('select id from public.profiles', format('values (%L::uuid)', :'user_b_b'),
  'user B sees only their own profile');

select tests.as_anon();
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');

reset role;
select tests.clear_claims();

-- Server-side patch (service role via the profile Edge Function)
select tests.as_service();
select is(
  (public.patch_profile(:'user_a_a', p_ui_lang => 'de', p_i_am => 'woman', p_they_are => 'man', p_timezone => 'Europe/Berlin')
    - 'id' - 'created_at' - 'age_confirmed_at'),
  '{"ui_lang": "de", "i_am": "woman", "they_are": "man", "timezone": "Europe/Berlin", "ai_enabled": false}'::jsonb,
  'patch_profile updates the given fields and reports ai_enabled');
select ok((public.patch_profile(:'user_a_a', p_age_confirmed => true) ->> 'age_confirmed_at') is not null,
  'ageConfirmed sets age_confirmed_at from the server clock');
reset role;
-- A confirmation from earlier: confirming again must keep it.
update public.profiles set age_confirmed_at = '2026-01-01T00:00:00Z' where id = :'user_b_b';
select tests.as_service();
select is(
  (public.patch_profile(:'user_b_b', p_age_confirmed => true) ->> 'age_confirmed_at')::timestamptz,
  '2026-01-01T00:00:00Z'::timestamptz,
  'confirming age again keeps the first timestamp');
select throws_ok(
  format($$ update public.profiles set age_confirmed_at = now() + interval '1 day' where id = %L $$, :'user_a_a'),
  '23514', null, 'age_confirmed_at cannot be changed once set');
select is((public.patch_profile(:'user_b_b', p_ui_lang => 'fr') ->> 'ui_lang'), 'fr',
  'patching one field leaves the others');
select is((select timezone from public.profiles where id = :'user_b_b'), 'UTC', 'timezone unchanged');
select throws_ok(format($$ select public.patch_profile(%L, p_timezone => 'Mars/Olympus_Mons') $$, :'user_b_b'),
  '23514', null, 'unknown time zones are rejected');
select throws_ok(format($$ select public.patch_profile(%L, p_ui_lang => 'xx') $$, :'user_b_b'),
  '23514', null, 'unknown ui_lang is rejected');
select throws_ok(format($$ select public.patch_profile(%L, p_i_am => 'robot') $$, :'user_b_b'),
  '23514', null, 'unknown i_am is rejected');
select is(public.patch_profile(gen_random_uuid(), p_ui_lang => 'de'), null, 'unknown user → null');
reset role;

-- Deleting the auth user removes the profile (Delete my data path).
delete from auth.users where id = :'user_c_c';
select is_empty(format('select 1 from public.profiles where id = %L', :'user_c_c'),
  'deleting the auth user deletes the profile');

select * from finish();
rollback;
