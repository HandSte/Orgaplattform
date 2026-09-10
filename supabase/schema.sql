-- Orgaplattform database schema
-- Canonical schema is also applied to the connected Supabase project.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.board_role as enum ('owner','admin','member','viewer');

create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.board_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  title text not null,
  description text,
  position numeric not null default 0,
  assignee_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_board_position_idx on public.lists(board_id, position);
create index cards_list_position_idx on public.cards(list_id, position);
create index cards_assignee_idx on public.cards(assignee_id);
create index card_comments_card_idx on public.card_comments(card_id, created_at);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_board_member(target_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_members bm where bm.board_id = target_board and bm.user_id = auth.uid())
      or exists (select 1 from public.boards b where b.id = target_board and b.owner_id = auth.uid());
$$;

create or replace function public.board_role_for(target_board uuid)
returns public.board_role language sql stable security definer set search_path = public as $$
  select case when b.owner_id = auth.uid() then 'owner'::public.board_role else bm.role end
  from public.boards b left join public.board_members bm on bm.board_id = b.id and bm.user_id = auth.uid()
  where b.id = target_board and (b.owner_id = auth.uid() or bm.user_id = auth.uid()) limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.lists enable row level security;
alter table public.cards enable row level security;
alter table public.card_comments enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy boards_select on public.boards for select to authenticated using (owner_id = auth.uid() or public.is_board_member(id));
create policy boards_insert on public.boards for insert to authenticated with check (owner_id = auth.uid());
create policy boards_update on public.boards for update to authenticated using (owner_id = auth.uid() or public.board_role_for(id) in ('owner','admin')) with check (owner_id = auth.uid() or public.board_role_for(id) in ('owner','admin'));
create policy boards_delete on public.boards for delete to authenticated using (owner_id = auth.uid());
create policy board_members_select on public.board_members for select to authenticated using (user_id = auth.uid() or public.is_board_member(board_id));
create policy board_members_insert on public.board_members for insert to authenticated with check (public.board_role_for(board_id) in ('owner','admin'));
create policy board_members_update on public.board_members for update to authenticated using (public.board_role_for(board_id) in ('owner','admin')) with check (public.board_role_for(board_id) in ('owner','admin'));
create policy board_members_delete on public.board_members for delete to authenticated using (public.board_role_for(board_id) in ('owner','admin'));
create policy lists_select on public.lists for select to authenticated using (public.is_board_member(board_id));
create policy lists_insert on public.lists for insert to authenticated with check (public.board_role_for(board_id) in ('owner','admin','member'));
create policy lists_update on public.lists for update to authenticated using (public.board_role_for(board_id) in ('owner','admin','member')) with check (public.board_role_for(board_id) in ('owner','admin','member'));
create policy lists_delete on public.lists for delete to authenticated using (public.board_role_for(board_id) in ('owner','admin','member'));
create policy cards_select on public.cards for select to authenticated using (exists (select 1 from public.lists l where l.id = list_id and public.is_board_member(l.board_id)));
create policy cards_insert on public.cards for insert to authenticated with check (exists (select 1 from public.lists l where l.id = list_id and public.board_role_for(l.board_id) in ('owner','admin','member')));
create policy cards_update on public.cards for update to authenticated using (exists (select 1 from public.lists l where l.id = list_id and public.board_role_for(l.board_id) in ('owner','admin','member'))) with check (exists (select 1 from public.lists l where l.id = list_id and public.board_role_for(l.board_id) in ('owner','admin','member')));
create policy cards_delete on public.cards for delete to authenticated using (exists (select 1 from public.lists l where l.id = list_id and public.board_role_for(l.board_id) in ('owner','admin','member')));
create policy card_comments_select on public.card_comments for select to authenticated using (exists (select 1 from public.cards c join public.lists l on l.id = c.list_id where c.id = card_id and public.is_board_member(l.board_id)));
create policy card_comments_insert on public.card_comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.cards c join public.lists l on l.id = c.list_id where c.id = card_id and public.is_board_member(l.board_id)));
create policy card_comments_update on public.card_comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy card_comments_delete on public.card_comments for delete to authenticated using (author_id = auth.uid());

alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.board_members;
alter publication supabase_realtime add table public.lists;
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.card_comments;
