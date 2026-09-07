-- Keep all booking updates behind the admin-only RPC boundary.
-- This replaces the update RPC so payment status and cancellation metadata are
-- persisted without requiring any direct table-update fallback in the frontend.

create or replace function public.update_secure_booking(booking_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
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
    'cancelled_at',
    'cancelled_by',
    'cancellation_window',
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
  normalized_payment_status text;
  normalized_cancelled_at timestamptz;
  normalized_cancelled_by text;
  normalized_cancellation_window text;
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
  normalized_payment_status := coalesce(nullif(trim(booking_payload ->> 'payment_status'), ''), 'pending');
  normalized_cancelled_at := nullif(booking_payload ->> 'cancelled_at', '')::timestamptz;
  normalized_cancelled_by := nullif(trim(booking_payload ->> 'cancelled_by'), '');
  normalized_cancellation_window := nullif(trim(booking_payload ->> 'cancellation_window'), '');

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
  if normalized_status not in ('confirmed', 'pending', 'pending_payment_verification', 'payment_method_review', 'cancelled', 'canceled', 'completed', 'expired', 'refunded', 'rejected', 'no-show', 'no_show') then
    raise exception 'Booking status is invalid.';
  end if;
  if normalized_payment_status not in ('paid', 'pending', 'awaiting_verification', 'cash_on_arrival', 'alternative_requested', 'cancelled', 'canceled', 'expired', 'refunded', 'rejected') then
    raise exception 'Payment status is invalid.';
  end if;
  if normalized_cancelled_by is not null and normalized_cancelled_by not in ('client', 'admin') then
    raise exception 'Cancellation source is invalid.';
  end if;
  if normalized_cancellation_window is not null and normalized_cancellation_window not in ('free', 'grace', 'late') then
    raise exception 'Cancellation window is invalid.';
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

  perform pg_advisory_xact_lock(hashtext('booking-date:' || requested_date::text));

  if exists (
    select 1
    from public.bookings as existing_booking
    where existing_booking.id <> requested_id
      and existing_booking.date = requested_date
      and lower(coalesce(existing_booking.status, 'confirmed')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'refunded',
        'completed',
        'no-show',
        'no_show'
      )
      and lower(coalesce(existing_booking.payment_status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'refunded'
      )
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
    payment_status = normalized_payment_status,
    cancelled_at = normalized_cancelled_at,
    cancelled_by = normalized_cancelled_by,
    cancellation_window = normalized_cancellation_window,
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
