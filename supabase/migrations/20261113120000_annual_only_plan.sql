-- Annual only (product decision 2026-11-13, spec §6): the weekly, lifetime and lifetime_upgrade
-- products are removed everywhere. One product, `annual`, with a 3-day free trial
-- (introductory offer). Subscribers keep the silent 300 replies/day abuse cap (spec §5); the
-- lifetime-only 100/day cap goes with the lifetime product.
--
-- Nothing was sold before this change (RevenueCat is wired in Prompt 8), so no entitlement rows
-- for the removed products exist. If one did, the new product check below would fail the
-- migration rather than silently drop a purchase.

-- Stop with a clear message if any row for a removed product exists (staging or production).
do $$
begin
  if exists (select 1 from public.entitlements where product <> 'annual') then
    raise exception 'entitlements has weekly/lifetime rows; migrate them before 20261113120000';
  end if;
  if exists (select 1 from public.support_messages where plan not in ('free', 'annual')) then
    raise exception 'support_messages has weekly/lifetime plans; migrate them before 20261113120000';
  end if;
end
$$;

-- entitlements: annual only; the trial now belongs to annual; the lifetime constraint goes with
-- the lifetime products.
alter table public.entitlements
  drop constraint entitlements_product_check,
  drop constraint entitlements_lifetime_never_expires,
  drop constraint entitlements_trial_weekly_only,
  add constraint entitlements_product_check check (product = 'annual'),
  add constraint entitlements_trial_has_end check (not is_trial or trial_ends_at is not null);

comment on table public.entitlements is
  'Store entitlements (product annual only). Readable by its owner; written only by the RevenueCat webhook.';

-- support_messages.plan: what the user was on when they wrote.
alter table public.support_messages
  drop constraint support_messages_plan_check,
  add constraint support_messages_plan_check check (plan in ('free', 'annual'));

-- Plan and fair-use cap from active, unexpired entitlements. Always one row: ('free', null) or
-- ('annual', 300). Same signature as before, so consume_reply and quota_state keep calling it.
create or replace function public.reply_plan(p_user_id uuid, p_now timestamptz)
returns table (plan text, fair_use_cap integer)
language sql
stable
set search_path = ''
as $$
  select
    case when count(*) > 0 then 'annual' else 'free' end,
    case when count(*) > 0 then 300 end::integer
  from public.entitlements e
  where e.user_id = p_user_id
    and e.product = 'annual'
    and e.active
    and (e.expires_at is null or e.expires_at > p_now);
$$;

-- Inactive accounts: unchanged rule, but only an active, unexpired annual subscription keeps an
-- otherwise inactive account (there is no lifetime purchase any more).
create or replace function public.inactive_accounts(p_now timestamptz, p_after interval default interval '12 months')
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
  where greatest(
      u.created_at,
      u.last_sign_in_at,
      p.last_reply_at,
      (select max(greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'))
         from auth.sessions s where s.user_id = u.id),
      (select max(r.updated_at) from auth.refresh_tokens r where r.user_id = u.id::text),
      (select max(k.last_used_at) from public.device_keys k where k.user_id = u.id)
    ) < p_now - p_after
    and not exists (
      select 1 from public.entitlements e
      where e.user_id = u.id
        and e.product = 'annual'
        and e.active
        and (e.expires_at is null or e.expires_at > p_now)
    );
$$;
