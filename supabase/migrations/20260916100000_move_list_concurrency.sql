create or replace function public.move_list(p_list_id uuid, p_before_list_id uuid default null)
returns public.lists
language plpgsql
security definer
set search_path = public
as $$
declare
  source_board_id uuid;
  target_board_id uuid;
  target_position numeric;
  result_row public.lists;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select l.board_id into source_board_id from public.lists l where l.id = p_list_id;
  if source_board_id is null then raise exception 'list not found'; end if;
  if not public.is_board_member(source_board_id, auth.uid()) then raise exception 'not authorized'; end if;
  if public.board_role_for(source_board_id) not in ('owner','admin','member') then raise exception 'not authorized'; end if;

  perform pg_advisory_xact_lock(hashtextextended(source_board_id::text, 0));

  if p_before_list_id is not null then
    select l.board_id, l.position into target_board_id, target_position from public.lists l where l.id = p_before_list_id;
    if target_board_id is null or target_board_id <> source_board_id then raise exception 'invalid target list'; end if;
  end if;

  with ranked as (
    select id,
           row_number() over (
             order by
               case
                 when id = p_list_id and p_before_list_id is null then 1e15::numeric
                 when id = p_list_id then target_position - 0.5
                 else position
               end,
               id
           ) - 1 as new_position
    from public.lists
    where board_id = source_board_id
  )
  update public.lists l
  set position = ranked.new_position
  from ranked
  where l.id = ranked.id;

  select * into result_row from public.lists where id = p_list_id;
  return result_row;
end;
$$;

revoke all on function public.move_list(uuid,uuid) from public;
revoke all on function public.move_list(uuid,uuid) from anon;
grant execute on function public.move_list(uuid,uuid) to authenticated;
