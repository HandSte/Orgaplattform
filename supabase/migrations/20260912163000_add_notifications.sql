create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id, read_at) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated with check (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;

create or replace function public.notify_card_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare v_board_id uuid; v_title text;
begin
  if new.assignee_id is null or new.assignee_id = auth.uid() then return new; end if;
  select l.board_id, new.title into v_board_id, v_title from public.lists l where l.id = new.list_id;
  if tg_op='INSERT' or old.assignee_id is distinct from new.assignee_id then
    insert into public.notifications(user_id, board_id, card_id, type, title, body)
    values (new.assignee_id, v_board_id, new.id, 'assignment', 'Aufgabe zugewiesen', 'Dir wurde die Aufgabe „'||left(v_title,120)||'“ zugewiesen.');
  end if;
  return new;
end; $$;
drop trigger if exists cards_assignment_notification on public.cards;
create trigger cards_assignment_notification after insert or update of assignee_id on public.cards for each row execute function public.notify_card_assignment();
