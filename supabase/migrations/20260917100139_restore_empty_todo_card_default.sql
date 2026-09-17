create or replace function public.ensure_empty_todo_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid;
  v_card_id uuid;
begin
  if new.position = 0 then
    select b.owner_id into v_owner_id
    from public.boards b
    where b.id = new.board_id;

    select c.id into v_card_id
    from public.cards c
    where c.list_id = new.id
      and lower(trim(c.title)) = 'to-do-liste'
    limit 1;

    if v_card_id is null then
      insert into public.cards (list_id, title, description, position, priority, created_by)
      values (new.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', v_owner_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_empty_todo_card() from public, anon, authenticated;
drop trigger if exists ensure_empty_todo_card_after_list_insert on public.lists;
create trigger ensure_empty_todo_card_after_list_insert
after insert on public.lists
for each row
execute function public.ensure_empty_todo_card();
