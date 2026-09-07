-- Cancellation history metadata for future client/admin cancellation flows.
-- These columns are nullable so existing bookings remain valid.

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

alter table public.bookings
  add column if not exists cancelled_by text;

alter table public.bookings
  add column if not exists cancellation_window text;

alter table public.bookings
  drop constraint if exists bookings_cancelled_by_check;

alter table public.bookings
  add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('client', 'admin'));

alter table public.bookings
  drop constraint if exists bookings_cancellation_window_check;

alter table public.bookings
  add constraint bookings_cancellation_window_check
  check (cancellation_window is null or cancellation_window in ('free', 'grace', 'late'));
