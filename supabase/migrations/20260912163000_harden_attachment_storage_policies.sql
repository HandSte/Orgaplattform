-- Storage paths are <board_id>/<card_id>/<random>-<safe-file-name>.
-- Keep private attachment access tied to the actual card/board membership.
drop policy if exists card_attachments_storage_insert on storage.objects;
drop policy if exists card_attachments_storage_select on storage.objects;
drop policy if exists card_attachments_storage_delete on storage.objects;

create policy card_attachments_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'card-attachments'
  and exists (
    select 1
    from public.cards c
    join public.lists l on l.id = c.list_id
    where c.id = (storage.foldername(name))[2]::uuid
      and l.board_id = (storage.foldername(name))[1]::uuid
      and public.is_board_member(l.board_id)
  )
);

create policy card_attachments_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'card-attachments'
  and exists (
    select 1
    from public.card_attachments a
    join public.cards c on c.id = a.card_id
    join public.lists l on l.id = c.list_id
    where a.storage_path = name
      and public.is_board_member(l.board_id)
  )
);

create policy card_attachments_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'card-attachments'
  and (
    owner_id = auth.uid()::text
    or exists (
      select 1
      from public.card_attachments a
      join public.cards c on c.id = a.card_id
      join public.lists l on l.id = c.list_id
      where a.storage_path = name
        and public.board_role_for(l.board_id) in ('owner','admin')
    )
  )
);
