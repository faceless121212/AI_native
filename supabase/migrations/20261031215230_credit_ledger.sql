-- credit_ledger: starter and bonus credits (spec §5). Append-only; balance = sum(delta).
-- Starter credits (+10 on first AI consent) exist at most once per user: enforced by a partial
-- unique index, so concurrent consent calls can't grant twice.

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0 and delta between -1000 and 1000),
  reason text not null check (reason in ('starter', 'referral', 'refund', 'admin')),
  created_at timestamptz not null default now(),
  constraint credit_ledger_starter_positive check (reason <> 'starter' or delta > 0)
);

comment on table public.credit_ledger is 'Credit movements. Readable by its owner; written only by Edge Functions.';

create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at);
create unique index credit_ledger_one_starter_per_user
  on public.credit_ledger (user_id) where reason = 'starter';

create trigger credit_ledger_append_only
  before update on public.credit_ledger
  for each row execute function public.reject_update();

alter table public.credit_ledger enable row level security;

create policy "credit_ledger: owner can read"
  on public.credit_ledger for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.credit_ledger from public, anon, authenticated;
grant select on table public.credit_ledger to authenticated;
grant all on table public.credit_ledger to service_role;
