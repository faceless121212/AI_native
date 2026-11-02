-- Providers (Prompt 3): add 'anthropic' (direct Claude API; dev/staging only, see
-- docs/processors.md) and 'fake' (LLM_MODE=fake, local and CI) to the provider code lists, and
-- give provider_status a failure window so the circuit breaker works across Edge Function
-- instances: 3 failures within 60 s → down_until = now + 5 min (architecture §7 step 9).
-- Only widens check constraints and adds columns; no data is changed or lost.

alter table public.ai_requests drop constraint ai_requests_provider_check;
alter table public.ai_requests add constraint ai_requests_provider_check
  check (provider in ('bedrock', 'mistral', 'anthropic', 'fake'));

alter table public.ai_requests_daily drop constraint ai_requests_daily_provider_check;
alter table public.ai_requests_daily add constraint ai_requests_daily_provider_check
  check (provider in ('bedrock', 'mistral', 'anthropic', 'fake'));

alter table public.provider_status drop constraint provider_status_provider_check;
alter table public.provider_status add constraint provider_status_provider_check
  check (provider in ('bedrock', 'mistral', 'anthropic', 'fake'));

alter table public.provider_status
  add column failure_count integer not null default 0 check (failure_count >= 0),
  add column window_started_at timestamptz;

insert into public.provider_status (provider) values ('anthropic'), ('fake')
on conflict (provider) do nothing;

-- Records one failure (error or first-token timeout) for p_provider. Failures are counted in a
-- window that starts at the first failure; reaching p_threshold inside p_window marks the
-- provider down for p_down_for and starts a new window. Row lock: concurrent failures from
-- several instances are counted exactly. Returns down_until when the provider is down at p_now,
-- else null.
create function public.record_provider_failure(
  p_provider text,
  p_now timestamptz default now(),
  p_threshold integer default 3,
  p_window interval default interval '60 seconds',
  p_down_for interval default interval '5 minutes'
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_row public.provider_status;
begin
  insert into public.provider_status (provider) values (p_provider)
  on conflict (provider) do nothing;

  select * into v_row from public.provider_status where provider = p_provider for update;

  if v_row.window_started_at is null or v_row.window_started_at <= p_now - p_window then
    v_row.failure_count := 1;
    v_row.window_started_at := p_now;
  else
    v_row.failure_count := v_row.failure_count + 1;
  end if;

  if v_row.failure_count >= p_threshold then
    v_row.down_until := p_now + p_down_for;
    v_row.failure_count := 0;
    v_row.window_started_at := null;
  end if;

  update public.provider_status
  set failure_count = v_row.failure_count,
      window_started_at = v_row.window_started_at,
      down_until = v_row.down_until,
      last_error_at = p_now
  where provider = p_provider;

  return case when v_row.down_until > p_now then v_row.down_until else null end;
end;
$$;

revoke all on function public.record_provider_failure(text, timestamptz, integer, interval, interval)
  from public, anon, authenticated;
grant execute on function public.record_provider_failure(text, timestamptz, integer, interval, interval)
  to service_role;
