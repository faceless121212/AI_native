-- daily_cost: requests and cost per UTC day and provider. Admin only: security_invoker, so the
-- caller's rights on ai_requests apply, and no grants to anon or authenticated.

create view public.daily_cost
with (security_invoker = true)
as
select
  (r.created_at at time zone 'UTC')::date as date,
  r.provider,
  count(*)::bigint as requests,
  coalesce(sum(r.tokens_in), 0)::bigint as tokens_in,
  coalesce(sum(r.tokens_out), 0)::bigint as tokens_out,
  coalesce(sum(r.cost_micro_eur), 0)::bigint as cost_micro_eur
from public.ai_requests r
group by 1, 2;

comment on view public.daily_cost is 'Daily AI cost per provider. Service role / dashboard only.';

revoke all on table public.daily_cost from public, anon, authenticated;
grant select on table public.daily_cost to service_role;
