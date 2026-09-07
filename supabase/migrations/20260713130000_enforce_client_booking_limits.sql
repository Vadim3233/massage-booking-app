-- Enforce client booking limits inside the authoritative booking RPC.
-- Client rules:
-- - no completed+paid history: max 1 active future appointment
-- - completed+paid history: max 5 active future appointments
-- - online client bookings: max 40 calendar days ahead
-- Admins may deliberately bypass these client-only limits.

create or replace function public.create_secure_booking(booking_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $secure_booking$
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
    'payment_status',
    'status',
    'notes',
    'selected_services',
    'selected_durations',
    'hold_id',
    'hold_token',
    'hold_client_key'
  ];
  requested_id uuid;
  requested_user_id uuid;
  effective_user_id uuid;
  requested_order_id uuid;
  requested_saved_address_id uuid;
  requested_hold_id uuid;
  requested_hold_token uuid;
  requested_hold_client_key text;
  matched_hold public.booking_holds%rowtype;
  requested_date date;
  requested_start integer;
  requested_duration integer;
  requested_end integer;
  normalized_email text;
  normalized_name text;
  normalized_phone text;
  normalized_service text;
  normalized_status text;
  normalized_payment_status text;
  normalized_services jsonb;
  normalized_durations jsonb;
  normalized_price numeric(10,2);
  normalized_travel_fee numeric(10,2);
  normalized_congestion_fee numeric(10,2);
  normalized_reference text;
  is_admin boolean := public.current_user_is_booking_admin();
  minimum_notice_minutes constant integer := 120;
  london_today date := (now() at time zone 'Europe/London')::date;
  london_now_minutes integer := (
    extract(hour from now() at time zone 'Europe/London')::integer * 60
    + extract(minute from now() at time zone 'Europe/London')::integer
  );
  identity_lock_key text;
  returning_client boolean := false;
  active_future_count integer := 0;
  created_booking public.bookings%rowtype;
begin
  if booking_payload is null or jsonb_typeof(booking_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Booking payload must be a JSON object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(booking_payload) as supplied(key)
    where not (supplied.key = any(allowed_keys))
  ) then
    raise exception using errcode = '22023', message = 'Booking payload contains unsupported fields.';
  end if;

  requested_id := coalesce(nullif(booking_payload ->> 'id', '')::uuid, gen_random_uuid());
  requested_user_id := nullif(booking_payload ->> 'user_id', '')::uuid;
  requested_order_id := nullif(booking_payload ->> 'order_id', '')::uuid;
  requested_saved_address_id := nullif(booking_payload ->> 'saved_address_id', '')::uuid;
  requested_hold_id := nullif(booking_payload ->> 'hold_id', '')::uuid;
  requested_hold_token := nullif(booking_payload ->> 'hold_token', '')::uuid;
  requested_hold_client_key := nullif(trim(booking_payload ->> 'hold_client_key'), '');

  requested_date := nullif(booking_payload ->> 'date', '')::date;
  requested_start := nullif(booking_payload ->> 'start_minutes', '')::integer;
  requested_duration := nullif(booking_payload ->> 'duration_minutes', '')::integer;
  requested_end := coalesce(
    nullif(booking_payload ->> 'end_minutes', '')::integer,
    requested_start + requested_duration
  );

  normalized_email := lower(trim(coalesce(booking_payload ->> 'client_email', '')));
  normalized_name := trim(coalesce(booking_payload ->> 'client_name', ''));
  normalized_phone := nullif(regexp_replace(trim(coalesce(booking_payload ->> 'client_phone', '')), '\s+', '', 'g'), '');
  normalized_service := trim(coalesce(booking_payload ->> 'service_name', booking_payload ->> 'service', ''));
  normalized_services := coalesce(booking_payload -> 'selected_services', '[]'::jsonb);
  normalized_durations := coalesce(booking_payload -> 'selected_durations', '[]'::jsonb);
  normalized_price := round(greatest(coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0), 0), 2);
  normalized_travel_fee := round(greatest(coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0), 0), 2);
  normalized_congestion_fee := round(greatest(coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0), 0), 2);
  normalized_reference := nullif(trim(coalesce(
    booking_payload ->> 'booking_reference',
    public.booking_reference_from_notes(booking_payload ->> 'notes')
  )), '');

  normalized_status := case
    when is_admin and booking_payload ->> 'status' in (
      'confirmed',
      'pending',
      'pending_payment_verification',
      'payment_method_review',
      'cancelled',
      'canceled',
      'completed',
      'expired',
      'refunded',
      'rejected',
      'no-show',
      'no_show'
    ) then booking_payload ->> 'status'
    when booking_payload ->> 'status' in (
      'confirmed',
      'pending',
      'pending_payment_verification',
      'payment_method_review'
    ) then booking_payload ->> 'status'
    else 'confirmed'
  end;

  normalized_payment_status := case
    when is_admin and booking_payload ->> 'payment_status' in (
      'paid',
      'pending',
      'awaiting_verification',
      'cash_on_arrival',
      'alternative_requested',
      'cancelled',
      'canceled',
      'expired',
      'refunded',
      'rejected'
    ) then booking_payload ->> 'payment_status'
    when booking_payload ->> 'payment_status' in (
      'pending',
      'awaiting_verification',
      'cash_on_arrival',
      'alternative_requested'
    ) then booking_payload ->> 'payment_status'
    when normalized_status = 'pending_payment_verification' then 'awaiting_verification'
    when normalized_status = 'payment_method_review' then 'pending'
    else 'pending'
  end;

  if requested_date is null then
    raise exception using errcode = '22023', message = 'Booking date is required.';
  end if;
  if requested_start is null or requested_start < 0 or requested_start >= 1440 then
    raise exception using errcode = '22023', message = 'Booking start time is invalid.';
  end if;
  if requested_duration is null or requested_duration <= 0 or not (requested_duration = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) then
    raise exception using errcode = '22023', message = 'Booking duration must be one of: 60, 90, 120, 150, 180, 210, 240 minutes.';
  end if;
  if requested_end <= requested_start or requested_end > 1440 then
    raise exception using errcode = '22023', message = 'Booking end time is invalid.';
  end if;
  if requested_date < london_today then
    raise exception using errcode = '22023', message = 'Booking date cannot be in the past.';
  end if;
  if not is_admin and requested_date = london_today and requested_start < london_now_minutes + minimum_notice_minutes then
    raise exception using errcode = '23P01', message = 'Online appointments need at least 2 hours notice. Please choose a later time.';
  end if;
  if not is_admin and requested_date > london_today + 40 then
    raise exception using errcode = '22023', message = 'Online appointments can currently be arranged up to 40 days ahead. Please choose an earlier date.';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception using errcode = '22023', message = 'A valid client name is required.';
  end if;
  if normalized_email = '' or length(normalized_email) > 320 or (not is_admin and normalized_email = 'not-provided@example.local') then
    raise exception using errcode = '22023', message = 'A valid client email is required.';
  end if;
  if not is_admin and normalized_phone is null then
    raise exception using errcode = '22023', message = 'A valid client phone is required.';
  end if;
  if normalized_phone is not null and length(normalized_phone) > 40 then
    raise exception using errcode = '22023', message = 'Client phone is too long.';
  end if;
  if normalized_service = '' or length(normalized_service) > 240 then
    raise exception using errcode = '22023', message = 'A valid treatment is required.';
  end if;
  if jsonb_typeof(normalized_services) <> 'array'
     or jsonb_array_length(normalized_services) > 20
     or jsonb_typeof(normalized_durations) <> 'array'
     or jsonb_array_length(normalized_durations) > 20 then
    raise exception using errcode = '22023', message = 'Booking treatment selection is invalid.';
  end if;
  if length(coalesce(booking_payload ->> 'address', '')) > 500
     or length(coalesce(booking_payload ->> 'notes', '')) > 12000 then
    raise exception using errcode = '22023', message = 'Booking address or notes are too long.';
  end if;

  if is_admin then
    effective_user_id := requested_user_id;
  elsif auth.uid() is not null then
    effective_user_id := auth.uid();
    if requested_user_id is not null and requested_user_id <> auth.uid() then
      raise exception using errcode = '42501', message = 'Cannot create a booking for another client.';
    end if;
  else
    effective_user_id := null;
    if requested_user_id is not null or requested_saved_address_id is not null then
      raise exception using errcode = '42501', message = 'Guest bookings cannot reference private client records.';
    end if;
  end if;

  if requested_saved_address_id is not null
     and not exists (
       select 1
       from public.client_addresses as saved_address
       where saved_address.id = requested_saved_address_id
         and (
           is_admin
           or saved_address.user_id = effective_user_id
         )
     ) then
    raise exception using errcode = '42501', message = 'Saved address is not available to this client.';
  end if;

  if requested_order_id is not null
     and not exists (
       select 1
       from public.orders as booking_order
       where booking_order.id = requested_order_id
         and (
           is_admin
           or (
             effective_user_id is not null
             and booking_order.user_id = effective_user_id
           )
           or (
             effective_user_id is null
             and booking_order.user_id is null
             and lower(booking_order.client_email) = normalized_email
           )
         )
     ) then
    raise exception using errcode = '42501', message = 'Order is not available to this booking client.';
  end if;

  if normalized_reference is not null and exists (
    select 1
    from public.bookings as reference_booking
    where reference_booking.id <> requested_id
      and public.booking_reference_from_notes(reference_booking.notes) = normalized_reference
  ) then
    raise exception using errcode = '23505', message = 'Booking reference already exists.';
  end if;

  if not is_admin then
    if requested_hold_id is null or requested_hold_token is null or requested_hold_client_key is null then
      raise exception using errcode = '23P01', message = 'Time slot is no longer available.';
    end if;

    select *
    into matched_hold
    from public.booking_holds
    where id = requested_hold_id
    for update;

    if not found
       or matched_hold.hold_token <> requested_hold_token
       or matched_hold.client_key is distinct from requested_hold_client_key
       or matched_hold.date <> requested_date
       or matched_hold.start_minutes <> requested_start
       or matched_hold.duration_minutes <> requested_duration
       or matched_hold.expires_at <= now()
       or matched_hold.released_at is not null then
      raise exception using errcode = '23P01', message = 'Time slot is no longer available.';
    end if;
  end if;

  identity_lock_key := case
    when is_admin then 'admin:' || coalesce(effective_user_id::text, 'none')
    when effective_user_id is not null then 'auth:' || effective_user_id::text
    else 'guest:' || normalized_email || ':' || normalized_phone
  end;

  perform pg_advisory_xact_lock(hashtext('client-booking-limit:' || identity_lock_key));
  perform pg_advisory_xact_lock(hashtext('booking-date:' || requested_date::text));

  if not is_admin then
    returning_client := exists (
      select 1
      from public.bookings as history
      where history.status = 'completed'
        and history.payment_status = 'paid'
        and (
          (effective_user_id is not null and history.user_id = effective_user_id)
          or (
            effective_user_id is null
            and history.user_id is null
            and lower(history.client_email) = normalized_email
            and regexp_replace(coalesce(history.client_phone, ''), '\s+', '', 'g') = normalized_phone
          )
        )
    );

    select count(*)::integer
    into active_future_count
    from public.bookings as active
    where active.id <> requested_id
      and coalesce(active.service_id, '') <> 'personal-event'
      and lower(coalesce(active.status, 'confirmed')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'refunded',
        'completed',
        'no-show',
        'no_show'
      )
      and lower(coalesce(active.payment_status, '')) not in (
        'cancelled',
        'canceled',
        'expired',
        'rejected',
        'refunded'
      )
      and (
        active.date > london_today
        or (
          active.date = london_today
          and active.start_minutes > london_now_minutes
        )
      )
      and (
        (effective_user_id is not null and active.user_id = effective_user_id)
        or (
          effective_user_id is null
          and active.user_id is null
          and lower(active.client_email) = normalized_email
          and regexp_replace(coalesce(active.client_phone, ''), '\s+', '', 'g') = normalized_phone
        )
      );

    if not returning_client and active_future_count >= 1 then
      raise exception using
        errcode = '22023',
        message = 'Your first appointment is already reserved. Once it has been completed and paid, you''ll be able to arrange future appointments more freely.';
    end if;

    if returning_client and active_future_count >= 5 then
      raise exception using
        errcode = '22023',
        message = 'You already have five upcoming appointments. Please manage one of those appointments before adding another.';
    end if;
  end if;

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
      and int4range(
        existing_booking.start_minutes,
        coalesce(existing_booking.end_minutes, existing_booking.start_minutes + existing_booking.duration_minutes),
        '[)'
      ) && int4range(
        requested_start,
        requested_end,
        '[)'
      )
  ) then
    raise exception using errcode = '23P01', message = 'Time slot is no longer available.';
  end if;

  insert into public.bookings (
    id,
    order_id,
    user_id,
    saved_address_id,
    client_name,
    client_email,
    client_phone,
    service_id,
    service,
    service_name,
    date,
    start_minutes,
    end_minutes,
    duration_minutes,
    address,
    postcode,
    selected_area,
    price,
    travel_fee,
    congestion_fee,
    payment_id,
    payment_status,
    status,
    notes,
    selected_services,
    selected_durations
  )
  values (
    requested_id,
    requested_order_id,
    effective_user_id,
    requested_saved_address_id,
    normalized_name,
    normalized_email,
    normalized_phone,
    left(nullif(trim(booking_payload ->> 'service_id'), ''), 120),
    normalized_service,
    normalized_service,
    requested_date,
    requested_start,
    requested_end,
    requested_duration,
    left(nullif(trim(booking_payload ->> 'address'), ''), 500),
    left(nullif(upper(trim(booking_payload ->> 'postcode')), ''), 20),
    left(nullif(trim(booking_payload ->> 'selected_area'), ''), 120),
    normalized_price,
    normalized_travel_fee,
    normalized_congestion_fee,
    left(nullif(trim(booking_payload ->> 'payment_id'), ''), 200),
    normalized_payment_status,
    normalized_status,
    booking_payload ->> 'notes',
    normalized_services,
    normalized_durations
  )
  returning * into created_booking;

  if not is_admin and requested_hold_id is not null then
    update public.booking_holds
       set released_at = now(),
           expires_at = least(booking_holds.expires_at, now())
     where id = requested_hold_id;
  end if;

  return created_booking;
end;
$secure_booking$;

revoke all on function public.create_secure_booking(jsonb) from public;
grant execute on function public.create_secure_booking(jsonb) to anon, authenticated;
