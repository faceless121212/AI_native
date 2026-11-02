-- Abandoned requests (code review M4): if the `reply` worker dies after charging (instance killed,
-- crash, client gone before the post-stream work ran), the ai_requests row stays 'started' and the
-- charge is never refunded. A sweeper refunds such rows after 5 minutes and marks them
-- 'abandoned'. It refunds even if a card might have been delivered: the row doesn't know, and
-- erring towards the user is the honest choice. Runs every 5 minutes (pg_cron).

alter table public.ai_requests drop constraint ai_requests_status_check;
alter table public.ai_requests add constraint ai_requests_status_check
  check (status in ('started', 'ok', 'partial', 'refused', 'error', 'cancelled', 'abandoned'));

alter table public.ai_requests_daily drop constraint ai_requests_daily_status_check;
alter table public.ai_requests_daily add constraint ai_requests_daily_status_check
  check (status in ('started', 'ok', 'partial', 'refused', 'error', 'cancelled', 'abandoned'));

-- Returns the number of rows swept.
create function public.sweep_abandoned_requests(
  p_now timestamptz,
  p_older_than interval default interval '5 minutes'
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = 'invalid_parameter_value';
  end if;
  for v_id in
    select r.id from public.ai_requests r
    where r.status = 'started' and r.created_at < p_now - p_older_than
    order by r.created_at
    for update skip locked
  loop
    perform public.refund_reply(v_id);
    update public.ai_requests set status = 'abandoned' where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.sweep_abandoned_requests(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.sweep_abandoned_requests(timestamptz, interval) to service_role;

create index ai_requests_started_idx on public.ai_requests (created_at) where status = 'started';

select cron.schedule('replywise-sweep-abandoned', '*/5 * * * *', $$select public.sweep_abandoned_requests(now())$$);
