-- Base privileges and shared trigger helpers for every Replywise table.
--
-- Supabase's default privileges give anon and authenticated full rights on every new table,
-- sequence and function in public. Replywise grants per table instead (architecture §8), so a
-- table nobody granted stays closed even if RLS were ever switched off by mistake.
-- Migrations run as `postgres`, so these defaults apply to every object created after this file.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- Functions are also executable by PUBLIC by default. That default is global (not per schema),
-- so instead of changing it for every schema, each Replywise function revokes PUBLIC explicitly.

-- BEFORE UPDATE trigger: keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- BEFORE UPDATE trigger for append-only tables.
create function public.reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.reject_update() from public, anon, authenticated;
