-- Device keys: create (gated on consent + age), revoke, and look up for `Authorization: Device`.
-- Service role only. The raw key never reaches the database; only its SHA-256 hex.

-- Create a key for p_platform. Requires ai_allowed(). Rotation: earlier active keys of the same
-- user and platform are revoked, so one install holds one live key per platform.
-- Returns {status: 'ok'|'ai_off'|'age_required'|'no_profile', key_id, created_at, rotated}.
create function public.create_device_key(p_user_id uuid, p_key_hash text, p_platform text)
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
  if not public.ai_allowed(p_user_id) then
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

-- Revoke one key (p_key_id) or all keys (p_key_id null) of p_user_id. Returns the count revoked.
create function public.revoke_device_keys(p_user_id uuid, p_key_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  update public.device_keys
  set revoked_at = now()
  where user_id = p_user_id
    and revoked_at is null
    and (p_key_id is null or id = p_key_id);
  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

-- Look up a key by hash for auth.ts. Touches last_used_at (at most once a minute) when the key is
-- live. Returns no row for an unknown hash.
create function public.lookup_device_key(p_key_hash text)
returns table (key_id uuid, user_id uuid, revoked boolean)
language plpgsql
set search_path = ''
as $$
begin
  update public.device_keys k
  set last_used_at = now()
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and (k.last_used_at is null or k.last_used_at < now() - interval '1 minute');

  return query
    select k.id, k.user_id, k.revoked_at is not null
    from public.device_keys k
    where k.key_hash = p_key_hash;
end;
$$;

revoke all on function public.create_device_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_device_keys(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lookup_device_key(text) from public, anon, authenticated;
grant execute on function public.create_device_key(uuid, text, text) to service_role;
grant execute on function public.revoke_device_keys(uuid, uuid) to service_role;
grant execute on function public.lookup_device_key(text) to service_role;
