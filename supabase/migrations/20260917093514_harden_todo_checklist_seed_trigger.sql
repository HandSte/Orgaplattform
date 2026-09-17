create or replace function public.ensure_board_todo_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_id uuid;
  v_owner_id uuid;
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
      values (new.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', v_owner_id)
      returning id into v_card_id;
    end if;

    insert into public.card_checklist_items (card_id, title, completed, position, created_by)
    select v_card_id, template.title, false, template.position, v_owner_id
    from (values
      ('erstellen', 0::numeric),
      ('drucken', 1::numeric),
      ('laminieren', 2::numeric),
      ('falten', 3::numeric)
    ) as template(title, position)
    where not exists (
      select 1
      from public.card_checklist_items ci
      where ci.card_id = v_card_id
        and lower(trim(ci.title)) = template.title
    );
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_board_todo_card() from public, anon, authenticated;

drop trigger if exists ensure_board_todo_card_after_list_insert on public.lists;
create trigger ensure_board_todo_card_after_list_insert
after insert on public.lists
for each row
execute function public.ensure_board_todo_card();

with todo_cards as (
  select c.id, b.owner_id
  from public.cards c
  join public.lists l on l.id = c.list_id
  join public.boards b on b.id = l.board_id
  where lower(trim(c.title)) = 'to-do-liste'
), template(title, position) as (
  values
    ('erstellen', 0::numeric),
    ('drucken', 1::numeric),
    ('laminieren', 2::numeric),
    ('falten', 3::numeric)
)
insert into public.card_checklist_items (card_id, title, completed, position, created_by)
select t.id, template.title, false, template.position, t.owner_id
from todo_cards t
cross join template
where not exists (
  select 1
  from public.card_checklist_items ci
  where ci.card_id = t.id
    and lower(trim(ci.title)) = template.title
);
