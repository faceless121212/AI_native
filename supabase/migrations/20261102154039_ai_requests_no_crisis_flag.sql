-- Privacy review: 'crisis' must not be storable per user (possible Art. 9 data; open decision in
-- docs/processors.md). Narrows the safety_flags check. Non-destructive: if any row already holds
-- 'crisis' the migration stops instead of changing data, so someone decides what to do with it.

do $$
begin
  if exists (select 1 from public.ai_requests where 'crisis' = any(safety_flags)) then
    raise exception 'ai_requests rows with the crisis flag exist; resolve them before narrowing the check';
  end if;
end;
$$;

alter table public.ai_requests drop constraint ai_requests_safety_flags_check;
alter table public.ai_requests add constraint ai_requests_safety_flags_check
  check (safety_flags <@ array['refused', 'redacted', 'card_dropped', 'flirt_forced_off']::text[]);
