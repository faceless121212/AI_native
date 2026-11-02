-- Quota fixes after code review (Prompt 3):
--  1. Rate limit under concurrency: consume_reply now takes its clock AFTER the row lock
--     (clock_timestamp()) and counts every request of the last 60 s with no upper bound. Before,
--     p_now defaulted to the transaction start, so rows committed by transactions that got the
--     lock first could be "newer" than p_now and were not counted (extra requests let through).
--     p_now stays as an optional fixed clock for pgTAP.
--  2. Credits are attributed per bucket: spend/refund rows carry bucket 'starter' | 'bonus', so a
--     refund always returns the credit to the bucket it came from (e.g. a starter refund after an
--     interleaved bonus spend). Rows written before this migration have no bucket; they can only
--     be starter spends/refunds (the old rules always spent starter first) and count as starter.
--  3. refund_reply no longer overwrites a failed quota lookup with status 'ok': the quota is
--     returned nested (null when it can't be computed).
--  4. The daily free allowance (3) has one source, public.daily_free_limit(), used by the
--     usage_days column default and by quota_state for days without a row.

create function public.daily_free_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;
revoke all on function public.daily_free_limit() from public, anon, authenticated;
grant execute on function public.daily_free_limit() to service_role;

alter table public.usage_days alter column free_limit set default public.daily_free_limit();

alter table public.credit_ledger
  add column bucket text check (bucket in ('starter', 'bonus'));
-- New spend/refund rows must say which bucket; NOT VALID: pre-migration rows (local only) are
-- exempt and counted as starter (see 2).
alter table public.credit_ledger
  add constraint credit_ledger_request_has_bucket
  check (request_id is null or bucket is not null) not valid;

create or replace function public.reply_credits(p_user_id uuid)
returns table (starter_left integer, bonus_left integer)
language sql
stable
set search_path = ''
as $$
  with t as (
    select
      coalesce(sum(l.delta) filter (where l.reason = 'starter'), 0)::integer as starter_granted,
      -- Referral and admin credits, and refunds not tied to a request.
      coalesce(sum(l.delta) filter (where l.reason <> 'starter' and l.request_id is null), 0)::integer as bonus_granted,
      coalesce(-sum(l.delta) filter (where l.request_id is not null and coalesce(l.bucket, 'starter') = 'starter'), 0)::integer as starter_used,
      coalesce(-sum(l.delta) filter (where l.request_id is not null and l.bucket = 'bonus'), 0)::integer as bonus_used
    from public.credit_ledger l
    where l.user_id = p_user_id
  )
  select greatest(0, t.starter_granted - t.starter_used), greatest(0, t.bonus_granted - t.bonus_used)
  from t;
$$;

create or replace function public.consume_reply(
  p_user_id uuid,
  p_local_date date,
  p_min_policy_version text,
  p_kind text,
  p_source text,
  p_tone text default null,
  p_relationship text default null,
  p_closeness integer default null,
  p_formality text default null,
  p_flirt text default null,
  p_safety_flags text[] default '{}',
  p_rate_limit integer default 20,
  p_now timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
  v_now timestamptz;
  v_date date;
  v_reset timestamptz;
  v_recent integer;
  v_oldest timestamptz;
  v_used integer;
  v_free_limit integer;
  v_plan text;
  v_cap integer;
  v_starter integer;
  v_bonus integer;
  v_charge text;
  v_request_id uuid;
begin
  -- Serializes with consent grant/withdraw and other consumes of this user.
  select p.timezone into v_tz from public.profiles p where p.id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;
  -- Clock read after the lock: sees every request committed before us.
  v_now := coalesce(p_now, clock_timestamp());

  if not public.ai_allowed(p_user_id, p_min_policy_version) then
    return jsonb_build_object('status', 'ai_off');
  end if;

  v_date := coalesce(p_local_date, (v_now at time zone v_tz)::date);
  v_reset := (v_date + 1)::timestamp at time zone v_tz;

  -- Rate limit across all instances: requests charged in the last 60 s (no upper bound).
  select count(*), min(r.created_at) into v_recent, v_oldest
  from public.ai_requests r
  where r.user_id = p_user_id
    and r.created_at > v_now - interval '60 seconds';
  if v_recent >= p_rate_limit then
    return jsonb_build_object(
      'status', 'rate',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '60 seconds' - v_now))))::integer
    );
  end if;

  insert into public.usage_days (user_id, local_date) values (p_user_id, v_date)
  on conflict (user_id, local_date) do nothing;
  select u.used, u.free_limit into v_used, v_free_limit
  from public.usage_days u
  where u.user_id = p_user_id and u.local_date = v_date
  for update;

  select rp.plan, rp.fair_use_cap into v_plan, v_cap from public.reply_plan(p_user_id, v_now) rp;

  if v_plan <> 'free' then
    if v_used >= v_cap then
      return jsonb_build_object('status', 'fair_use')
        || public.quota_snapshot(v_plan, v_cap, v_used, v_free_limit, null, null, v_reset);
    end if;
    v_charge := 'paid';
  else
    select c.starter_left, c.bonus_left into v_starter, v_bonus from public.reply_credits(p_user_id) c;
    if v_starter > 0 then
      v_charge := 'starter';
    elsif v_used < v_free_limit then
      v_charge := 'daily';
    elsif v_bonus > 0 then
      v_charge := 'bonus';
    else
      return jsonb_build_object('status', 'quota_empty')
        || public.quota_snapshot(v_plan, v_cap, v_used, v_free_limit, v_starter, v_bonus, v_reset);
    end if;
  end if;

  insert into public.ai_requests (
    user_id, kind, source, tone, relationship, closeness, formality, flirt, safety_flags,
    status, charge, charge_date, created_at
  )
  values (
    p_user_id, p_kind, p_source, p_tone, p_relationship, p_closeness, p_formality, p_flirt,
    coalesce(p_safety_flags, '{}'), 'started', v_charge, v_date, v_now
  )
  returning id into v_request_id;

  if v_charge in ('daily', 'paid') then
    update public.usage_days set used = used + 1
    where user_id = p_user_id and local_date = v_date;
    v_used := v_used + 1;
  else
    insert into public.credit_ledger (user_id, delta, reason, request_id, bucket)
    values (p_user_id, -1, 'spend', v_request_id, v_charge);
    if v_charge = 'starter' then
      v_starter := v_starter - 1;
    else
      v_bonus := v_bonus - 1;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'request_id', v_request_id,
    'charge', v_charge,
    'local_date', v_date
  ) || public.quota_snapshot(v_plan, v_cap, v_used, v_free_limit, v_starter, v_bonus, v_reset);
end;
$$;

create or replace function public.quota_state(p_user_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_date date;
  v_used integer;
  v_free_limit integer;
  v_plan text;
  v_cap integer;
  v_starter integer;
  v_bonus integer;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'no_profile');
  end if;
  v_date := (p_now at time zone v_tz)::date;

  select u.used, u.free_limit into v_used, v_free_limit
  from public.usage_days u
  where u.user_id = p_user_id and u.local_date = v_date;
  v_used := coalesce(v_used, 0);
  v_free_limit := coalesce(v_free_limit, public.daily_free_limit());

  select rp.plan, rp.fair_use_cap into v_plan, v_cap from public.reply_plan(p_user_id, p_now) rp;
  select c.starter_left, c.bonus_left into v_starter, v_bonus from public.reply_credits(p_user_id) c;

  return jsonb_build_object('status', 'ok')
    || public.quota_snapshot(v_plan, v_cap, v_used, v_free_limit,
         case when v_plan = 'free' then v_starter end,
         case when v_plan = 'free' then v_bonus end,
         (v_date + 1)::timestamp at time zone v_tz);
end;
$$;

-- Returns {status: 'ok', charge, quota: <quota_state or null>} | {status: 'already_refunded' |
-- 'not_charged' | 'not_found'}.
create or replace function public.refund_reply(p_request_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_req public.ai_requests;
  v_quota jsonb;
begin
  select * into v_req from public.ai_requests r where r.id = p_request_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_req.refunded_at is not null then
    return jsonb_build_object('status', 'already_refunded', 'charge', v_req.charge);
  end if;
  if v_req.charge is null then
    return jsonb_build_object('status', 'not_charged');
  end if;

  if v_req.charge in ('daily', 'paid') then
    update public.usage_days set used = greatest(used - 1, 0)
    where user_id = v_req.user_id and local_date = v_req.charge_date;
  else
    insert into public.credit_ledger (user_id, delta, reason, request_id, bucket)
    values (v_req.user_id, 1, 'refund', p_request_id, v_req.charge);
  end if;

  update public.ai_requests set refunded_at = now() where id = p_request_id;

  v_quota := public.quota_state(v_req.user_id, now());
  return jsonb_build_object(
    'status', 'ok',
    'charge', v_req.charge,
    'quota', case when v_quota ->> 'status' = 'ok' then v_quota - 'status' end
  );
end;
$$;
