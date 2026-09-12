create or replace function public.move_card(
  p_card_id uuid,
  p_target_list_id uuid,
  p_before_card_id uuid default null
)
returns public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.cards%rowtype;
  v_source_list public.lists%rowtype;
  v_target_list public.lists%rowtype;
  v_before_position numeric;
  v_new_position numeric;
  v_result public.cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if not found then raise exception 'Karte nicht gefunden.' using errcode = 'P0002'; end if;
  select * into v_source_list from public.lists where id = v_card.list_id;
  select * into v_target_list from public.lists where id = p_target_list_id for update;
  if not found then raise exception 'Zielliste nicht gefunden.' using errcode = 'P0002'; end if;
  if v_source_list.board_id <> v_target_list.board_id then
    raise exception 'Karten können nicht zwischen Boards verschoben werden.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.board_members where board_id = v_target_list.board_id and user_id = auth.uid()) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target_list.board_id::text, 0));

  if p_before_card_id is not null then
    select position into v_before_position from public.cards
      where id = p_before_card_id and list_id = p_target_list_id for update;
    if v_before_position is null then raise exception 'Zielkarte nicht gefunden.' using errcode = 'P0002'; end if;
    v_new_position := v_before_position - 0.5;
  else
    select coalesce(max(position), -1) + 1 into v_new_position
    from public.cards where list_id = p_target_list_id and id <> p_card_id;
  end if;

  update public.cards set list_id = p_target_list_id, position = v_new_position where id = p_card_id;

  with ranked as (
    select id, row_number() over(order by position, id) - 1 as new_position
    from public.cards where list_id = v_source_list.id
  )
  update public.cards c set position = ranked.new_position from ranked where c.id = ranked.id;

  with ranked as (
    select id, row_number() over(order by position, id) - 1 as new_position
    from public.cards where list_id = p_target_list_id
  )
  update public.cards c set position = ranked.new_position from ranked where c.id = ranked.id;

  select * into v_result from public.cards where id = p_card_id;
  return v_result;
end;
$$;

revoke execute on function public.move_card(uuid, uuid, uuid) from anon;
grant execute on function public.move_card(uuid, uuid, uuid) to authenticated;
