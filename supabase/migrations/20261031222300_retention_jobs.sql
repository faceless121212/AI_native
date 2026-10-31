-- Retention (spec §10; backend rules): daily purge, run by pg_cron.
--   ai_requests      > 90 days  → folded into ai_requests_daily, then deleted (one statement)
--   usage_days       > 90 days  (by local_date)
--   reply_events     > 12 months
--   support_messages > 12 months
-- The logic is a function taking the current time, so pgTAP can run it with a fixed clock;
-- cron only calls it.

create extension if not exists pg_cron with schema pg_catalog;

create function public.run_retention(p_now timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ai_cutoff timestamptz := p_now - interval '90 days';
  v_usage_cutoff date := (p_now at time zone 'UTC')::date - 90;
  v_year_cutoff timestamptz := p_now - interval '12 months';
  v_ai integer;
  v_usage integer;
  v_events integer;
  v_support integer;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = 'invalid_parameter_value';
  end if;

  with purged as (
    delete from public.ai_requests r
    where r.created_at < v_ai_cutoff
    returning r.created_at, r.kind, r.source, r.lang, r.provider, r.model, r.prompt_version,
              r.status, r.tokens_in, r.tokens_out, r.cost_micro_eur
  ),
  folded as (
    insert into public.ai_requests_daily as d
      (date, kind, source, lang, provider, model, prompt_version, status,
       requests, tokens_in, tokens_out, cost_micro_eur)
    select (p.created_at at time zone 'UTC')::date, p.kind, p.source, p.lang, p.provider, p.model,
           p.prompt_version, p.status, count(*), sum(p.tokens_in), sum(p.tokens_out), sum(p.cost_micro_eur)
    from purged p
    group by 1, 2, 3, 4, 5, 6, 7, 8
    on conflict on constraint ai_requests_daily_key do update set
      requests = d.requests + excluded.requests,
      tokens_in = d.tokens_in + excluded.tokens_in,
      tokens_out = d.tokens_out + excluded.tokens_out,
      cost_micro_eur = d.cost_micro_eur + excluded.cost_micro_eur
    returning 1
  )
  select (select count(*) from purged) into v_ai;

  delete from public.usage_days where local_date < v_usage_cutoff;
  get diagnostics v_usage = row_count;

  delete from public.reply_events where created_at < v_year_cutoff;
  get diagnostics v_events = row_count;

  delete from public.support_messages where created_at < v_year_cutoff;
  get diagnostics v_support = row_count;

  return jsonb_build_object(
    'ai_requests', v_ai,
    'usage_days', v_usage,
    'reply_events', v_events,
    'support_messages', v_support
  );
end;
$$;

revoke all on function public.run_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_retention(timestamptz) to service_role;

-- Daily at 03:15 UTC. cron.schedule with a job name replaces an existing job of that name.
select cron.schedule('replywise-retention', '15 3 * * *', $$select public.run_retention(now())$$);
