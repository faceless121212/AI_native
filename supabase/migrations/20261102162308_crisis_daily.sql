-- Crisis signal (user decision, Prompt 3): an anonymous daily count, no user link. `reply`
-- increments it once per request whose `meta.crisis` was true (model or keyword backstop).
-- Nothing per user is stored anywhere. Service role only; RLS on, no policies.

create table public.crisis_daily (
  date date not null,
  lang text not null check (lang in ('en', 'de', 'fr', 'es', 'it', 'other')),
  source text not null check (source in ('keyboard', 'app')),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date, lang, source)
);

comment on table public.crisis_daily is 'Anonymous daily count of replies flagged as crisis. No user ID. Service role only.';

create trigger crisis_daily_set_updated_at
  before update on public.crisis_daily
  for each row execute function public.set_updated_at();

alter table public.crisis_daily enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.crisis_daily from public, anon, authenticated;
grant all on table public.crisis_daily to service_role;

-- +1 for (UTC day of p_now, lang, source).
create function public.increment_crisis_daily(p_lang text, p_source text, p_now timestamptz default now())
returns void
language sql
set search_path = ''
as $$
  insert into public.crisis_daily as c (date, lang, source, count)
  values ((p_now at time zone 'UTC')::date, p_lang, p_source, 1)
  on conflict (date, lang, source) do update set count = c.count + 1;
$$;

revoke all on function public.increment_crisis_daily(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_crisis_daily(text, text, timestamptz) to service_role;
