drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.board_members bm
    where bm.user_id = profiles.id
      and exists (
        select 1
        from public.board_members me
        where me.board_id = bm.board_id
          and me.user_id = auth.uid()
      )
  )
);
