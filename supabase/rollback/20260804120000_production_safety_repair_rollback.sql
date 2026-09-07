-- Rollback for 20260804120000_production_safety_repair.sql.
--
-- This file restores the known pre-repair function definitions and permissions
-- from repository evidence. It does not delete or rewrite booking/order data.
-- Run only if the repair application or immediate smoke tests fail and rollback
-- is explicitly approved.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Restore the pre-repair booking-reference helper.
create or replace function public.booking_reference_from_notes(booking_notes text)
returns text
language plpgsql
immutable
set search_path = public
as $booking_reference_from_notes$
declare
  parsed_notes jsonb;
begin
  if booking_notes is null or trim(booking_notes) = '' then
    return null;
  end if;

  begin
    parsed_notes := booking_notes::jsonb;
  exception when others then
    return null;
  end;

  return nullif(trim(parsed_notes #>> '{appBooking,bookingReference}'), '');
end;
$booking_reference_from_notes$;

revoke all on function public.booking_reference_from_notes(text) from public;

-- The repair added this helper. It is not part of the pre-repair surface.
drop function if exists public.booking_app_notes_json(text);

-- Restore the pre-repair public availability function.
create or replace function public.get_public_booking_blocks(start_date date, end_date date)
returns table (
  booking_id uuid,
  date date,
  start_minutes integer,
  duration_minutes integer,
  buffer_minutes integer
)
language sql
security definer
set search_path = public, pg_temp
stable
as $get_public_booking_blocks$
  select
    b.id as booking_id,
    b.date,
    b.start_minutes,
    b.duration_minutes,
    coalesce(nullif(b.notes::jsonb #>> '{appBooking,travelBuffer}', '')::integer, 60) as buffer_minutes
  from public.bookings b
  where b.date between start_date and end_date
    and coalesce(b.status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded', 'completed', 'no-show', 'no_show')
    and coalesce(b.payment_status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded')
  union all
  select
    h.id as booking_id,
    h.date,
    h.start_minutes,
    h.duration_minutes,
    h.buffer_minutes
  from public.booking_holds h
  where h.date between start_date and end_date
    and h.expires_at > now()
    and h.released_at is null
  order by 2, 3;
$get_public_booking_blocks$;

revoke all on function public.get_public_booking_blocks(date, date) from public;
grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;

-- Restore obsolete pre-repair hold overloads. These are intentionally restored
-- only for rollback to the previous production surface.
create or replace function public.create_booking_hold(
  hold_date date,
  hold_start_minutes integer,
  hold_duration_minutes integer,
  hold_buffer_minutes integer
)
returns table (
  hold_id uuid,
  hold_token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $legacy_create_booking_hold$
declare
  minimum_notice_minutes constant integer := 120;
  london_today date := (now() at time zone 'Europe/London')::date;
  london_now_minutes integer := (
    extract(hour from now() at time zone 'Europe/London')::integer * 60
    + extract(minute from now() at time zone 'Europe/London')::integer
  );
  hold_end integer := hold_start_minutes + hold_duration_minutes + hold_buffer_minutes;
begin
  delete from public.booking_holds as expired_holds
  where expired_holds.expires_at <= now();

  if hold_date < london_today then
    raise exception 'Booking hold date cannot be in the past.';
  end if;

  if hold_date = london_today and hold_start_minutes < london_now_minutes + minimum_notice_minutes then
    raise exception 'Online appointments need at least 2 hours notice. Please choose a later time.';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.status = 'confirmed'
      and b.date = hold_date
      and hold_start_minutes < b.start_minutes + b.duration_minutes + coalesce(nullif(b.notes::jsonb #>> '{appBooking,travelBuffer}', '')::integer, 60)
      and b.start_minutes < hold_end
  ) or exists (
    select 1
    from public.booking_holds h
    where h.expires_at > now()
      and h.date = hold_date
      and hold_start_minutes < h.start_minutes + h.duration_minutes + h.buffer_minutes
      and h.start_minutes < hold_end
  ) then
    raise exception 'Time slot is no longer available.';
  end if;

  return query
  insert into public.booking_holds (
    date,
    start_minutes,
    duration_minutes,
    buffer_minutes,
    expires_at
  )
  values (
    hold_date,
    hold_start_minutes,
    hold_duration_minutes,
    hold_buffer_minutes,
    now() + interval '10 minutes'
  )
  returning booking_holds.id, booking_holds.hold_token, booking_holds.expires_at;
end;
$legacy_create_booking_hold$;

create or replace function public.release_booking_hold(
  release_hold_id uuid,
  release_hold_token uuid
)
returns void
language sql
security definer
set search_path = public
as $legacy_release_booking_hold$
  delete from public.booking_holds
  where id = release_hold_id
    and hold_token = release_hold_token;
$legacy_release_booking_hold$;

grant execute on function public.create_booking_hold(date, integer, integer, integer) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid) to anon, authenticated;

-- Keep the modern hold functions on their pre-repair permissions.
revoke all on function public.create_booking_hold(date, integer, integer, integer, text) from public;
revoke all on function public.release_booking_hold(uuid, uuid, text) from public;
grant execute on function public.create_booking_hold(date, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid, text) to anon, authenticated;

-- Restore pre-repair guest-booking linking.
create or replace function public.link_recent_guest_booking_to_client(link_payload jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $link_recent_guest_booking_to_client$
declare
  requested_user_id uuid := auth.uid();
  requested_saved_address_id uuid;
  booking_items jsonb;
  booking_item jsonb;
  requested_booking_id uuid;
  linked_booking_id uuid;
  requested_booking_reference text;
  linked_ids uuid[] := array[]::uuid[];
begin
  if requested_user_id is null then
    raise exception 'A signed-in client is required.';
  end if;

  if link_payload is null or jsonb_typeof(link_payload) <> 'object' then
    raise exception 'A booking link payload is required.';
  end if;

  booking_items := coalesce(link_payload -> 'bookings', '[]'::jsonb);
  if jsonb_typeof(booking_items) <> 'array' or jsonb_array_length(booking_items) = 0 then
    raise exception 'At least one recent booking is required.';
  end if;

  if jsonb_array_length(booking_items) > 5 then
    raise exception 'Too many bookings were supplied.';
  end if;

  requested_saved_address_id := nullif(link_payload ->> 'saved_address_id', '')::uuid;
  if requested_saved_address_id is not null and not exists (
    select 1
    from public.client_addresses as saved_address
    where saved_address.id = requested_saved_address_id
      and saved_address.user_id = requested_user_id
  ) then
    raise exception 'Saved address is not available for this client.';
  end if;

  for booking_item in select * from jsonb_array_elements(booking_items)
  loop
    requested_booking_id := nullif(booking_item ->> 'id', '')::uuid;
    requested_booking_reference := nullif(trim(coalesce(
      booking_item ->> 'booking_reference',
      booking_item ->> 'bookingReference'
    )), '');

    if requested_booking_id is null or requested_booking_reference is null then
      raise exception 'Booking id and reference are required.';
    end if;

    linked_booking_id := null;

    update public.bookings
    set
      user_id = requested_user_id,
      saved_address_id = coalesce(requested_saved_address_id, saved_address_id)
    where id = requested_booking_id
      and user_id is null
      and public.booking_reference_from_notes(notes) = requested_booking_reference
    returning id into linked_booking_id;

    if linked_booking_id is null then
      raise exception 'Booking is not available to link.';
    end if;

    linked_ids := array_append(linked_ids, linked_booking_id);
  end loop;

  return linked_ids;
end;
$link_recent_guest_booking_to_client$;

revoke all on function public.link_recent_guest_booking_to_client(jsonb) from public;
grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;

-- Restore pre-repair client rescheduling.
create or replace function public.reschedule_client_booking(
  booking_id uuid,
  new_date date,
  new_start_minutes integer
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $reschedule_client_booking$
declare
  current_user_id uuid := auth.uid();
  existing_booking public.bookings%rowtype;
  updated_booking public.bookings%rowtype;
  normalized_status text;
  normalized_payment_status text;
  new_end_minutes integer;
  existing_start_at timestamp;
  bookings_has_updated_at boolean;
begin
  if current_user_id is null then
    raise exception 'A signed-in client is required to reschedule this booking.' using errcode = '42501';
  end if;

  if booking_id is null then
    raise exception 'Booking id is required.';
  end if;

  if new_date is null then
    raise exception 'New booking date is required.';
  end if;

  if new_start_minutes is null or new_start_minutes < 0 or new_start_minutes >= 1440 then
    raise exception 'New start time is invalid.';
  end if;

  select *
    into existing_booking
  from public.bookings
  where id = booking_id
  for update;

  if not found then
    raise exception 'Booking was not found.' using errcode = 'P0002';
  end if;

  if existing_booking.user_id is distinct from current_user_id then
    raise exception 'This booking does not belong to the signed-in client.' using errcode = '42501';
  end if;

  normalized_status := lower(coalesce(existing_booking.status, ''));
  normalized_payment_status := lower(coalesce(existing_booking.payment_status, ''));

  if normalized_status in ('cancelled', 'canceled', 'expired', 'completed', 'refunded', 'no-show', 'no_show')
    or normalized_payment_status in ('cancelled', 'canceled', 'expired', 'refunded')
  then
    raise exception 'This booking cannot be rescheduled online.';
  end if;

  if normalized_status not in ('confirmed', 'pending_payment_verification', 'payment_method_review') then
    raise exception 'This booking cannot be rescheduled online yet.';
  end if;

  if coalesce(existing_booking.duration_minutes, 0) <= 0 then
    raise exception 'Booking duration is invalid.';
  end if;

  existing_start_at := existing_booking.date::timestamp
    + make_interval(mins => coalesce(existing_booking.start_minutes, 0));

  if existing_start_at <= ((now() at time zone 'Europe/London') + interval '24 hours') then
    raise exception 'Online rescheduling is available up to 24 hours before your appointment. Please contact me directly.';
  end if;

  new_end_minutes := new_start_minutes + existing_booking.duration_minutes;

  if new_end_minutes > 1440 then
    raise exception 'New booking time is outside the working day.';
  end if;

  if exists (
    select 1
    from public.bookings as conflict_booking
    where conflict_booking.date = new_date
      and conflict_booking.id <> booking_id
      and lower(coalesce(conflict_booking.status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'completed',
        'refunded',
        'no-show',
        'no_show'
      )
      and lower(coalesce(conflict_booking.payment_status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'refunded'
      )
      and new_start_minutes < coalesce(
        conflict_booking.end_minutes,
        conflict_booking.start_minutes + conflict_booking.duration_minutes
      )
      and new_end_minutes > conflict_booking.start_minutes
  ) then
    raise exception 'That time is no longer available.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'updated_at'
  ) into bookings_has_updated_at;

  if bookings_has_updated_at then
    execute
      'update public.bookings
          set date = $1,
              start_minutes = $2,
              end_minutes = $3,
              updated_at = now()
        where id = $4
        returning *'
      using new_date, new_start_minutes, new_end_minutes, booking_id
      into updated_booking;
  else
    update public.bookings
       set date = new_date,
           start_minutes = new_start_minutes,
           end_minutes = new_end_minutes
     where id = booking_id
     returning * into updated_booking;
  end if;

  return updated_booking;
end;
$reschedule_client_booking$;

revoke all on function public.reschedule_client_booking(uuid, date, integer) from public;
grant execute on function public.reschedule_client_booking(uuid, date, integer) to authenticated;

-- Restore pre-repair order creation.
create or replace function public.create_secure_order(order_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $secure_order$
declare
  allowed_keys constant text[] := array[
    'id',
    'user_id',
    'client_email',
    'client_name',
    'payment_id',
    'payment_provider',
    'payment_status',
    'total_amount'
  ];
  requested_user_id uuid;
  effective_user_id uuid;
  created_order public.orders%rowtype;
begin
  if order_payload is null or jsonb_typeof(order_payload) <> 'object' then
    raise exception 'Order payload must be a JSON object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(order_payload) as supplied(key)
    where not (supplied.key = any(allowed_keys))
  ) then
    raise exception 'Order payload contains unsupported fields.';
  end if;

  requested_user_id := nullif(order_payload ->> 'user_id', '')::uuid;

  if auth.uid() is null then
    effective_user_id := null;
  elsif public.current_user_is_booking_admin() then
    effective_user_id := requested_user_id;
  else
    effective_user_id := auth.uid();
    if requested_user_id is not null and requested_user_id <> auth.uid() then
      raise exception 'Cannot create an order for another client.';
    end if;
  end if;

  insert into public.orders (
    id,
    user_id,
    client_id,
    client_name,
    client_email,
    payment_provider,
    payment_id,
    payment_status,
    total_amount
  )
  values (
    coalesce(nullif(order_payload ->> 'id', '')::uuid, gen_random_uuid()),
    effective_user_id,
    effective_user_id,
    nullif(trim(order_payload ->> 'client_name'), ''),
    lower(nullif(trim(order_payload ->> 'client_email'), '')),
    nullif(trim(order_payload ->> 'payment_provider'), ''),
    nullif(trim(order_payload ->> 'payment_id'), ''),
    coalesce(nullif(trim(order_payload ->> 'payment_status'), ''), 'pending'),
    greatest(coalesce(nullif(order_payload ->> 'total_amount', '')::numeric, 0), 0)
  )
  returning * into created_order;

  return created_order;
end;
$secure_order$;

revoke all on function public.create_secure_order(jsonb) from public;
grant execute on function public.create_secure_order(jsonb) to anon, authenticated;

commit;

-- Cannot be safely reversed automatically:
-- - Any legitimate booking/order rows created while the repair was active.
-- - Any client guest-booking links or reschedules performed while the repair was active.
-- Investigate those records manually if rollback is required after live traffic.
