-- Production safety repair for booking holds, client rescheduling, guest linking,
-- order creation, and legacy notes in public availability.
--
-- This migration is additive/reparative. It intentionally does not edit older
-- migration files because production migration history may not match the local
-- repository.

create or replace function public.booking_app_notes_json(booking_notes text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $booking_app_notes_json$
begin
  if booking_notes is null or trim(booking_notes) = '' then
    return '{}'::jsonb;
  end if;

  return booking_notes::jsonb;
exception
  when others then
    return '{}'::jsonb;
end;
$booking_app_notes_json$;

revoke all on function public.booking_app_notes_json(text) from public;

create or replace function public.booking_reference_from_notes(booking_notes text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $booking_reference_from_notes$
declare
  parsed_notes jsonb;
begin
  parsed_notes := public.booking_app_notes_json(booking_notes);
  return coalesce(
    nullif(trim(parsed_notes #>> '{appBooking,bookingReference}'), ''),
    nullif(trim(parsed_notes #>> '{appBooking,paymentReference}'), '')
  );
end;
$booking_reference_from_notes$;

revoke all on function public.booking_reference_from_notes(text) from public;

-- Retire obsolete hold overloads that do not bind a hold to a client key. If the
-- overloads are already absent, these statements are harmless.
drop function if exists public.create_booking_hold(date, integer, integer, integer);
drop function if exists public.release_booking_hold(uuid, uuid);

-- Preserve the intended modern hold API.
revoke all on function public.create_booking_hold(date, integer, integer, integer, text) from public;
revoke all on function public.release_booking_hold(uuid, uuid, text) from public;
grant execute on function public.create_booking_hold(date, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid, text) to anon, authenticated;

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
    coalesce(nullif(public.booking_app_notes_json(b.notes) #>> '{appBooking,travelBuffer}', '')::integer, 60) as buffer_minutes
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

create or replace function public.reschedule_client_booking(
  booking_id uuid,
  new_date date,
  new_start_minutes integer
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $reschedule_client_booking$
declare
  current_user_id uuid := auth.uid();
  existing_booking public.bookings%rowtype;
  updated_booking public.bookings%rowtype;
  normalized_status text;
  normalized_payment_status text;
  london_today date := (now() at time zone 'Europe/London')::date;
  london_now_minutes integer := (
    extract(hour from now() at time zone 'Europe/London')::integer * 60
    + extract(minute from now() at time zone 'Europe/London')::integer
  );
  requested_duration integer;
  requested_buffer integer;
  new_end_minutes integer;
  new_buffer_end_minutes integer;
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

  if new_date < london_today then
    raise exception 'Past dates cannot be booked online. Please choose today or a future date.';
  end if;

  if new_date > london_today + 40 then
    raise exception 'Online appointments can currently be arranged up to 40 days ahead. Please choose an earlier date.';
  end if;

  if new_start_minutes is null or new_start_minutes < 0 or new_start_minutes >= 1440 then
    raise exception 'New start time is invalid.';
  end if;

  if new_date = london_today and new_start_minutes < london_now_minutes + 120 then
    raise exception 'Online appointments need at least 2 hours notice. Please choose a later time.';
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

  requested_duration := coalesce(existing_booking.duration_minutes, 0);
  requested_buffer := coalesce(nullif(public.booking_app_notes_json(existing_booking.notes) #>> '{appBooking,travelBuffer}', '')::integer, 60);

  if requested_duration <= 0 or not (requested_duration = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) then
    raise exception 'Booking duration is invalid.';
  end if;

  if requested_buffer < 0 or requested_buffer > 240 then
    raise exception 'Booking travel buffer is invalid.';
  end if;

  existing_start_at := existing_booking.date::timestamp
    + make_interval(mins => coalesce(existing_booking.start_minutes, 0));

  if existing_start_at <= ((now() at time zone 'Europe/London') + interval '24 hours') then
    raise exception 'Online rescheduling is available up to 24 hours before your appointment. Please contact me directly.';
  end if;

  new_end_minutes := new_start_minutes + requested_duration;
  new_buffer_end_minutes := new_end_minutes + requested_buffer;

  if new_end_minutes > 1440 or new_buffer_end_minutes > 1680 then
    raise exception 'New booking time is outside the working day.';
  end if;

  perform pg_advisory_xact_lock(hashtext('booking-date:' || existing_booking.date::text));
  perform pg_advisory_xact_lock(hashtext('booking-date:' || new_date::text));

  if exists (
    select 1
    from public.bookings as conflict_booking
    where conflict_booking.date = new_date
      and conflict_booking.id <> booking_id
      and lower(coalesce(conflict_booking.status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'completed',
        'refunded',
        'no-show',
        'no_show'
      )
      and lower(coalesce(conflict_booking.payment_status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'refunded'
      )
      and int4range(
        conflict_booking.start_minutes,
        coalesce(conflict_booking.end_minutes, conflict_booking.start_minutes + conflict_booking.duration_minutes)
          + coalesce(nullif(public.booking_app_notes_json(conflict_booking.notes) #>> '{appBooking,travelBuffer}', '')::integer, 60),
        '[)'
      ) && int4range(new_start_minutes, new_buffer_end_minutes, '[)')
  ) then
    raise exception 'That time is no longer available.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.booking_holds as active_hold
    where active_hold.date = new_date
      and active_hold.expires_at > now()
      and active_hold.released_at is null
      and int4range(
        active_hold.start_minutes,
        active_hold.start_minutes + active_hold.duration_minutes + active_hold.buffer_minutes,
        '[)'
      ) && int4range(new_start_minutes, new_buffer_end_minutes, '[)')
  ) then
    raise exception 'That time is currently being held. Please choose another time.' using errcode = '23P01';
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

create or replace function public.link_recent_guest_booking_to_client(link_payload jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $link_recent_guest_booking_to_client$
declare
  requested_user_id uuid := auth.uid();
  authenticated_email text := lower(nullif(trim(auth.jwt() ->> 'email'), ''));
  requested_saved_address_id uuid;
  booking_items jsonb;
  booking_item jsonb;
  requested_booking_id uuid;
  linked_booking_id uuid;
  requested_booking_reference text;
  linked_ids uuid[] := array[]::uuid[];
begin
  if requested_user_id is null then
    raise exception 'A signed-in client is required.' using errcode = '42501';
  end if;

  if authenticated_email is null then
    raise exception 'A verified email address is required to link this booking.' using errcode = '42501';
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
    raise exception 'Saved address is not available for this client.' using errcode = '42501';
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
      and (
        user_id is null
        or user_id = requested_user_id
      )
      and upper(public.booking_reference_from_notes(notes)) = upper(requested_booking_reference)
      and lower(client_email) = authenticated_email
      and created_at > now() - interval '24 hours'
    returning id into linked_booking_id;

    if linked_booking_id is null then
      raise exception 'Booking is not available to link.' using errcode = '42501';
    end if;

    linked_ids := array_append(linked_ids, linked_booking_id);
  end loop;

  return linked_ids;
end;
$link_recent_guest_booking_to_client$;

revoke all on function public.link_recent_guest_booking_to_client(jsonb) from public;
grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;

create or replace function public.create_secure_order(order_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
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
  requested_status text;
  normalized_status text;
  normalized_total numeric(10,2);
  created_order public.orders%rowtype;
  is_admin boolean := public.current_user_is_booking_admin();
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
  requested_status := coalesce(nullif(trim(order_payload ->> 'payment_status'), ''), 'pending');

  if auth.uid() is null then
    effective_user_id := null;
  elsif is_admin then
    effective_user_id := requested_user_id;
  else
    effective_user_id := auth.uid();
    if requested_user_id is not null and requested_user_id <> auth.uid() then
      raise exception 'Cannot create an order for another client.' using errcode = '42501';
    end if;
  end if;

  if is_admin then
    if requested_status not in ('paid', 'pending', 'awaiting_verification', 'cash_on_arrival', 'alternative_requested', 'cancelled', 'canceled', 'expired', 'refunded', 'rejected') then
      raise exception 'Payment status is invalid.';
    end if;
    normalized_status := requested_status;
    normalized_total := round(greatest(coalesce(nullif(order_payload ->> 'total_amount', '')::numeric, 0), 0), 2);
  else
    if requested_status not in ('pending', 'awaiting_verification', 'cash_on_arrival', 'alternative_requested') then
      raise exception 'Clients cannot create orders with this payment status.' using errcode = '42501';
    end if;
    normalized_status := requested_status;
    -- Current client pricing is computed in the application and persisted on the
    -- authoritative booking. Do not treat a client-supplied order amount as
    -- trusted payment evidence.
    normalized_total := 0;
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
    normalized_status,
    normalized_total
  )
  returning * into created_order;

  return created_order;
end;
$secure_order$;

revoke all on function public.create_secure_order(jsonb) from public;
grant execute on function public.create_secure_order(jsonb) to anon, authenticated;
