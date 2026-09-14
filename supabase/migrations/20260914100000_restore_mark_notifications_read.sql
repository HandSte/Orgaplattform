create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
revoke all on function public.mark_notifications_read(uuid[]) from anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
