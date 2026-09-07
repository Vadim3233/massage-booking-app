-- Permission-only rollback for 20260804124500_remove_remaining_anon_function_grants.sql.
--
-- This restores only the explicit anon grants removed by that migration. It
-- does not restore PUBLIC grants, change function bodies, or touch data.

begin;

grant execute on function public.booking_app_notes_json(text) to anon;
grant execute on function public.booking_reference_from_notes(text) to anon;
grant execute on function public.link_recent_guest_booking_to_client(jsonb) to anon;
grant execute on function public.reschedule_client_booking(uuid, date, integer) to anon;

grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;
grant execute on function public.reschedule_client_booking(uuid, date, integer) to authenticated;

commit;
