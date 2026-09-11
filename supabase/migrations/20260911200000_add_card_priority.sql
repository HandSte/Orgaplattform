alter table public.cards add column if not exists priority text not null default 'normal';

alter table public.cards drop constraint if exists cards_priority_check;
alter table public.cards add constraint cards_priority_check check (priority in ('low','normal','high','urgent'));

create index if not exists cards_priority_idx on public.cards(priority);
