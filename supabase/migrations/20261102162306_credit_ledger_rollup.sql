-- credit_ledger retention (user decision, Prompt 3): per-reply spend/refund rows older than 90 days
-- are folded by run_retention into one 'rollup' row per user and bucket, so balances stay exact
-- but no per-reply history older than 90 days remains. Grant rows (starter, referral, admin,
-- refunds not tied to a request) are kept as they are.
--   rollup: request_id null, bucket set, delta = the folded sum (any size, never 0).

alter table public.credit_ledger drop constraint credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in ('starter', 'referral', 'refund', 'admin', 'spend', 'rollup'));

alter table public.credit_ledger drop constraint credit_ledger_delta_check;
alter table public.credit_ledger add constraint credit_ledger_delta_check
  check (delta <> 0 and (reason = 'rollup' or delta between -1000 and 1000));

alter table public.credit_ledger add constraint credit_ledger_rollup_shape
  check (reason <> 'rollup' or (request_id is null and bucket is not null));

-- Rollups count as usage of their bucket (like the spend/refund rows they replace).
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
      coalesce(sum(l.delta) filter (
        where l.reason not in ('starter', 'rollup') and l.request_id is null
      ), 0)::integer as bonus_granted,
      coalesce(-sum(l.delta) filter (
        where (l.request_id is not null or l.reason = 'rollup') and coalesce(l.bucket, 'starter') = 'starter'
      ), 0)::integer as starter_used,
      coalesce(-sum(l.delta) filter (
        where (l.request_id is not null or l.reason = 'rollup') and l.bucket = 'bonus'
      ), 0)::integer as bonus_used
    from public.credit_ledger l
    where l.user_id = p_user_id
  )
  select greatest(0, t.starter_granted - t.starter_used), greatest(0, t.bonus_granted - t.bonus_used)
  from t;
$$;
