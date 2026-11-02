-- Card feedback (POST reply/event, architecture §7): inserted / up / down → reply_events.
-- Only for the caller's own request that delivered cards, and only for a card index it delivered.
-- Repeats of the same (request, card, type) are ignored, so retries and double taps don't count
-- twice (the referral reward reads the first 'inserted').

create unique index reply_events_once_per_card_type
  on public.reply_events (request_id, card_index, type)
  where request_id is not null;

-- Returns 'ok' | 'duplicate' | 'not_found'.
create function public.record_reply_event(
  p_user_id uuid,
  p_request_id uuid,
  p_card_index integer,
  p_type text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_cards smallint;
  v_rows integer;
begin
  select r.cards into v_cards
  from public.ai_requests r
  where r.id = p_request_id
    and r.user_id = p_user_id
    and r.status in ('ok', 'partial');
  if not found or p_card_index is null or p_card_index < 0 or p_card_index >= coalesce(v_cards, 0) then
    return 'not_found';
  end if;

  insert into public.reply_events (request_id, user_id, card_index, type)
  values (p_request_id, p_user_id, p_card_index, p_type)
  on conflict (request_id, card_index, type) where request_id is not null do nothing;
  get diagnostics v_rows = row_count;

  return case when v_rows > 0 then 'ok' else 'duplicate' end;
end;
$$;

revoke all on function public.record_reply_event(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_reply_event(uuid, uuid, integer, text) to service_role;
