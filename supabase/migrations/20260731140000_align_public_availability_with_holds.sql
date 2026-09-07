-- Keep the public availability preview in sync with the booking-hold RPC.
-- Pending/payment-review bookings still reserve time, so clients should not see
-- those slots as available only to have the hold rejected on click.

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
