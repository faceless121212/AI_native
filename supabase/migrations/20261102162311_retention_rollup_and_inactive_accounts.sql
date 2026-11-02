-- Retention additions (user decisions, Prompt 3), in run_retention (daily, pg_cron):
--  1. credit_ledger: spend/refund rows older than 90 days → one 'rollup' row per user and bucket
--     (merged with that user's earlier rollup), balances unchanged. Idempotent.
--  2. Inactive anonymous accounts: auth users with no sign-in / session activity, no reply request
--     and no device-key use for 12 months are deleted; every user table cascades from
--     auth.users → profiles. Never deleted: users with an active subscription (weekly/annual,
--     active, not expired) or ANY lifetime / lifetime_upgrade entitlement.
--     Deleting from auth.users in SQL works locally and for the postgres role that runs pg_cron;
--     on hosted Supabase confirm it (the documented way is the Auth admin API, deleteUser).
--
-- "No reply request" needs a marker that outlives ai_requests (90 days): profiles.last_reply_at,
-- set by a trigger when consume_reply creates a request row.

alter table public.profiles add column last_reply_at timestamptz;
comment on column public.profiles.last_reply_at is 'Time of the latest AI request; only used for the inactive-account purge.';

create function public.ai_requests_touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles
  set last_reply_at = greatest(coalesce(last_reply_at, new.created_at), new.created_at)
  where id = new.user_id;
  return new;
end;
$$;
revoke all on function public.ai_requests_touch_profile() from public, anon, authenticated;

create trigger ai_requests_touch_profile
  after insert on public.ai_requests
  for each row execute function public.ai_requests_touch_profile();

-- Users that count as inactive at p_now (exposed for tests and for a dry run).
create function public.inactive_accounts(p_now timestamptz, p_after interval default interval '12 months')
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
        and (
          e.product in ('lifetime', 'lifetime_upgrade')
          or (e.product in ('weekly', 'annual') and e.active and (e.expires_at is null or e.expires_at > p_now))
        )
    );
$$;
revoke all on function public.inactive_accounts(timestamptz, interval) from public, anon, authenticated;

-- security definer: deleting auth users needs the owner's (postgres) rights; the function stays
-- executable by service_role only (pg_cron runs it as postgres).
create or replace function public.run_retention(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ai_cutoff timestamptz := p_now - interval '90 days';
  v_usage_cutoff date := (p_now at time zone 'UTC')::date - 90;
  v_year_cutoff timestamptz := p_now - interval '12 months';
  v_ai integer;
  v_usage integer;
  v_events integer;
  v_support integer;
  v_ledger integer;
  v_accounts integer;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = 'invalid_parameter_value';
  end if;

  with purged as (
    delete from public.ai_requests r
    where r.created_at < v_ai_cutoff
    returning r.created_at, r.kind, r.source, r.lang, r.provider, r.model, r.prompt_version,
              r.status, r.tokens_in, r.tokens_out, r.cost_micro_eur
  ),
  folded as (
    insert into public.ai_requests_daily as d
      (date, kind, source, lang, provider, model, prompt_version, status,
       requests, tokens_in, tokens_out, cost_micro_eur)
    select (p.created_at at time zone 'UTC')::date, p.kind, p.source, p.lang, p.provider, p.model,
           p.prompt_version, p.status, count(*), sum(p.tokens_in), sum(p.tokens_out), sum(p.cost_micro_eur)
    from purged p
    group by 1, 2, 3, 4, 5, 6, 7, 8
    on conflict on constraint ai_requests_daily_key do update set
      requests = d.requests + excluded.requests,
      tokens_in = d.tokens_in + excluded.tokens_in,
      tokens_out = d.tokens_out + excluded.tokens_out,
      cost_micro_eur = d.cost_micro_eur + excluded.cost_micro_eur
    returning 1
  )
  select (select count(*) from purged) into v_ai;

  delete from public.usage_days where local_date < v_usage_cutoff;
  get diagnostics v_usage = row_count;

  delete from public.reply_events where created_at < v_year_cutoff;
  get diagnostics v_events = row_count;

  delete from public.support_messages where created_at < v_year_cutoff;
  get diagnostics v_support = row_count;

  -- Credit ledger: fold per-reply rows older than 90 days (plus the user's earlier rollup) into
  -- one rollup row per user and bucket. Only users with newly aged rows are touched.
  with users_to_fold as (
    select distinct l.user_id from public.credit_ledger l
    where l.created_at < v_ai_cutoff and l.reason in ('spend', 'refund') and l.request_id is not null
  ),
  old as (
    delete from public.credit_ledger l
    using users_to_fold f
    where l.user_id = f.user_id
      and l.created_at < v_ai_cutoff
      and ((l.reason in ('spend', 'refund') and l.request_id is not null) or l.reason = 'rollup')
    returning l.user_id, coalesce(l.bucket, 'starter') as bucket, l.delta, l.reason
  ),
  sums as (
    select o.user_id, o.bucket, sum(o.delta)::integer as delta from old o group by 1, 2
  ),
  inserted as (
    insert into public.credit_ledger (user_id, delta, reason, bucket, created_at)
    select s.user_id, s.delta, 'rollup', s.bucket, v_ai_cutoff from sums s where s.delta <> 0
    returning 1
  )
  select count(*) filter (where o.reason <> 'rollup') into v_ledger from old o;

  -- Inactive anonymous accounts (cascade deletes every row of the user).
  delete from auth.users u where u.id in (select public.inactive_accounts(p_now));
  get diagnostics v_accounts = row_count;

  return jsonb_build_object(
    'ai_requests', v_ai,
    'usage_days', v_usage,
    'reply_events', v_events,
    'support_messages', v_support,
    'credit_rows_folded', v_ledger,
    'inactive_accounts', v_accounts
  );
end;
$$;
