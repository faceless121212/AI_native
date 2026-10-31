-- AI consent: gate check, grant (with the one-time starter credits) and withdraw.
-- Called only by Edge Functions with the service role. Every function locks the user's profiles
-- row first, so grant, withdraw and device-key creation for one user are serialized.

-- True when age is confirmed and the latest ai_sharing consent isn't withdrawn (CLAUDE.md rule 6).
create function public.ai_allowed(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select p.age_confirmed_at is not null
        and coalesce(
          (
            select c.withdrawn_at is null
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
$$;

-- Grant consent for p_policy_version. Idempotent: if the latest consent is active with the same
-- version, no new row. Starter credits (+10) are added on the first grant ever, never again
-- (partial unique index credit_ledger_one_starter_per_user makes this safe under concurrency).
-- Returns {status: 'ok'|'age_required'|'no_profile', consent_id, policy_version, granted_at,
--          starter_granted, ai_enabled}.
create function public.grant_ai_consent(p_user_id uuid, p_policy_version text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_age_confirmed_at timestamptz;
  v_consent public.consents;
  v_rows integer;
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
    'ai_enabled', true
  );
end;
$$;

-- Withdraw: marks every active ai_sharing consent withdrawn and revokes all the user's device
-- keys in the same transaction, so the keyboard stops working at once (CLAUDE.md rule 6).
-- Returns {status: 'ok'|'no_profile', withdrawn_at, withdrawn, revoked_device_keys}.
create function public.withdraw_ai_consent(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_withdrawn integer;
  v_revoked integer;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;

  update public.consents
  set withdrawn_at = now()
  where user_id = p_user_id and kind = 'ai_sharing' and withdrawn_at is null;
  get diagnostics v_withdrawn = row_count;

  update public.device_keys
  set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'withdrawn_at', now(),
    'withdrawn', v_withdrawn,
    'revoked_device_keys', v_revoked
  );
end;
$$;

revoke all on function public.ai_allowed(uuid) from public, anon, authenticated;
revoke all on function public.grant_ai_consent(uuid, text) from public, anon, authenticated;
revoke all on function public.withdraw_ai_consent(uuid) from public, anon, authenticated;
grant execute on function public.ai_allowed(uuid) to service_role;
grant execute on function public.grant_ai_consent(uuid, text) to service_role;
grant execute on function public.withdraw_ai_consent(uuid) to service_role;
