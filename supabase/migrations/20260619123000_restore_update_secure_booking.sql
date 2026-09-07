-- Restore the secure admin booking update RPC after the client-security rebuild.
-- The frontend calls this function for admin edits such as "Mark Payment Received".

create or replace function public.update_secure_booking(booking_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $secure_booking_update$
declare
  allowed_keys constant text[] := array[
    'id',
    'order_id',
    'user_id',
    'saved_address_id',
    'client_name',
    'client_email',
    'client_phone',
    'service_id',
    'service',
    'service_name',
    'date',
    'start_minutes',
    'end_minutes',
    'duration_minutes',
    'address',
    'postcode',
    'selected_area',
    'price',
    'travel_fee',
    'congestion_fee',
    'payment_id',
    'status',
    'payment_status',
    'notes',
    'selected_services',
    'selected_durations'
  ];
  requested_id uuid;
  requested_order_id uuid;
  requested_user_id uuid;
  requested_saved_address_id uuid;
  requested_date date;
  requested_start integer;
  requested_duration integer;
  requested_end integer;
  normalized_service text;
  normalized_status text;
  updated_booking public.bookings%rowtype;
begin
  if booking_payload is null or jsonb_typeof(booking_payload) <> 'object' then
    raise exception 'Booking payload must be a JSON object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(booking_payload) as supplied(key)
    where not (supplied.key = any(allowed_keys))
  ) then
    raise exception 'Booking payload contains unsupported fields.';
  end if;

  if not public.current_user_is_booking_admin() then
    raise exception 'Only booking admins may update bookings.' using errcode = '42501';
  end if;

  requested_id := nullif(booking_payload ->> 'id', '')::uuid;
  requested_order_id := nullif(booking_payload ->> 'order_id', '')::uuid;
  requested_user_id := nullif(booking_payload ->> 'user_id', '')::uuid;
  requested_saved_address_id := nullif(booking_payload ->> 'saved_address_id', '')::uuid;
  requested_date := nullif(booking_payload ->> 'date', '')::date;
  requested_start := nullif(booking_payload ->> 'start_minutes', '')::integer;
  requested_duration := nullif(booking_payload ->> 'duration_minutes', '')::integer;
  requested_end := coalesce(
    nullif(booking_payload ->> 'end_minutes', '')::integer,
    requested_start + requested_duration
  );
  normalized_service := trim(coalesce(booking_payload ->> 'service_name', booking_payload ->> 'service', ''));
  normalized_status := coalesce(nullif(trim(booking_payload ->> 'status'), ''), 'confirmed');

  if requested_id is null then
    raise exception 'Booking id is required for updates.';
  end if;
  if requested_date is null then
    raise exception 'Booking date is required.';
  end if;
  if requested_start is null or requested_start < 0 or requested_start >= 1440 then
    raise exception 'Booking start time is invalid.';
  end if;
  if requested_duration is null or requested_duration <= 0 or not (requested_duration = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) then
    raise exception 'Booking duration must be one of: 60, 90, 120, 150, 180, 210, 240 minutes.';
  end if;
  if requested_end <= requested_start or requested_end > 2880 then
    raise exception 'Booking end time is invalid.';
  end if;
  if normalized_status not in ('confirmed', 'pending', 'pending_payment_verification', 'payment_method_review', 'cancelled', 'completed', 'refunded', 'no-show') then
    raise exception 'Booking status is invalid.';
  end if;
  if nullif(trim(booking_payload ->> 'client_name'), '') is null then
    raise exception 'Client name is required.';
  end if;
  if nullif(trim(booking_payload ->> 'client_email'), '') is null then
    raise exception 'Client email is required.';
  end if;
  if normalized_service = '' then
    raise exception 'Service name is required.';
  end if;

  if requested_saved_address_id is not null and not exists (
    select 1
    from public.client_addresses as saved_address
    where saved_address.id = requested_saved_address_id
      and (
        saved_address.user_id = requested_user_id
        or public.current_user_is_booking_admin()
      )
  ) then
    raise exception 'Saved address is not available to this client.';
  end if;

  if requested_order_id is not null and not exists (
    select 1
    from public.orders as existing_order
    where existing_order.id = requested_order_id
  ) then
    raise exception 'Order is not available to this booking.';
  end if;

  perform pg_advisory_xact_lock(hashtext(requested_date::text));

  if exists (
    select 1
    from public.bookings as existing_booking
    where existing_booking.id <> requested_id
      and existing_booking.date = requested_date
      and existing_booking.status not in ('cancelled', 'refunded')
      and requested_start < coalesce(
        existing_booking.end_minutes,
        existing_booking.start_minutes + existing_booking.duration_minutes
      )
      and existing_booking.start_minutes < requested_end
  ) then
    raise exception 'Time slot is no longer available.' using errcode = '23P01';
  end if;

  update public.bookings
  set
    order_id = requested_order_id,
    user_id = requested_user_id,
    saved_address_id = requested_saved_address_id,
    client_name = trim(booking_payload ->> 'client_name'),
    client_email = lower(trim(booking_payload ->> 'client_email')),
    client_phone = nullif(trim(booking_payload ->> 'client_phone'), ''),
    service_id = nullif(trim(booking_payload ->> 'service_id'), ''),
    service = normalized_service,
    service_name = normalized_service,
    date = requested_date,
    start_minutes = requested_start,
    end_minutes = requested_end,
    duration_minutes = requested_duration,
    address = nullif(trim(booking_payload ->> 'address'), ''),
    postcode = nullif(upper(trim(booking_payload ->> 'postcode')), ''),
    selected_area = nullif(trim(booking_payload ->> 'selected_area'), ''),
    price = greatest(coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0), 0),
    travel_fee = greatest(coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0), 0),
    congestion_fee = greatest(coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0), 0),
    payment_id = nullif(trim(booking_payload ->> 'payment_id'), ''),
    status = normalized_status,
    notes = nullif(booking_payload ->> 'notes', ''),
    selected_services = coalesce(booking_payload -> 'selected_services', '[]'::jsonb),
    selected_durations = coalesce(booking_payload -> 'selected_durations', '[]'::jsonb)
  where id = requested_id
  returning * into updated_booking;

  if not found then
    raise exception 'Booking update failed because the booking could not be found.';
  end if;

  return updated_booking;
end;
$secure_booking_update$;

revoke all on function public.update_secure_booking(jsonb) from public;
grant execute on function public.update_secure_booking(jsonb) to authenticated;

-- Booking references are persisted inside notes.appBooking in the current app
-- schema. Keep this helper private to the database and use it for a uniqueness
-- index without exposing direct public booking updates.
create or replace function public.booking_reference_from_notes(booking_notes text)
returns text
language plpgsql
immutable
set search_path = public
as $booking_reference_from_notes$
declare
  parsed_notes jsonb;
  extracted_reference text;
begin
  if booking_notes is null or trim(booking_notes) = '' then
    return null;
  end if;

  parsed_notes := booking_notes::jsonb;
  extracted_reference := coalesce(
    nullif(trim(parsed_notes #>> '{appBooking,bookingReference}'), ''),
    nullif(trim(parsed_notes #>> '{appBooking,paymentReference}'), '')
  );

  return extracted_reference;
exception
  when others then
    return null;
end;
$booking_reference_from_notes$;

revoke all on function public.booking_reference_from_notes(text) from public;

-- If QA/local data already contains duplicate references, disambiguate the
-- older duplicates before creating the unique index. This keeps the migration
-- deployable while preserving the original reference prefix for auditability.
with referenced_bookings as (
  select
    id,
    public.booking_reference_from_notes(notes) as booking_reference,
    row_number() over (
      partition by public.booking_reference_from_notes(notes)
      order by created_at nulls last, id
    ) as duplicate_position
  from public.bookings
  where public.booking_reference_from_notes(notes) is not null
),
duplicate_bookings as (
  select
    id,
    booking_reference || '-' || upper(left(replace(id::text, '-', ''), 4)) as unique_reference
  from referenced_bookings
  where duplicate_position > 1
)
update public.bookings as booking
set notes = jsonb_set(
  jsonb_set(
    booking.notes::jsonb,
    '{appBooking,bookingReference}',
    to_jsonb(duplicate_bookings.unique_reference),
    true
  ),
  '{appBooking,paymentReference}',
  to_jsonb(duplicate_bookings.unique_reference),
  true
)::text
from duplicate_bookings
where booking.id = duplicate_bookings.id;

create unique index if not exists bookings_app_booking_reference_unique
on public.bookings (public.booking_reference_from_notes(notes))
where public.booking_reference_from_notes(notes) is not null;
