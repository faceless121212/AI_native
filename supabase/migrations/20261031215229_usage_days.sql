-- usage_days: replies used per user per local day (spec §5). Deleted after 90 days (retention job
-- comes with the quota work).

create table public.usage_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  used integer not null default 0 check (used >= 0),
  free_limit integer not null default 3 check (free_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

comment on table public.usage_days is 'Daily usage counter. Readable by its owner; written only by Edge Functions.';

create index usage_days_local_date_idx on public.usage_days (local_date);

create trigger usage_days_set_updated_at
  before update on public.usage_days
  for each row execute function public.set_updated_at();

alter table public.usage_days enable row level security;

create policy "usage_days: owner can read"
  on public.usage_days for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.usage_days from public, anon, authenticated;
grant select on table public.usage_days to authenticated;
grant all on table public.usage_days to service_role;
