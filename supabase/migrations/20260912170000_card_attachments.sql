create table public.card_attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index card_attachments_card_id_idx on public.card_attachments(card_id, created_at desc);
alter table public.card_attachments enable row level security;

create policy card_attachments_select on public.card_attachments
for select to authenticated using (
  exists (select 1 from public.cards c join public.lists l on l.id = c.list_id
    where c.id = card_attachments.card_id and public.is_board_member(l.board_id))
);

create policy card_attachments_insert on public.card_attachments
for insert to authenticated with check (
  uploader_id = auth.uid() and exists (
    select 1 from public.cards c join public.lists l on l.id = c.list_id
    where c.id = card_attachments.card_id and public.is_board_member(l.board_id)
  )
);

create policy card_attachments_delete on public.card_attachments
for delete to authenticated using (
  uploader_id = auth.uid() or exists (
    select 1 from public.cards c join public.lists l on l.id = c.list_id
    where c.id = card_attachments.card_id and public.board_role_for(l.board_id) in ('owner','admin')
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-attachments', 'card-attachments', false, 52428800,
  array['image/*','application/pdf','text/plain','application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false, file_size_limit=52428800, allowed_mime_types=excluded.allowed_mime_types;

create policy card_attachments_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'card-attachments' and exists (
    select 1 from public.cards c join public.lists l on l.id = c.list_id
    where c.id = ((storage.foldername(name))[2])::uuid and (storage.foldername(name))[1] = l.board_id::text
      and public.is_board_member(l.board_id)
  )
);

create policy card_attachments_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'card-attachments' and exists (
    select 1 from public.card_attachments a join public.cards c on c.id = a.card_id join public.lists l on l.id = c.list_id
    where a.storage_path = name and public.is_board_member(l.board_id)
  )
);

create policy card_attachments_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'card-attachments' and (owner_id = auth.uid()::text or exists (
    select 1 from public.card_attachments a join public.cards c on c.id = a.card_id join public.lists l on l.id = c.list_id
    where a.storage_path = name and public.board_role_for(l.board_id) in ('owner','admin')
  ))
);

alter publication supabase_realtime add table public.card_attachments;
