-- Feedback checks against the card indexes actually delivered (code review), not a count:
-- polish can deliver only the rewrite (index 1), and a retry can leave gaps.
--   ai_requests.delivered_cards: indexes of the cards sent to the client (0–2), no text.
--   record_reply_event: 'ok'/'partial' requests accept any feedback for a delivered card;
--   'cancelled' requests accept only 'inserted' for a delivered card (the user tapped a card
--   that had arrived before they closed the keyboard). Everything else → 'not_found'.

alter table public.ai_requests
  add column delivered_cards smallint[] not null default '{}'
    check (delivered_cards <@ array[0, 1, 2]::smallint[]);

create or replace function public.record_reply_event(
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
  v_status text;
  v_delivered smallint[];
  v_rows integer;
begin
  select r.status, r.delivered_cards into v_status, v_delivered
  from public.ai_requests r
  where r.id = p_request_id and r.user_id = p_user_id;
  if not found then
    return 'not_found';
  end if;
  if not (v_status in ('ok', 'partial') or (v_status = 'cancelled' and p_type = 'inserted')) then
    return 'not_found';
  end if;
  if p_card_index is null or not (p_card_index::smallint = any(v_delivered)) then
    return 'not_found';
  end if;

  insert into public.reply_events (request_id, user_id, card_index, type)
  values (p_request_id, p_user_id, p_card_index, p_type)
  on conflict (request_id, card_index, type) where request_id is not null do nothing;
  get diagnostics v_rows = row_count;

  return case when v_rows > 0 then 'ok' else 'duplicate' end;
end;
$$;
