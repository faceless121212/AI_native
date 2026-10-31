-- ai_requests: metadata for every AI request (architecture §7 step 11). NEVER any message text:
-- every column is a number, timestamp, enum-like code or short identifier with a strict pattern,
-- so free text can't be stored here even by mistake. Kept 90 days, then aggregated.

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('reply', 'polish')),
  source text not null check (source in ('keyboard', 'app')),
  -- Language of the result ('other' when the input language isn't supported).
  lang text check (lang in ('en', 'de', 'fr', 'es', 'it', 'other')),
  tone text check (tone in ('warm', 'funny', 'flirty', 'confident', 'calm', 'apologise', 'sayNoKindly', 'professional')),
  relationship text check (relationship in ('match', 'partner', 'friend', 'family', 'colleague')),
  closeness smallint check (closeness between 1 and 5),
  formality text check (formality in ('casual', 'formal')),
  flirt text check (flirt in ('off', 'light', 'playful')),
  provider text check (provider in ('bedrock', 'mistral', 'fake')),
  model text check (model ~ '^[A-Za-z0-9._:/@-]{1,128}$'),
  prompt_version text check (prompt_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_micro_eur bigint not null default 0 check (cost_micro_eur >= 0),
  ms_first integer check (ms_first >= 0),
  ms_total integer check (ms_total >= 0),
  status text not null default 'started'
    check (status in ('started', 'ok', 'partial', 'refused', 'error', 'cancelled')),
  safety_flags text[] not null default '{}'
    check (safety_flags <@ array['crisis', 'refused', 'redacted', 'card_dropped', 'flirt_forced_off']::text[]),
  created_at timestamptz not null default now()
);

comment on table public.ai_requests is 'AI request metadata, no text ever. Service role only. 90 days.';

create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_created_idx on public.ai_requests (created_at);

alter table public.ai_requests enable row level security;
-- No policies: RLS denies every client role.

revoke all on table public.ai_requests from public, anon, authenticated;
grant all on table public.ai_requests to service_role;
