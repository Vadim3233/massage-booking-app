-- Permission-only rollback for
-- 20260804130000_remove_helper_authenticated_function_grants.sql.
--
-- This restores only the explicit authenticated helper grants removed by that
-- migration. It does not restore PUBLIC or anon grants, change function bodies,
-- or touch data.

begin;

grant execute on function public.booking_app_notes_json(text) to authenticated;
grant execute on function public.booking_reference_from_notes(text) to authenticated;

commit;
