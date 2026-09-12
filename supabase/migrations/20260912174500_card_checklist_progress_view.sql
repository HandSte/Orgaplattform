create or replace view public.card_checklist_progress with (security_invoker = true) as
select
  c.id as card_id,
  count(ci.id)::int as total_items,
  count(ci.id) filter (where ci.completed)::int as completed_items
from public.cards c
left join public.card_checklist_items ci on ci.card_id = c.id
group by c.id;

revoke all on public.card_checklist_progress from anon;
grant select on public.card_checklist_progress to authenticated;
