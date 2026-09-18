-- Calendar appointments are workspace-wide information. Every signed-in user can
-- see all calendar events, regardless of which board the event is assigned to.
-- Creating, editing and deleting events remains protected by the existing policies.
drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select"
on public.calendar_events
for select
to authenticated
using (true);
