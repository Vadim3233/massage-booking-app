-- Remove remaining explicit anon EXECUTE grants from non-public repair helpers.
--
-- This is intentionally permission-only. It does not replace function bodies,
-- change ownership, alter SECURITY DEFINER settings, validate constraints, or
-- modify production data.

do $anon_permission_repair$
declare
  target_signature text;
begin
  foreach target_signature in array array[
    'public.booking_app_notes_json(text)',
    'public.booking_reference_from_notes(text)',
    'public.link_recent_guest_booking_to_client(jsonb)',
    'public.reschedule_client_booking(uuid, date, integer)'
  ]
  loop
    if to_regprocedure(target_signature) is not null then
      execute format('revoke execute on function %s from anon', target_signature);
      execute format('revoke all on function %s from public', target_signature);
    end if;
  end loop;
end;
$anon_permission_repair$;

grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;
grant execute on function public.reschedule_client_booking(uuid, date, integer) to authenticated;
