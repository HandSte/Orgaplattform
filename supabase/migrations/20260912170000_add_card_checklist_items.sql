create table if not exists public.card_checklist_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  completed boolean not null default false,
  position numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_checklist_items_card_position_idx on public.card_checklist_items(card_id, position);
alter table public.card_checklist_items enable row level security;
drop policy if exists checklist_select on public.card_checklist_items;
create policy checklist_select on public.card_checklist_items for select to authenticated using (exists (select 1 from public.cards c join public.lists l on l.id=c.list_id where c.id=card_checklist_items.card_id and public.is_board_member(l.board_id)));
drop policy if exists checklist_insert on public.card_checklist_items;
create policy checklist_insert on public.card_checklist_items for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.cards c join public.lists l on l.id=c.list_id where c.id=card_checklist_items.card_id and public.is_board_member(l.board_id)));
drop policy if exists checklist_update on public.card_checklist_items;
create policy checklist_update on public.card_checklist_items for update to authenticated using (exists (select 1 from public.cards c join public.lists l on l.id=c.list_id where c.id=card_checklist_items.card_id and public.is_board_member(l.board_id))) with check (exists (select 1 from public.cards c join public.lists l on l.id=c.list_id where c.id=card_checklist_items.card_id and public.is_board_member(l.board_id)));
drop policy if exists checklist_delete on public.card_checklist_items;
create policy checklist_delete on public.card_checklist_items for delete to authenticated using (exists (select 1 from public.cards c join public.lists l on l.id=c.list_id where c.id=card_checklist_items.card_id and public.is_board_member(l.board_id)));
alter publication supabase_realtime add table public.card_checklist_items;
