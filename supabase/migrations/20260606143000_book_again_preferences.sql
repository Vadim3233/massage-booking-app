-- Book Again preference metadata.
-- Additive only: no existing profile, guest booking, or booking history is changed.

alter table public.client_preferences
  add column if not exists last_booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists favorite_selection jsonb,
  add column if not exists recent_booking_combinations jsonb not null default '[]'::jsonb;

comment on column public.client_preferences.last_booking_id is
  'Most recently confirmed booking for the returning-client Book Again experience.';
comment on column public.client_preferences.favorite_selection is
  'Private snapshot of the client most-used treatment and duration combination.';
comment on column public.client_preferences.recent_booking_combinations is
  'Up to three private recent treatment combinations used as booking shortcuts.';

alter table public.client_preferences
  drop constraint if exists client_preferences_favorite_selection_is_object,
  add constraint client_preferences_favorite_selection_is_object
    check (favorite_selection is null or jsonb_typeof(favorite_selection) = 'object'),
  drop constraint if exists client_preferences_recent_combinations_are_array,
  add constraint client_preferences_recent_combinations_are_array
    check (jsonb_typeof(recent_booking_combinations) = 'array');

create index if not exists client_preferences_last_booking_id_idx
on public.client_preferences (last_booking_id)
where last_booking_id is not null;

-- Existing client_preferences RLS policies continue to protect these columns:
-- clients can only read and update their own row, while booking admins retain support access.
