-- device_keys: keyboard credentials (architecture §4). Only the SHA-256 hex of the key is stored.
-- No client access at all: created, looked up and revoked only by Edge Functions.

create table public.device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.device_keys is 'Keyboard device keys (hash only). Service role only.';

create index device_keys_user_active_idx on public.device_keys (user_id) where revoked_at is null;

-- Identity columns never change; a revoked key stays revoked.
create function public.device_keys_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.key_hash is distinct from old.key_hash
     or new.platform is distinct from old.platform
     or new.created_at is distinct from old.created_at
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'device key identity is immutable and revocation is final'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.device_keys_guard() from public, anon, authenticated;

create trigger device_keys_guard
  before update on public.device_keys
  for each row execute function public.device_keys_guard();

create trigger device_keys_set_updated_at
  before update on public.device_keys
  for each row execute function public.set_updated_at();

alter table public.device_keys enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.device_keys from public, anon, authenticated;
grant all on table public.device_keys to service_role;
