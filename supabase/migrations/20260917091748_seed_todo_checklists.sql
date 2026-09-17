with todo_cards as (
  select c.id, b.owner_id
  from public.cards c
  join public.lists l on l.id = c.list_id
  join public.boards b on b.id = l.board_id
  where lower(trim(c.title)) = 'to-do-liste'
    and not exists (select 1 from public.card_checklist_items ci where ci.card_id = c.id)
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
cross join template;
