-- consents: proof of AI-sharing consent (spec §2 screen 4, CLAUDE.md rule 6).
-- Append-only history: every grant inserts a row; withdrawal only sets withdrawn_at.
-- The latest row (granted_at, id) decides whether AI is allowed.

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('ai_sharing')),
  policy_version text not null check (policy_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint consents_withdrawn_after_granted check (withdrawn_at is null or withdrawn_at >= granted_at)
);

comment on table public.consents is 'Consent history. Readable by its owner; written only by Edge Functions.';

create index consents_user_kind_latest_idx
  on public.consents (user_id, kind, granted_at desc, id desc);

-- Only withdrawn_at may change, and only from null to a timestamp.
create function public.consents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.policy_version is distinct from old.policy_version
     or new.granted_at is distinct from old.granted_at
     or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at) then
    raise exception 'consents rows are append-only (only withdrawn_at can be set once)'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.consents_guard() from public, anon, authenticated;

create trigger consents_guard
  before update on public.consents
  for each row execute function public.consents_guard();

create trigger consents_set_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();

alter table public.consents enable row level security;

create policy "consents: owner can read"
  on public.consents for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.consents from public, anon, authenticated;
grant select on table public.consents to authenticated;
grant all on table public.consents to service_role;
