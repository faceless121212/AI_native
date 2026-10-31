-- AI consent must be for a policy version the server accepts (privacy + code review, Prompt 2).
-- The accepted versions live in supabase/functions/_shared/policy.ts (single source of truth);
-- the minimum version is passed into every gate function as a required parameter, so no caller
-- can forget it. Versions are dates, "YYYY-MM-DD", compared as text (lexicographic = by date).
-- Consents recorded under any other format (e.g. local "v1" rows) never satisfy the gate.
--
-- Replaces functions from 20261031215238/39/40 with new signatures; the old signatures are
-- dropped so nothing can call the ungated versions.

drop function public.profile_state(uuid);
drop function public.patch_profile(uuid, boolean, text, text, text, text);
drop function public.create_device_key(uuid, text, text);
drop function public.grant_ai_consent(uuid, text);
drop function public.ai_allowed(uuid);

create function public.is_ai_policy_version(p_version text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', false);
$$;

-- True when age is confirmed and the latest ai_sharing consent is not withdrawn and is for a
-- policy version >= p_min_policy_version (CLAUDE.md rule 6).
create function public.ai_allowed(p_user_id uuid, p_min_policy_version text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_ai_policy_version(p_min_policy_version) then
    raise exception 'invalid minimum policy version' using errcode = 'invalid_parameter_value';
  end if;
  return coalesce(
    (
      select p.age_confirmed_at is not null
        and coalesce(
          (
            select c.withdrawn_at is null
              and public.is_ai_policy_version(c.policy_version)
              and c.policy_version >= p_min_policy_version
            from public.consents c
            where c.user_id = p.id and c.kind = 'ai_sharing'
            order by c.granted_at desc, c.id desc
            limit 1
          ),
          false
        )
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
end;
$$;

-- Grant consent for p_policy_version (already checked against the accepted list by the Edge
-- Function; checked again here for format and minimum). Same rules as before otherwise:
-- idempotent for the same version, starter credits once ever.
-- Returns {status: 'ok'|'age_required'|'no_profile'|'unknown_policy_version', consent_id,
--          policy_version, granted_at, starter_granted, ai_enabled}.
create function public.grant_ai_consent(p_user_id uuid, p_policy_version text, p_min_policy_version text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_age_confirmed_at timestamptz;
  v_consent public.consents;
  v_rows integer;
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

  insert into public.credit_ledger (user_id, delta, reason)
  values (p_user_id, 10, 'starter')
  on conflict (user_id) where reason = 'starter' do nothing;
  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'consent_id', v_consent.id,
    'policy_version', v_consent.policy_version,
    'granted_at', v_consent.granted_at,
    'starter_granted', v_rows > 0,
    'ai_enabled', public.ai_allowed(p_user_id, p_min_policy_version)
  );
end;
$$;

-- Create a device key; requires ai_allowed(user, minimum version). Rotation per platform as before.
create function public.create_device_key(
  p_user_id uuid,
  p_key_hash text,
  p_platform text,
  p_min_policy_version text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_age_confirmed_at timestamptz;
  v_key public.device_keys;
  v_rotated integer;
begin
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
  if not public.ai_allowed(p_user_id, p_min_policy_version) then
    return jsonb_build_object('status', 'ai_off');
  end if;

  update public.device_keys
  set revoked_at = now()
  where user_id = p_user_id and platform = p_platform and revoked_at is null;
  get diagnostics v_rotated = row_count;

  insert into public.device_keys (user_id, key_hash, platform)
  values (p_user_id, p_key_hash, p_platform)
  returning * into v_key;

  return jsonb_build_object(
    'status', 'ok',
    'key_id', v_key.id,
    'created_at', v_key.created_at,
    'rotated', v_rotated
  );
end;
$$;

create function public.profile_state(p_user_id uuid, p_min_policy_version text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'ui_lang', p.ui_lang,
    'i_am', p.i_am,
    'they_are', p.they_are,
    'age_confirmed_at', p.age_confirmed_at,
    'timezone', p.timezone,
    'created_at', p.created_at,
    'ai_enabled', public.ai_allowed(p.id, p_min_policy_version)
  )
  from public.profiles p
  where p.id = p_user_id;
$$;

create function public.patch_profile(
  p_user_id uuid,
  p_min_policy_version text,
  p_age_confirmed boolean default null,
  p_ui_lang text default null,
  p_i_am text default null,
  p_they_are text default null,
  p_timezone text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles p
  set
    age_confirmed_at = case when p_age_confirmed then coalesce(p.age_confirmed_at, now()) else p.age_confirmed_at end,
    ui_lang = coalesce(p_ui_lang, p.ui_lang),
    i_am = coalesce(p_i_am, p.i_am),
    they_are = coalesce(p_they_are, p.they_are),
    timezone = coalesce(p_timezone, p.timezone)
  where p.id = p_user_id;
  if not found then
    return null;
  end if;
  return public.profile_state(p_user_id, p_min_policy_version);
end;
$$;

revoke all on function public.is_ai_policy_version(text) from public, anon, authenticated;
revoke all on function public.ai_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_ai_consent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_device_key(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.profile_state(uuid, text) from public, anon, authenticated;
revoke all on function public.patch_profile(uuid, text, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.is_ai_policy_version(text) to service_role;
grant execute on function public.ai_allowed(uuid, text) to service_role;
grant execute on function public.grant_ai_consent(uuid, text, text) to service_role;
grant execute on function public.create_device_key(uuid, text, text, text) to service_role;
grant execute on function public.profile_state(uuid, text) to service_role;
grant execute on function public.patch_profile(uuid, text, boolean, text, text, text, text) to service_role;
