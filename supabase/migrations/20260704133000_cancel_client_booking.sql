-- Narrow client-owned cancellation RPC.
-- This marks a booking as cancelled without deleting it or changing payment data.

create or replace function public.cancel_client_booking(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $cancel_client_booking$
declare
  current_user_id uuid := auth.uid();
  existing_booking public.bookings%rowtype;
  updated_booking public.bookings%rowtype;
  normalized_status text;
  normalized_payment_status text;
  existing_start_at timestamp;
  calculated_cancellation_window text;
  bookings_has_updated_at boolean;
begin
  if current_user_id is null then
    raise exception 'A signed-in client is required to cancel this booking.' using errcode = '42501';
  end if;

  if booking_id is null then
    raise exception 'Booking id is required.';
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

  calculated_cancellation_window := case
    when existing_start_at > ((now() at time zone 'Europe/London') + interval '24 hours') then 'free'
    when existing_booking.created_at > (now() - interval '1 hour') then 'grace'
    else 'late'
  end;

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
              cancelled_at = now(),
              cancelled_by = $2,
              cancellation_window = $3,
              updated_at = now()
        where id = $4
        returning *'
      using 'cancelled', 'client', calculated_cancellation_window, booking_id
      into updated_booking;
  else
    update public.bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = 'client',
           cancellation_window = calculated_cancellation_window
     where id = booking_id
     returning * into updated_booking;
  end if;

  return updated_booking;
end;
$cancel_client_booking$;

revoke all on function public.cancel_client_booking(uuid) from public;
grant execute on function public.cancel_client_booking(uuid) to authenticated;
