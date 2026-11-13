-- Subscriber fair-use cap: 100 replies a day (was 300). Decided by the user on 2026-11-13
-- (docs/decisions.md, docs/pricing.md: worst case ≈€11/year instead of ≈€33 against ≈€21 net).
-- Disclosed on the paywall ("Fair use: up to 100 replies a day") and in the terms (spec §5–6).
-- Same signature as before, so consume_reply and quota_state keep calling it.
create or replace function public.reply_plan(p_user_id uuid, p_now timestamptz)
returns table (plan text, fair_use_cap integer)
language sql
stable
set search_path = ''
as $$
  select
    case when count(*) > 0 then 'annual' else 'free' end,
    case when count(*) > 0 then 100 end::integer
  from public.entitlements e
  where e.user_id = p_user_id
    and e.product = 'annual'
    and e.active
    and (e.expires_at is null or e.expires_at > p_now);
$$;
