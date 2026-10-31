-- profiles_guard: skip the pg_timezone_names lookup for 'UTC' (the default on every new profile,
-- so every sign-up paid for a scan of the tz view). Same rules otherwise.

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.timezone is distinct from old.timezone)
     and new.timezone <> 'UTC'
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
