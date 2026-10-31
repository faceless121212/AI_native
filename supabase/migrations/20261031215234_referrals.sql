-- referrals: invite codes (spec §5, BUILD.md Prompt 9). Columns as architecture §8.
-- One redemption per user (unique redeemed_by), no self-redeem. Owners can read their own codes.

create table public.referrals (
  -- 8 chars from an alphabet without look-alikes (no 0/O, 1/I).
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  redeemed_by uuid unique references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_no_self_redeem check (redeemed_by is null or redeemed_by <> owner_id),
  constraint referrals_redeemed_has_time check (redeemed_by is null or redeemed_at is not null),
  constraint referrals_reward_after_redeem check (rewarded_at is null or redeemed_at is not null)
);

comment on table public.referrals is 'Referral codes. Owner can read own codes; written only by Edge Functions.';

create index referrals_owner_idx on public.referrals (owner_id);

create trigger referrals_set_updated_at
  before update on public.referrals
  for each row execute function public.set_updated_at();

alter table public.referrals enable row level security;

create policy "referrals: owner can read own codes"
  on public.referrals for select
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on table public.referrals from public, anon, authenticated;
grant select on table public.referrals to authenticated;
grant all on table public.referrals to service_role;
