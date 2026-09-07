-- Normalize execute permissions after 20260804120000_production_safety_repair.sql.
--
-- This is intentionally narrow and additive: it does not replace function bodies,
-- change data, validate constraints, or alter application behavior.

do $permission_repair$
declare
  target_signature text;
begin
  foreach target_signature in array array[
    'public.booking_app_notes_json(text)',
    'public.booking_reference_from_notes(text)',
    'public.get_public_booking_blocks(date, date)',
    'public.reschedule_client_booking(uuid, date, integer)',
    'public.link_recent_guest_booking_to_client(jsonb)',
    'public.create_secure_order(jsonb)',
    'public.create_booking_hold(date, integer, integer, integer, text)',
    'public.release_booking_hold(uuid, uuid, text)',
    'public.create_booking_hold(date, integer, integer, integer)',
    'public.release_booking_hold(uuid, uuid)'
  ]
  loop
    if to_regprocedure(target_signature) is not null then
      execute format('revoke all on function %s from public', target_signature);
    end if;
  end loop;
end;
$permission_repair$;

grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;
grant execute on function public.create_secure_order(jsonb) to anon, authenticated;
grant execute on function public.create_booking_hold(date, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid, text) to anon, authenticated;

grant execute on function public.reschedule_client_booking(uuid, date, integer) to authenticated;
grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;
