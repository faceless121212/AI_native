-- Decision (user, Prompt 3): the 10 starter replies are granted on install (spec §5), i.e. when
-- the profile is created at anonymous sign-up, not on first AI consent. Still exactly once per
-- user (partial unique index credit_ledger_one_starter_per_user). Spending them still needs AI
-- consent and 18+ (consume_reply checks ai_allowed). grant_ai_consent no longer touches credits.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.credit_ledger (user_id, delta, reason)
  values (new.id, 10, 'starter')
  on conflict (user_id) where reason = 'starter' do nothing;
  return new;
end;
$$;

-- Existing profiles (local/dev data) get theirs too, so every profile has its starter row.
insert into public.credit_ledger (user_id, delta, reason)
select p.id, 10, 'starter' from public.profiles p
on conflict (user_id) where reason = 'starter' do nothing;

-- Same as before minus the starter credits. Returns {status: 'ok'|'age_required'|'no_profile'|
-- 'unknown_policy_version', consent_id, policy_version, granted_at, ai_enabled}.
create or replace function public.grant_ai_consent(p_user_id uuid, p_policy_version text, p_min_policy_version text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_age_confirmed_at timestamptz;
  v_consent public.consents;
begin
  if not public.is_ai_policy_version(p_min_policy_version) then
    raise exception 'invalid minimum policy version' using errcode = 'invalid_parameter_value';
  end if;
  if not public.is_ai_policy_version(p_policy_version) or p_policy_version < p_min_policy_version then
    return jsonb_build_object('status', 'unknown_policy_version');
  end if;

  select p.age_confirmed_at into v_age_confirmed_at
  from public.profiles p
  where p.id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;
  if v_age_confirmed_at is null then
    return jsonb_build_object('status', 'age_required');
  end if;

  select c.* into v_consent
  from public.consents c
  where c.user_id = p_user_id and c.kind = 'ai_sharing'
  order by c.granted_at desc, c.id desc
  limit 1;

  if v_consent.id is null
     or v_consent.withdrawn_at is not null
     or v_consent.policy_version <> p_policy_version then
    insert into public.consents (user_id, kind, policy_version)
    values (p_user_id, 'ai_sharing', p_policy_version)
    returning * into v_consent;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'consent_id', v_consent.id,
    'policy_version', v_consent.policy_version,
    'granted_at', v_consent.granted_at,
    'ai_enabled', public.ai_allowed(p_user_id, p_min_policy_version)
  );
end;
$$;
