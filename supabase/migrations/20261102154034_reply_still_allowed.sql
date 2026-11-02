-- Mid-request re-check (code review): before a retry or a switch to the fallback provider, `reply`
-- asks again whether AI is still allowed for this user (consent not withdrawn, age confirmed,
-- minimum policy version) and, for keyboard requests, whether the device key is still live.
-- One cheap call; returns false for unknown users or keys.

create function public.reply_still_allowed(
  p_user_id uuid,
  p_min_policy_version text,
  p_device_key_id uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.ai_allowed(p_user_id, p_min_policy_version)
    and (
      p_device_key_id is null
      or exists (
        select 1 from public.device_keys k
        where k.id = p_device_key_id and k.user_id = p_user_id and k.revoked_at is null
      )
    );
$$;

revoke all on function public.reply_still_allowed(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reply_still_allowed(uuid, text, uuid) to service_role;
