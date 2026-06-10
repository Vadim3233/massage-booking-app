-- Add strict duration constraint to bookings table.
-- This ensures only valid durations (60, 90, 120, 150, 180, 210, 240 minutes) are allowed.

alter table public.bookings
  add constraint bookings_duration_minutes_check
  check (duration_minutes = any(ARRAY[60, 90, 120, 150, 180, 210, 240]));

-- Also add constraint to booking_holds table for consistency
alter table public.booking_holds
  add constraint booking_holds_duration_minutes_check
  check (duration_minutes = any(ARRAY[60, 90, 120, 150, 180, 210, 240]));