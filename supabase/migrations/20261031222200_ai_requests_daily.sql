-- ai_requests_daily: the aggregate ai_requests rows are folded into before they are deleted at
-- 90 days (spec §10 "90 days, then aggregated"). No user_id and no text: one row per UTC day and
-- metadata combination. Service role only.

create table public.ai_requests_daily (
  date date not null,
  kind text not null check (kind in ('reply', 'polish')),
  source text not null check (source in ('keyboard', 'app')),
  lang text check (lang in ('en', 'de', 'fr', 'es', 'it', 'other')),
  provider text check (provider in ('bedrock', 'mistral', 'fake')),
  model text check (model ~ '^[A-Za-z0-9._:/@-]{1,128}$'),
  prompt_version text check (prompt_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  status text not null check (status in ('started', 'ok', 'partial', 'refused', 'error', 'cancelled')),
  requests bigint not null default 0 check (requests >= 0),
  tokens_in bigint not null default 0 check (tokens_in >= 0),
  tokens_out bigint not null default 0 check (tokens_out >= 0),
  cost_micro_eur bigint not null default 0 check (cost_micro_eur >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_requests_daily_key unique nulls not distinct
    (date, kind, source, lang, provider, model, prompt_version, status)
);

comment on table public.ai_requests_daily is 'Anonymous daily aggregate of purged ai_requests. Service role only.';

create trigger ai_requests_daily_set_updated_at
  before update on public.ai_requests_daily
  for each row execute function public.set_updated_at();

alter table public.ai_requests_daily enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.ai_requests_daily from public, anon, authenticated;
grant all on table public.ai_requests_daily to service_role;

-- daily_cost now covers raw rows (last 90 days) plus the aggregate, so totals survive the purge.
-- A day that straddles the purge cutoff is split between both sources and summed here.
create or replace view public.daily_cost
with (security_invoker = true)
as
select
  s.date,
  s.provider,
  sum(s.requests)::bigint as requests,
  sum(s.tokens_in)::bigint as tokens_in,
  sum(s.tokens_out)::bigint as tokens_out,
  sum(s.cost_micro_eur)::bigint as cost_micro_eur
from (
  select
    (r.created_at at time zone 'UTC')::date as date,
    r.provider,
    1::bigint as requests,
    r.tokens_in::bigint as tokens_in,
    r.tokens_out::bigint as tokens_out,
    r.cost_micro_eur
  from public.ai_requests r
  union all
  select d.date, d.provider, d.requests, d.tokens_in, d.tokens_out, d.cost_micro_eur
  from public.ai_requests_daily d
) s
group by s.date, s.provider;

revoke all on table public.daily_cost from public, anon, authenticated;
grant select on table public.daily_cost to service_role;
