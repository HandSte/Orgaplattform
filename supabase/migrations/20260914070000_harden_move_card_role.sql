-- Keep card movement permission enforcement in the database, independent of UI state.
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
  source_list_id uuid;
  board_id_value uuid;
  target_board_id uuid;
  target_position numeric;
  result_card public.cards;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select c.list_id, l.board_id
    into source_list_id, board_id_value
    from public.cards c
    join public.lists l on l.id = c.list_id
   where c.id = p_card_id
   for update;

  if source_list_id is null then
    raise exception 'card not found';
  end if;

  select l.board_id into target_board_id
    from public.lists l
   where l.id = p_target_list_id;

  if target_board_id is null or target_board_id <> board_id_value then
    raise exception 'target list is invalid';
  end if;

  if public.board_role_for(board_id_value) not in ('owner'::public.board_role, 'admin'::public.board_role, 'member'::public.board_role) then
    raise exception 'insufficient board permissions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(board_id_value::text, 0));

  if p_before_card_id is null then
    select coalesce(max(position) + 1, 0) into target_position
      from public.cards
     where list_id = p_target_list_id and id <> p_card_id;
  else
    select position into target_position
      from public.cards
     where id = p_before_card_id and list_id = p_target_list_id;
    if target_position is null then
      raise exception 'target card is invalid';
    end if;
  end if;

  update public.cards
     set list_id = p_target_list_id, position = target_position
   where id = p_card_id
   returning * into result_card;

  update public.cards c
     set position = ranked.position
    from (
      select id, row_number() over (order by position, created_at, id) - 1 as position
        from public.cards
       where list_id = source_list_id
    ) ranked
   where c.id = ranked.id;

  if p_target_list_id <> source_list_id then
    update public.cards c
       set position = ranked.position
      from (
        select id, row_number() over (order by position, created_at, id) - 1 as position
          from public.cards
         where list_id = p_target_list_id
      ) ranked
     where c.id = ranked.id;
  end if;

  select * into result_card from public.cards where id = p_card_id;
  return result_card;
end;
$$;

revoke all on function public.move_card(uuid, uuid, uuid) from anon;
grant execute on function public.move_card(uuid, uuid, uuid) to authenticated;
