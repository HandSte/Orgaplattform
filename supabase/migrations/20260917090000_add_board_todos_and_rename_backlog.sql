create table if not exists public.board_todos (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  completed boolean not null default false,
  position numeric not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_todos_board_position_idx on public.board_todos(board_id, position);

alter table public.board_todos enable row level security;

drop policy if exists board_todos_select on public.board_todos;
create policy board_todos_select on public.board_todos
for select to authenticated
using (public.is_board_member(board_id));

drop policy if exists board_todos_insert on public.board_todos;
create policy board_todos_insert on public.board_todos
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.board_role_for(board_id) = any(array['owner'::public.board_role, 'admin'::public.board_role, 'member'::public.board_role])
);

drop policy if exists board_todos_update on public.board_todos;
create policy board_todos_update on public.board_todos
for update to authenticated
using (public.board_role_for(board_id) = any(array['owner'::public.board_role, 'admin'::public.board_role, 'member'::public.board_role]))
with check (public.board_role_for(board_id) = any(array['owner'::public.board_role, 'admin'::public.board_role, 'member'::public.board_role]));

drop policy if exists board_todos_delete on public.board_todos;
create policy board_todos_delete on public.board_todos
for delete to authenticated
using (public.board_role_for(board_id) = any(array['owner'::public.board_role, 'admin'::public.board_role, 'member'::public.board_role]));

create or replace function public.set_board_todo_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists board_todos_updated_at on public.board_todos;
create trigger board_todos_updated_at before update on public.board_todos
for each row execute function public.set_board_todo_updated_at();

update public.lists
set name = 'Aufgaben'
where lower(btrim(name)) = 'backlog';

create or replace function public.create_board_with_defaults(p_name text, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_board public.boards%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Board name is required'; end if;
  insert into public.boards (name, description, owner_id)
  values (btrim(p_name), nullif(btrim(p_description), ''), v_user_id)
  returning * into v_board;
  insert into public.board_members (board_id, user_id, role)
  values (v_board.id, v_user_id, 'owner');
  insert into public.lists (board_id, name, position)
  values (v_board.id, 'Aufgaben', 0), (v_board.id, 'In Arbeit', 1), (v_board.id, 'Erledigt', 2);
  return jsonb_build_object(
    'id', v_board.id,
    'name', v_board.name,
    'description', v_board.description,
    'owner_id', v_board.owner_id,
    'created_at', v_board.created_at,
    'updated_at', v_board.updated_at
  );
end;
$$;

revoke all on function public.create_board_with_defaults(text, text) from public, anon;
grant execute on function public.create_board_with_defaults(text, text) to authenticated;

alter publication supabase_realtime add table public.board_todos;
