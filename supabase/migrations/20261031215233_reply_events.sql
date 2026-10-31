-- reply_events: card feedback (inserted, 👍, 👎). No text. Kept 12 months.
-- request_id is set null when the ai_requests row ages out (90 days), so feedback can outlive it.
-- user_id (not in architecture §8's column list) is needed so Delete my data can find these rows
-- after the request row is gone, and for the referral reward on the first inserted reply.

create table public.reply_events (
  id bigint generated always as identity primary key,
  request_id uuid references public.ai_requests (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_index smallint not null check (card_index between 0 and 2),
  type text not null check (type in ('inserted', 'up', 'down')),
  created_at timestamptz not null default now()
);

comment on table public.reply_events is 'Card feedback, no text. Service role only. 12 months.';

create index reply_events_request_idx on public.reply_events (request_id);
create index reply_events_user_type_idx on public.reply_events (user_id, type, created_at);
create index reply_events_created_idx on public.reply_events (created_at);

create trigger reply_events_append_only
  before update of card_index, type, user_id, created_at on public.reply_events
  for each row execute function public.reject_update();

alter table public.reply_events enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.reply_events from public, anon, authenticated;
grant all on table public.reply_events to service_role;
