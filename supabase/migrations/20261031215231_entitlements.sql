-- entitlements: plan state, written only by the RevenueCat webhook (architecture §11).
-- One row per user and product. Lifetime never expires (CLAUDE.md rule 8); only weekly has a trial.

create table public.entitlements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product text not null check (product in ('weekly', 'annual', 'lifetime', 'lifetime_upgrade')),
  active boolean not null default false,
  is_trial boolean not null default false,
  trial_ends_at timestamptz,
  expires_at timestamptz,
  renewal_count integer not null default 0 check (renewal_count >= 0),
  will_renew boolean not null default false,
  source_event_id text check (char_length(source_event_id) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product),
  constraint entitlements_lifetime_never_expires
    check (product not in ('lifetime', 'lifetime_upgrade') or (expires_at is null and not will_renew)),
  constraint entitlements_trial_weekly_only check (not is_trial or product = 'weekly')
);

comment on table public.entitlements is 'Store entitlements. Readable by its owner; written only by the RevenueCat webhook.';

create index entitlements_user_active_idx on public.entitlements (user_id) where active;

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

alter table public.entitlements enable row level security;

create policy "entitlements: owner can read"
  on public.entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.entitlements from public, anon, authenticated;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;
