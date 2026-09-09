begin;

alter table client_access_private.client_access
  drop constraint client_access_admission_source_check,
  add constraint client_access_admission_source_check
    check (admission_source in ('INVITATION', 'LEGACY_APPROVAL', 'SELF_REGISTRATION'));

alter table client_access_private.client_access
  drop constraint client_access_check,
  add constraint client_access_admission_details_check check (
    (admission_source = 'INVITATION' and invitation_id is not null)
    or (admission_source in ('LEGACY_APPROVAL', 'SELF_REGISTRATION') and invitation_id is null)
  );

create function public.activate_my_client_account(profile_fields jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  caller uuid := auth.uid();
  access_status text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'A signed-in client is required.';
  end if;
  if coalesce(public.current_user_is_booking_admin(), false) then
    raise exception using errcode = '42501', message = 'Admin accounts cannot be activated as client accounts.';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = caller and u.email_confirmed_at is not null and nullif(btrim(u.email), '') is not null
  ) then
    raise exception using errcode = '42501', message = 'A confirmed email address is required.';
  end if;

  perform client_access_private.lock_user(caller);
  select a.status into access_status
  from client_access_private.client_access a where a.user_id = caller for update;

  if access_status = 'BLOCKED' then
    raise exception using errcode = '42501', message = 'Client access is blocked.';
  end if;

  perform client_access_private.save_profile(caller, profile_fields);

  if access_status is null then
    insert into client_access_private.client_access(
      user_id, status, admission_source, invitation_id, admitted_by, status_changed_by
    ) values (caller, 'ACTIVE', 'SELF_REGISTRATION', null, caller, caller);
    insert into client_access_private.client_access_events(
      event_type, user_id, actor_user_id, new_status
    ) values ('ACCESS_ACTIVATED', caller, caller, 'ACTIVE');
  end if;

  return public.get_my_client_access();
end;
$$;

revoke all on function public.activate_my_client_account(jsonb) from public, anon, authenticated;
grant execute on function public.activate_my_client_account(jsonb) to authenticated;

commit;
