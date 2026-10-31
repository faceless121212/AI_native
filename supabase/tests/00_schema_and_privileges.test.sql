-- Schema shape, RLS switched on everywhere, and who may touch what (architecture §8).
begin;
\ir _helpers.psql
select plan(30);

select tables_are('public', array[
  'profiles', 'consents', 'device_keys', 'usage_days', 'credit_ledger', 'entitlements',
  'ai_requests', 'reply_events', 'referrals', 'support_messages', 'provider_status'
], 'public has exactly the architecture §8 tables');
select views_are('public', array['daily_cost'], 'public has exactly the daily_cost view');

select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'RLS is enabled on every public table');

select is_empty($$
  select c.relname || ':' || p.priv
  from pg_class c
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')
    and has_table_privilege('anon', c.oid, p.priv)
$$, 'anon has no privilege on any public table or view');

select set_eq($$
  select c.relname || ':' || p.priv
  from pg_class c
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')
    and has_table_privilege('authenticated', c.oid, p.priv)
$$, $$
  values ('profiles:SELECT'), ('consents:SELECT'), ('entitlements:SELECT'),
         ('usage_days:SELECT'), ('credit_ledger:SELECT'), ('referrals:SELECT')
$$, 'authenticated may only SELECT the six owner-readable tables');

select is_empty($$
  select s.relname from pg_class s
  where s.relnamespace = 'public'::regnamespace and s.relkind = 'S'
    and (has_sequence_privilege('anon', s.oid, 'USAGE') or has_sequence_privilege('authenticated', s.oid, 'USAGE'))
$$, 'no public sequence is usable by anon or authenticated');

select is_empty($$
  select p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
$$, 'no public function is executable by anon or authenticated');

select is_empty($$
  select p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as c where c like 'search_path=%')
$$, 'every public function pins search_path');

-- Policies per table: owner SELECT on six tables, none on the server-only tables.
select policies_are('public', 'profiles', array['profiles: owner can read']);
select policies_are('public', 'consents', array['consents: owner can read']);
select policies_are('public', 'usage_days', array['usage_days: owner can read']);
select policies_are('public', 'credit_ledger', array['credit_ledger: owner can read']);
select policies_are('public', 'entitlements', array['entitlements: owner can read']);
select policies_are('public', 'referrals', array['referrals: owner can read own codes']);
select is_empty($$
  select tablename from pg_policies
  where schemaname = 'public'
    and tablename in ('ai_requests', 'reply_events', 'device_keys', 'support_messages', 'provider_status')
$$, 'server-only tables have no policies');
select is_empty($$
  select policyname from pg_policies
  where schemaname = 'public' and (cmd <> 'SELECT' or roles <> array['authenticated']::name[])
$$, 'every policy is a SELECT policy for authenticated only');

-- No message text: exact column lists for ai_requests and reply_events.
select columns_are('public', 'ai_requests', array[
  'id', 'user_id', 'kind', 'source', 'lang', 'tone', 'relationship', 'closeness', 'formality',
  'flirt', 'provider', 'model', 'prompt_version', 'tokens_in', 'tokens_out', 'cost_micro_eur',
  'ms_first', 'ms_total', 'status', 'safety_flags', 'created_at'
], 'ai_requests has only metadata columns');
select columns_are('public', 'reply_events', array[
  'id', 'request_id', 'user_id', 'card_index', 'type', 'created_at'
], 'reply_events has only metadata columns');
select is_empty($$
  select a.attrelid::regclass || '.' || a.attname
  from pg_attribute a
  where a.attrelid in ('public.ai_requests'::regclass, 'public.reply_events'::regclass)
    and a.attnum > 0 and not a.attisdropped
    and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'text[]'::regtype, 'json'::regtype, 'jsonb'::regtype)
    and not exists (
      select 1 from pg_constraint k
      where k.conrelid = a.attrelid and k.contype = 'c' and a.attnum = any(k.conkey)
    )
$$, 'every text-like column in ai_requests and reply_events is constrained by a check');

select ok(
  (select 'security_invoker=true' = any(c.reloptions) from pg_class c where c.oid = 'public.daily_cost'::regclass),
  'daily_cost is security_invoker'
);

select has_trigger('auth', 'users', 'on_auth_user_created', 'auth.users has the profile trigger');
select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'public.handle_new_user'::regproc),
  'handle_new_user is security definer'
);

select has_trigger('public', 'profiles', 'profiles_set_updated_at', 'profiles keeps updated_at current');
select has_trigger('public', 'consents', 'consents_set_updated_at', 'consents keeps updated_at current');
select has_trigger('public', 'device_keys', 'device_keys_set_updated_at', 'device_keys keeps updated_at current');
select has_trigger('public', 'usage_days', 'usage_days_set_updated_at', 'usage_days keeps updated_at current');
select has_trigger('public', 'entitlements', 'entitlements_set_updated_at', 'entitlements keeps updated_at current');
select has_trigger('public', 'referrals', 'referrals_set_updated_at', 'referrals keeps updated_at current');
select has_trigger('public', 'provider_status', 'provider_status_set_updated_at', 'provider_status keeps updated_at current');

-- updated_at really moves (the trigger overwrites whatever the writer sent).
select tests.create_user() as u \gset user_u_
update public.profiles set updated_at = '2000-01-01T00:00:00Z', ui_lang = 'it' where id = :'user_u_u';
select is((select updated_at from public.profiles where id = :'user_u_u'), now(), 'set_updated_at stamps now() on update');

select * from finish();
rollback;
