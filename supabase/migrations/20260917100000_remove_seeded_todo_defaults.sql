drop function if exists public.ensure_board_todo_card() cascade;

-- To-do cards start empty. The previously seeded template entries are removed.
delete from public.card_checklist_items ci
using public.cards c
where c.id = ci.card_id
  and lower(trim(c.title)) = 'to-do-liste'
  and lower(trim(ci.title)) in ('erstellen', 'drucken', 'laminieren', 'falten');
