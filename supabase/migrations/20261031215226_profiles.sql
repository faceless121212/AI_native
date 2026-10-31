-- profiles: one row per auth user (anonymous in v1). Created by a trigger on auth.users.
-- No email, phone or name: spec §10 lists only these fields.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  ui_lang text not null default 'en' check (ui_lang in ('en', 'de', 'fr', 'es', 'it')),
  i_am text check (i_am in ('woman', 'man', 'unspecified')),
  they_are text check (they_are in ('woman', 'man', 'unspecified')),
  age_confirmed_at timestamptz,
  -- IANA name, used for the daily reset at local midnight. Validated by trigger below.
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user. Readable by its owner; written only by Edge Functions.';

-- Timezone must be a name Postgres knows (IANA). Age confirmation is set once and kept.
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.timezone is distinct from old.timezone)
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.age_confirmed_at is not null
     and new.age_confirmed_at is distinct from old.age_confirmed_at then
    raise exception 'age_confirmed_at is set once' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.profiles_guard() from public, anon, authenticated;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- New auth user (anonymous sign-in) → profiles row. Security definer because the auth service
-- inserts into auth.users with a role that has no rights on public.profiles.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
