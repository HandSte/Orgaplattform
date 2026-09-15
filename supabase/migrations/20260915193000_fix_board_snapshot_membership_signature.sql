create or replace function public.get_board_snapshot(p_board_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_board_member(p_board_id) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'lists', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.position)
      from public.lists l
      where l.board_id = p_board_id
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.list_id, c.position)
      from public.cards c
      join public.lists l on l.id = c.list_id
      where l.board_id = p_board_id
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.full_name nulls last)
      from public.profiles p
      where exists (
        select 1
        from public.board_members bm
        where bm.board_id = p_board_id
          and bm.user_id = p.id
      )
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_board_snapshot(uuid) from public;
revoke all on function public.get_board_snapshot(uuid) from anon;
grant execute on function public.get_board_snapshot(uuid) to authenticated;
