-- provider_status: circuit breaker for AI providers (architecture §7 step 9). Written by `reply`.

create table public.provider_status (
  provider text primary key check (provider in ('bedrock', 'mistral')),
  down_until timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.provider_status is 'Provider health. Service role only.';

create trigger provider_status_set_updated_at
  before update on public.provider_status
  for each row execute function public.set_updated_at();

alter table public.provider_status enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.provider_status from public, anon, authenticated;
grant all on table public.provider_status to service_role;

insert into public.provider_status (provider) values ('bedrock'), ('mistral');
