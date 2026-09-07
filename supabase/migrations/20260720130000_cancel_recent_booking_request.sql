-- Public immediate-cancellation RPC for the confirmation page.
-- This only works shortly after booking and requires the booking reference.

create or replace function public.cancel_recent_booking_request(
  booking_id uuid,
  booking_reference text
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $cancel_recent_booking_request$
declare
  existing_booking public.bookings%rowtype;
  updated_booking public.bookings%rowtype;
  normalized_reference text := upper(nullif(trim(booking_reference), ''));
  normalized_status text;
  normalized_payment_status text;
  existing_start_at timestamp;
  bookings_has_updated_at boolean;
begin
  if booking_id is null then
    raise exception 'Booking id is required.';
  end if;

  if normalized_reference is null then
    raise exception 'Booking reference is required.';
  end if;

  select *
    into existing_booking
  from public.bookings
  where id = booking_id
  for update;

  if not found then
    raise exception 'Booking was not found.' using errcode = 'P0002';
  end if;

  if normalized_reference not in (
    upper(coalesce(existing_booking.booking_reference, '')),
    upper(coalesce(existing_booking.payment_reference, ''))
  ) then
    raise exception 'Booking reference does not match this booking.' using errcode = '42501';
  end if;

  if existing_booking.created_at <= now() - interval '1 hour' then
    raise exception 'This booking can no longer be cancelled automatically.';
  end if;

  normalized_status := lower(coalesce(existing_booking.status, ''));
  normalized_payment_status := lower(coalesce(existing_booking.payment_status, ''));

  if normalized_status in ('cancelled', 'canceled', 'expired', 'completed', 'refunded', 'no-show', 'no_show')
    or normalized_payment_status in ('cancelled', 'canceled', 'expired', 'refunded')
  then
    raise exception 'This booking can no longer be cancelled online.';
  end if;

  if normalized_status not in ('confirmed', 'pending_payment_verification', 'payment_method_review') then
    raise exception 'This booking can no longer be cancelled online.';
  end if;

  existing_start_at := existing_booking.date::timestamp
    + make_interval(mins => coalesce(existing_booking.start_minutes, 0));

  if existing_start_at <= (now() at time zone 'Europe/London') then
    raise exception 'Past bookings can no longer be cancelled online.';
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
          set status = $1,
              payment_status = $2,
              cancelled_at = now(),
              cancelled_by = $3,
              cancellation_window = $4,
              updated_at = now()
        where id = $5
        returning *'
      using 'cancelled', 'cancelled', 'client', 'grace', booking_id
      into updated_booking;
  else
    update public.bookings
       set status = 'cancelled',
           payment_status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = 'client',
           cancellation_window = 'grace'
     where id = booking_id
     returning * into updated_booking;
  end if;

  return updated_booking;
end;
$cancel_recent_booking_request$;

revoke all on function public.cancel_recent_booking_request(uuid, text) from public;
grant execute on function public.cancel_recent_booking_request(uuid, text) to anon, authenticated;
