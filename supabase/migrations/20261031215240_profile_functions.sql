-- Profile read and patch for the `profile` Edge Function. Service role only.

-- Profile plus the derived AI gate. Returns null for an unknown user.
create function public.profile_state(p_user_id uuid)
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
    'ai_enabled', public.ai_allowed(p.id)
  )
  from public.profiles p
  where p.id = p_user_id;
$$;

-- Null arguments leave a field unchanged. p_age_confirmed = true sets age_confirmed_at to the
-- server's now() the first time and keeps the first timestamp after that.
create function public.patch_profile(
  p_user_id uuid,
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
  return public.profile_state(p_user_id);
end;
$$;

revoke all on function public.profile_state(uuid) from public, anon, authenticated;
revoke all on function public.patch_profile(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.profile_state(uuid) to service_role;
grant execute on function public.patch_profile(uuid, boolean, text, text, text, text) to service_role;
