-- Keep attachment changes in sync for users viewing the same card.
alter publication supabase_realtime add table public.card_attachments;
