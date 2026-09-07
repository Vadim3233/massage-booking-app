-- Narrow client-owned reschedule RPC.
-- This intentionally does not grant broad client UPDATE access to bookings.

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
