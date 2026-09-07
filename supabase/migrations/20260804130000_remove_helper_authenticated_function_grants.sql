-- Remove remaining explicit authenticated EXECUTE grants from private helper
-- functions created by 20260804120000_production_safety_repair.sql.
--
-- These helpers are called by repaired SECURITY DEFINER functions and do not
-- need direct client-role execution. This migration is permission-only: it does
-- not replace function bodies, change ownership, alter SECURITY DEFINER
-- settings, validate constraints, or modify production data.

do $helper_permission_repair$
declare
  target_signature text;
begin
  foreach target_signature in array array[
    'public.booking_app_notes_json(text)',
    'public.booking_reference_from_notes(text)'
  ]
  loop
    if to_regprocedure(target_signature) is not null then
      execute format('revoke execute on function %s from authenticated', target_signature);
      execute format('revoke execute on function %s from anon', target_signature);
      execute format('revoke all on function %s from public', target_signature);
    end if;
  end loop;
end;
$helper_permission_repair$;
