-- Reply quota (spec §5, architecture §7 step 4): consume_reply / refund_reply / quota_state.
--
-- Rules
--   free:  starter credits first, then the daily allowance (usage_days.free_limit, 3), then bonus
--          credits (referral/admin). Daily allowance resets at local midnight (profiles.timezone).
--   paid:  fair-use cap per local day: lifetime 100, weekly/annual 300 (the larger cap wins when
--          several entitlements are active). Plan from entitlements; no active row = free.
-- Every consume creates the ai_requests row (status 'started') and records what it charged, so
-- refund_reply(request_id) can give back exactly that. The user's profiles row and day row are
-- locked FOR UPDATE, so concurrent taps can't over-consume (tested in the Deno integration test
-- with parallel calls; pgTAP covers the sequential rules).
--
-- credit_ledger: spends are -1 rows (reason 'spend'), refunds +1 rows (reason 'refund') linked by
-- request_id. Starter credits are always spent before bonus credits (bonus is only used when the
-- daily allowance is gone, starter before that), so starter_left = starter granted - net spent.
-- request_id has no foreign key on purpose: credit_ledger is append-only (an ON DELETE SET NULL
-- would be an UPDATE) and ai_requests rows are purged after 90 days.

alter table public.credit_ledger drop constraint credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in ('starter', 'referral', 'refund', 'admin', 'spend'));
alter table public.credit_ledger
  add column request_id uuid,
  add constraint credit_ledger_spend_is_one check (reason <> 'spend' or (delta = -1 and request_id is not null)),
  add constraint credit_ledger_request_refund_is_one check (reason <> 'refund' or request_id is null or delta = 1);
create unique index credit_ledger_one_spend_per_request
  on public.credit_ledger (request_id) where reason = 'spend';
create unique index credit_ledger_one_refund_per_request
  on public.credit_ledger (request_id) where reason = 'refund';

-- What a request was charged against, and the delivered card count (for feedback checks).
alter table public.ai_requests
  add column charge text check (charge in ('starter', 'daily', 'bonus', 'paid')),
  add column charge_date date,
  add column refunded_at timestamptz,
  add column cards smallint check (cards between 0 and 3);

-- Plan and fair-use cap from active, unexpired entitlements. Always one row.
create function public.reply_plan(p_user_id uuid, p_now timestamptz)
returns table (plan text, fair_use_cap integer)
language sql
stable
set search_path = ''
as $$
  select
    case
      when bool_or(e.product in ('lifetime', 'lifetime_upgrade')) then 'lifetime'
      when bool_or(e.product = 'annual') then 'annual'
      when bool_or(e.product = 'weekly') then 'weekly'
      else 'free'
    end,
    max(case when e.product in ('lifetime', 'lifetime_upgrade') then 100 else 300 end)::integer
  from public.entitlements e
  where e.user_id = p_user_id
    and e.active
    and (e.expires_at is null or e.expires_at > p_now);
$$;

-- Starter and bonus credits left. Always one row.
create function public.reply_credits(p_user_id uuid)
returns table (starter_left integer, bonus_left integer)
language sql
stable
set search_path = ''
as $$
  with t as (
    select
      coalesce(sum(l.delta), 0)::integer as total,
      coalesce(sum(l.delta) filter (where l.reason = 'starter'), 0)::integer as starter,
      coalesce(-sum(l.delta) filter (where l.reason in ('spend', 'refund') and l.request_id is not null), 0)::integer as spent
    from public.credit_ledger l
    where l.user_id = p_user_id
  ),
  s as (
    select greatest(0, least(t.total, t.starter - t.spent)) as starter_left, t.total from t
  )
  select s.starter_left, greatest(0, s.total - s.starter_left) from s;
$$;

-- Quota snapshot as clients see it (QuotaEvent): left_today for free users counts everything they
-- can still use today (starter + daily + bonus); fair_use_left for paid users.
create function public.quota_snapshot(
  p_plan text,
  p_cap integer,
  p_used integer,
  p_free_limit integer,
  p_starter_left integer,
  p_bonus_left integer,
  p_reset_at timestamptz
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', p_plan,
    'left_today', case when p_plan = 'free'
      then coalesce(p_starter_left, 0) + greatest(0, p_free_limit - p_used) + coalesce(p_bonus_left, 0)
    end,
    'fair_use_left', case when p_plan <> 'free' then greatest(0, p_cap - p_used) end,
    'reset_at', p_reset_at
  );
$$;

-- Atomic gate + charge for one reply (Reply, More, chip update or Polish).
-- p_local_date null → today in profiles.timezone at p_now. p_now is a parameter so tests can
-- run with a fixed clock; the Edge Function leaves it at now().
-- Returns jsonb {status: 'ok'|'no_profile'|'ai_off'|'rate'|'quota_empty'|'fair_use', ...}; on 'ok'
-- also request_id, charge, local_date and the quota snapshot after this charge.
create function public.consume_reply(
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
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
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
  if not public.ai_allowed(p_user_id, p_min_policy_version) then
    return jsonb_build_object('status', 'ai_off');
  end if;

  v_date := coalesce(p_local_date, (p_now at time zone v_tz)::date);
  v_reset := (v_date + 1)::timestamp at time zone v_tz;

  -- Rate limit across all instances: requests charged in the last 60 s.
  select count(*), min(r.created_at) into v_recent, v_oldest
  from public.ai_requests r
  where r.user_id = p_user_id
    and r.created_at > p_now - interval '60 seconds'
    and r.created_at <= p_now;
  if v_recent >= p_rate_limit then
    return jsonb_build_object(
      'status', 'rate',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '60 seconds' - p_now))))::integer
    );
  end if;

  insert into public.usage_days (user_id, local_date) values (p_user_id, v_date)
  on conflict (user_id, local_date) do nothing;
  select u.used, u.free_limit into v_used, v_free_limit
  from public.usage_days u
  where u.user_id = p_user_id and u.local_date = v_date
  for update;

  select rp.plan, rp.fair_use_cap into v_plan, v_cap from public.reply_plan(p_user_id, p_now) rp;

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
    coalesce(p_safety_flags, '{}'), 'started', v_charge, v_date, p_now
  )
  returning id into v_request_id;

  if v_charge in ('daily', 'paid') then
    update public.usage_days set used = used + 1
    where user_id = p_user_id and local_date = v_date;
    v_used := v_used + 1;
  else
    insert into public.credit_ledger (user_id, delta, reason, request_id)
    values (p_user_id, -1, 'spend', v_request_id);
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

-- Quota as of p_now without charging (quota function, refund response).
create function public.quota_state(p_user_id uuid, p_now timestamptz default now())
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
  -- Column default for a day without a row yet.
  v_free_limit := coalesce(v_free_limit, 3);

  select rp.plan, rp.fair_use_cap into v_plan, v_cap from public.reply_plan(p_user_id, p_now) rp;
  select c.starter_left, c.bonus_left into v_starter, v_bonus from public.reply_credits(p_user_id) c;

  return jsonb_build_object('status', 'ok')
    || public.quota_snapshot(v_plan, v_cap, v_used, v_free_limit,
         case when v_plan = 'free' then v_starter end,
         case when v_plan = 'free' then v_bonus end,
         (v_date + 1)::timestamp at time zone v_tz);
end;
$$;

-- Gives back what consume_reply charged for p_request_id: a credit (+1 'refund') or one daily /
-- fair-use use on the charged local day. Idempotent (row lock + refunded_at + unique index).
-- Returns {status: 'ok'|'already_refunded'|'not_charged'|'not_found', charge, ...quota snapshot}.
create function public.refund_reply(p_request_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_req public.ai_requests;
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
    insert into public.credit_ledger (user_id, delta, reason, request_id)
    values (v_req.user_id, 1, 'refund', p_request_id);
  end if;

  update public.ai_requests set refunded_at = now() where id = p_request_id;

  return jsonb_build_object('charge', v_req.charge)
    || public.quota_state(v_req.user_id, now())
    || jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.reply_plan(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reply_credits(uuid) from public, anon, authenticated;
revoke all on function public.quota_snapshot(text, integer, integer, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_reply(uuid, date, text, text, text, text, text, integer, text, text, text[], integer, timestamptz) from public, anon, authenticated;
revoke all on function public.quota_state(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.refund_reply(uuid) from public, anon, authenticated;
grant execute on function public.reply_plan(uuid, timestamptz) to service_role;
grant execute on function public.reply_credits(uuid) to service_role;
grant execute on function public.quota_snapshot(text, integer, integer, integer, integer, integer, timestamptz) to service_role;
grant execute on function public.consume_reply(uuid, date, text, text, text, text, text, integer, text, text, text[], integer, timestamptz) to service_role;
grant execute on function public.quota_state(uuid, timestamptz) to service_role;
grant execute on function public.refund_reply(uuid) to service_role;
