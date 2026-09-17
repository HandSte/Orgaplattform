create or replace function public.ensure_board_todo_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.position = 0 then
    insert into public.cards (list_id, title, description, position, priority, created_by)
    select new.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', null
    where not exists (select 1 from public.cards where list_id = new.id and lower(title) = 'to-do-liste');
  end if;
  return new;
end;
$$;

insert into public.cards (list_id, title, description, position, priority, created_by)
select first_list.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', null
from (
  select distinct on (board_id) id, board_id
  from public.lists
  order by board_id, position asc, id asc
) first_list
where not exists (
  select 1 from public.cards c where c.list_id = first_list.id and lower(c.title) = 'to-do-liste'
);
