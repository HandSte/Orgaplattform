alter table public.board_invitations rename column token to token_hash;
create unique index if not exists board_invitations_token_hash_idx on public.board_invitations(token_hash);
