-- Create admin-only personal/unavailable calendar blocks without using the
-- public client booking availability RPC.

create or replace function public.create_admin_personal_event(booking_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $create_admin_personal_event$
declare
  requested_id uuid;
  requested_date date;
  requested_start integer;
  requested_duration integer;
  requested_end integer;
  personal_booking public.bookings%rowtype;
begin
  if booking_payload is null or jsonb_typeof(booking_payload) <> 'object' then
    raise exception 'Booking payload must be a JSON object.';
  end if;

  if not public.current_user_is_booking_admin() then
    raise exception 'Only booking admins may create personal events.' using errcode = '42501';
  end if;

  requested_id := nullif(booking_payload ->> 'id', '')::uuid;
  requested_date := nullif(booking_payload ->> 'date', '')::date;
  requested_start := nullif(booking_payload ->> 'start_minutes', '')::integer;
  requested_duration := nullif(booking_payload ->> 'duration_minutes', '')::integer;
  requested_end := coalesce(
    nullif(booking_payload ->> 'end_minutes', '')::integer,
    requested_start + requested_duration
  );

  if requested_id is null then
    raise exception 'Personal event id is required.';
  end if;
  if requested_date is null then
    raise exception 'Personal event date is required.';
  end if;
  if requested_start is null or requested_start < 0 or requested_start >= 1440 then
    raise exception 'Personal event start time is invalid.';
  end if;
  if requested_duration is null or requested_duration <= 0 or requested_duration > 1440 then
    raise exception 'Personal event duration must be between 1 and 1440 minutes.';
  end if;
  if requested_end <= requested_start or requested_end > 1440 then
    raise exception 'Personal event end time is invalid.';
  end if;

  insert into public.bookings (
    id,
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
    status,
    notes,
    selected_services,
    selected_durations
  )
  values (
    requested_id,
    trim(coalesce(nullif(booking_payload ->> 'client_name', ''), 'Personal event')),
    lower(trim(coalesce(nullif(booking_payload ->> 'client_email', ''), 'not-provided@example.local'))),
    nullif(trim(booking_payload ->> 'client_phone'), ''),
    nullif(trim(booking_payload ->> 'service_id'), ''),
    trim(coalesce(nullif(booking_payload ->> 'service_name', ''), nullif(booking_payload ->> 'service', ''), 'Personal event')),
    trim(coalesce(nullif(booking_payload ->> 'service_name', ''), nullif(booking_payload ->> 'service', ''), 'Personal event')),
    requested_date,
    requested_start,
    requested_end,
    requested_duration,
    nullif(trim(booking_payload ->> 'address'), ''),
    nullif(upper(trim(booking_payload ->> 'postcode')), ''),
    nullif(trim(booking_payload ->> 'selected_area'), ''),
    greatest(coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0), 0),
    greatest(coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0), 0),
    greatest(coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0), 0),
    coalesce(nullif(trim(booking_payload ->> 'status'), ''), 'confirmed'),
    nullif(booking_payload ->> 'notes', ''),
    coalesce(booking_payload -> 'selected_services', '[]'::jsonb),
    coalesce(booking_payload -> 'selected_durations', '[]'::jsonb)
  )
  returning * into personal_booking;

  return personal_booking;
end;
$create_admin_personal_event$;

revoke all on function public.create_admin_personal_event(jsonb) from public;
grant execute on function public.create_admin_personal_event(jsonb) to authenticated;
