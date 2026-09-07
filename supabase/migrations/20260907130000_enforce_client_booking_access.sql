-- Stage 2 cutover. Apply only after reviewed client backfill and frontend rollout
-- planning. Retain installed business-rule bodies; never leave them browser-callable.
begin;

alter table public.booking_holds add column user_id uuid references auth.users(id);
create index booking_holds_user_expiry_idx on public.booking_holds(user_id, expires_at);

create function client_access_private.assert_creation_access() returns uuid
language plpgsql security definer set search_path = pg_catalog
as $$
declare caller uuid := auth.uid(); access_status text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'CLIENT_AUTH_REQUIRED'; end if;
  -- Same lock used by Stage 1 admission/block/unblock, held until transaction end.
  perform client_access_private.lock_user(caller);
  select a.status into access_status from client_access_private.client_access a where a.user_id = caller for update;
  if access_status is null then raise exception using errcode = '42501', message = 'CLIENT_ACCESS_REQUIRED'; end if;
  if access_status <> 'ACTIVE' then raise exception using errcode = '42501', message = 'CLIENT_ACCESS_BLOCKED'; end if;
  if cardinality(client_access_private.missing_profile_fields(caller)) > 0 then
    raise exception using errcode = '42501', message = 'CLIENT_PROFILE_INCOMPLETE';
  end if;
  return caller;
end;
$$;

create function client_access_private.owned_hold_key(owner_id uuid, browser_key text) returns text
language plpgsql immutable set search_path = pg_catalog
as $$
begin
  if owner_id is null or browser_key is null or char_length(browser_key) not between 20 and 120
    or browser_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using errcode = '22023', message = 'A valid booking hold client key is required.';
  end if;
  -- Isolate refresh/replacement by authenticated owner even if browser keys collide.
  return owner_id::text || ':' || encode(sha256(convert_to(browser_key, 'UTF8')), 'hex');
end;
$$;

alter function public.create_secure_booking(jsonb) set schema client_access_private;
alter function client_access_private.create_secure_booking(jsonb) rename to create_secure_booking_rules;
alter function public.create_secure_order(jsonb) set schema client_access_private;
alter function client_access_private.create_secure_order(jsonb) rename to create_secure_order_rules;
alter function public.create_booking_hold(date, integer, integer, integer, text) set schema client_access_private;
alter function client_access_private.create_booking_hold(date, integer, integer, integer, text) rename to create_booking_hold_rules;
alter function public.release_booking_hold(uuid, uuid, text) set schema client_access_private;
alter function client_access_private.release_booking_hold(uuid, uuid, text) rename to release_booking_hold_rules;
alter function public.cancel_recent_booking_request(uuid, text) set schema client_access_private;
alter function client_access_private.cancel_recent_booking_request(uuid, text) rename to cancel_recent_booking_request_rules;

-- Preserve schema-qualified business references and the existing fixed search paths.
-- The wrappers are the only browser entry points; no caller-supplied admin flag exists.
create function public.create_secure_booking(booking_payload jsonb) returns public.bookings
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  caller uuid := auth.uid();
  is_admin boolean;
  owned_hold public.booking_holds%rowtype;
  payload jsonb := booking_payload;
begin
  if caller is null then raise exception using errcode = '42501', message = 'CLIENT_AUTH_REQUIRED'; end if;
  is_admin := coalesce(public.current_user_is_booking_admin(), false);
  if not is_admin then
    perform client_access_private.assert_creation_access();
    if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Booking payload must be a JSON object.'; end if;
    if nullif(payload ->> 'user_id', '') is not null and (payload ->> 'user_id')::uuid <> caller then
      raise exception using errcode = '42501', message = 'Cannot create a booking for another client.';
    end if;
    select * into owned_hold from public.booking_holds h where h.id = nullif(payload ->> 'hold_id', '')::uuid for update;
    if not found or owned_hold.user_id is distinct from caller then
      raise exception using errcode = '42501', message = 'Booking hold does not belong to this client.';
    end if;
    payload := jsonb_set(payload, '{user_id}', to_jsonb(caller));
    payload := jsonb_set(payload, '{hold_client_key}', to_jsonb(client_access_private.owned_hold_key(caller, payload ->> 'hold_client_key')));
  end if;
  -- Verified admins retain deliberate manual bookings, including for blocked/guest
  -- clients. Original payload allowlists and admin payment rules remain enforced.
  return client_access_private.create_secure_booking_rules(payload);
end;
$$;

create function public.create_secure_order(order_payload jsonb) returns public.orders
language plpgsql security definer set search_path = pg_catalog
as $$
declare caller uuid := auth.uid(); payload jsonb := order_payload;
begin
  if caller is null then raise exception using errcode = '42501', message = 'CLIENT_AUTH_REQUIRED'; end if;
  if not coalesce(public.current_user_is_booking_admin(), false) then
    perform client_access_private.assert_creation_access();
    if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Order payload must be a JSON object.'; end if;
    if nullif(payload ->> 'user_id', '') is not null and (payload ->> 'user_id')::uuid <> caller then
      raise exception using errcode = '42501', message = 'Cannot create an order for another client.';
    end if;
    payload := jsonb_set(payload, '{user_id}', to_jsonb(caller));
  end if;
  return client_access_private.create_secure_order_rules(payload);
end;
$$;

create function public.create_booking_hold(
  hold_date date, hold_start_minutes integer, hold_duration_minutes integer,
  hold_buffer_minutes integer default 60, hold_client_key text default null
) returns table(hold_id uuid, hold_token uuid, expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $$
declare caller uuid := auth.uid(); created_hold record;
begin
  if caller is null then raise exception using errcode = '42501', message = 'CLIENT_AUTH_REQUIRED'; end if;
  if not coalesce(public.current_user_is_booking_admin(), false) then perform client_access_private.assert_creation_access(); end if;
  select * into created_hold from client_access_private.create_booking_hold_rules(
    hold_date, hold_start_minutes, hold_duration_minutes, hold_buffer_minutes,
    client_access_private.owned_hold_key(caller, hold_client_key));
  update public.booking_holds h set user_id = caller where h.id = created_hold.hold_id;
  return query select created_hold.hold_id::uuid, created_hold.hold_token::uuid, created_hold.expires_at::timestamptz;
end;
$$;

create function public.release_booking_hold(release_hold_id uuid, release_hold_token uuid, release_client_key text default null)
returns table(hold_id uuid, released boolean)
language plpgsql security definer set search_path = pg_catalog
as $$
declare caller uuid := auth.uid(); held public.booking_holds%rowtype; is_admin boolean; stored_key text;
begin
  if caller is null then raise exception using errcode = '42501', message = 'CLIENT_AUTH_REQUIRED'; end if;
  is_admin := coalesce(public.current_user_is_booking_admin(), false);
  select * into held from public.booking_holds h where h.id = release_hold_id for update;
  if not found or (held.user_id is distinct from caller and not is_admin) then
    raise exception using errcode = '42501', message = 'Booking hold does not belong to this client.';
  end if;
  -- Release is cleanup, not creation: BLOCKED owners retain it. Admins may release
  -- historical unowned holds if they supply the original token and browser key.
  stored_key := case when held.user_id is null then release_client_key
    else client_access_private.owned_hold_key(held.user_id, release_client_key) end;
  return query select * from client_access_private.release_booking_hold_rules(release_hold_id, release_hold_token, stored_key);
end;
$$;

create function public.cancel_recent_booking_request(booking_id uuid, booking_reference text) returns public.bookings
language plpgsql security definer set search_path = pg_catalog
as $$
declare existing_booking public.bookings%rowtype;
begin
  select * into existing_booking from public.bookings b where b.id = booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking was not found.'; end if;
  if existing_booking.user_id is not null and existing_booking.user_id is distinct from auth.uid() then
    if auth.uid() is null then raise exception using errcode = '42501', message = 'This booking requires its signed-in owner.'; end if;
    if not coalesce(public.current_user_is_booking_admin(), false) then
      raise exception using errcode = '42501', message = 'This booking requires its signed-in owner.';
    end if;
  end if;
  -- Keep reference/time/status validation for guests AND owners; no ACTIVE check.
  return client_access_private.cancel_recent_booking_request_rules(booking_id, booking_reference);
end;
$$;

-- Revoke every overload, not just the modern signatures. Unknown old creation
-- signatures stay inaccessible to both browser roles. No CASCADE or data deletion.
do $revoke_creation_surfaces$
declare fn record; tbl text; col record;
begin
  for fn in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('create_secure_booking','create_secure_order','create_booking_hold','release_booking_hold','cleanup_expired_booking_holds')
  loop execute format('revoke all on function %s from public, anon, authenticated', fn.signature); end loop;
  foreach tbl in array array['bookings','orders','booking_holds'] loop
    execute format('revoke insert on table public.%I from public, anon, authenticated', tbl);
    for col in select a.attname from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass('public.' || tbl) and a.attnum > 0 and not a.attisdropped
    loop execute format('revoke insert (%I) on table public.%I from public, anon, authenticated', col.attname, tbl); end loop;
  end loop;
end;
$revoke_creation_surfaces$;

revoke all on all functions in schema client_access_private from public, anon, authenticated;
grant execute on function public.create_secure_booking(jsonb), public.create_secure_order(jsonb),
  public.create_booking_hold(date, integer, integer, integer, text), public.release_booking_hold(uuid, uuid, text) to authenticated;
revoke all on function public.cancel_recent_booking_request(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_recent_booking_request(uuid, text) to anon, authenticated;
-- Availability, owned booking SELECT, cancel_client_booking, reschedule_client_booking,
-- secure guest linking and admin mutation functions are deliberately unchanged.
commit;
