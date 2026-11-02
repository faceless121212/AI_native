-- Decision (user, Prompt 3): "I am" / "They are" stay on the phone only. The client sends them
-- with each reply request (ReplyRequest.iAm / theyAre, used for the prompt, never stored); the
-- server no longer keeps them. Pre-launch, so the columns are dropped.

drop function public.patch_profile(uuid, text, boolean, text, text, text, text);
drop function public.profile_state(uuid, text);

alter table public.profiles drop column i_am, drop column they_are;

create function public.profile_state(p_user_id uuid, p_min_policy_version text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'ui_lang', p.ui_lang,
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
    timezone = coalesce(p_timezone, p.timezone)
  where p.id = p_user_id;
  if not found then
    return null;
  end if;
  return public.profile_state(p_user_id, p_min_policy_version);
end;
$$;

revoke all on function public.profile_state(uuid, text) from public, anon, authenticated;
revoke all on function public.patch_profile(uuid, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.profile_state(uuid, text) to service_role;
grant execute on function public.patch_profile(uuid, text, boolean, text, text) to service_role;
