create or replace function public.normalize_board_list_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if lower(btrim(new.name)) = 'backlog' then new.name := 'Aufgaben'; end if;
  return new;
end;
$$;

drop trigger if exists normalize_board_list_name on public.lists;
create trigger normalize_board_list_name before insert or update of name on public.lists
for each row execute function public.normalize_board_list_name();

create or replace function public.ensure_board_todo_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.position = 0 and lower(btrim(new.name)) = 'aufgaben' then
    insert into public.cards (list_id, title, description, position, priority, created_by)
    select new.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', null
    where not exists (select 1 from public.cards where list_id = new.id and lower(title) = 'to-do-liste');
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_board_todo_card on public.lists;
create trigger ensure_board_todo_card after insert on public.lists
for each row execute function public.ensure_board_todo_card();

insert into public.cards (list_id, title, description, position, priority, created_by)
select first_list.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', null
from (
  select distinct on (board_id) id, board_id
  from public.lists
  where lower(btrim(name)) = 'aufgaben'
  order by board_id, position asc, id asc
) first_list
where not exists (
  select 1 from public.cards c where c.list_id = first_list.id and lower(c.title) = 'to-do-liste'
);
