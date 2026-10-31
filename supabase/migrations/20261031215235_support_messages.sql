-- support_messages: "Write to the maker" (spec §7, §10). The body is what the user wrote to us,
-- never chat text. Kept 12 months. Service role only.

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  reply_email text check (
    reply_email is null
    or (char_length(reply_email) <= 254 and reply_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  app_version text check (app_version ~ '^[0-9A-Za-z.+_-]{1,32}$'),
  os text check (char_length(os) between 1 and 64),
  ui_lang text check (ui_lang in ('en', 'de', 'fr', 'es', 'it')),
  plan text check (plan in ('free', 'weekly', 'annual', 'lifetime')),
  created_at timestamptz not null default now()
);

comment on table public.support_messages is 'Support messages. Service role only. 12 months.';

create index support_messages_user_idx on public.support_messages (user_id);
create index support_messages_created_idx on public.support_messages (created_at);

create trigger support_messages_append_only
  before update on public.support_messages
  for each row execute function public.reject_update();

alter table public.support_messages enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.support_messages from public, anon, authenticated;
grant all on table public.support_messages to service_role;
