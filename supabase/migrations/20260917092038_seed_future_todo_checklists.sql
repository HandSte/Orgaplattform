create or replace function public.ensure_board_todo_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_id uuid;
begin
  if new.position = 0 then
    select c.id into v_card_id
    from public.cards c
    where c.list_id = new.id
      and lower(trim(c.title)) = 'to-do-liste'
    limit 1;

    if v_card_id is null then
      insert into public.cards (list_id, title, description, position, priority, created_by)
      values (new.id, 'To-do-Liste', 'Abhakbare To-do-Liste für dieses Board.', -1, 'normal', null)
      returning id into v_card_id;
    end if;

    if v_card_id is not null and not exists (select 1 from public.card_checklist_items ci where ci.card_id = v_card_id) then
      insert into public.card_checklist_items (card_id, title, completed, position, created_by)
      values
        (v_card_id, 'erstellen', false, 0, null),
        (v_card_id, 'drucken', false, 1, null),
        (v_card_id, 'laminieren', false, 2, null),
        (v_card_id, 'falten', false, 3, null);
    end if;
  end if;
  return new;
end;
$$;
