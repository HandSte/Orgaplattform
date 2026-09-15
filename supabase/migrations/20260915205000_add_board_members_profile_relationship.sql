alter table public.board_members
  add constraint board_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id)
  on delete cascade;
