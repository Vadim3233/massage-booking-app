-- Production reconciliation for the linked live schema.
--
-- This migration is intentionally additive/idempotent where practical. It is
-- designed for the observed live database where many schema objects already
-- exist but migration history is blank. It must be reviewed and dry-run before
-- applying to any live project.
--
-- Safety goals:
-- - preserve all existing rows;
-- - never drop or truncate production tables;
-- - add missing columns with safe defaults/backfills;
-- - replace outdated SECURITY DEFINER RPC bodies in place;
-- - create the missing admin-managed session_preferences table.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  hold_token uuid not null default gen_random_uuid(),
  date date not null,
  start_minutes integer not null,
  duration_minutes integer not null,
  buffer_minutes integer not null default 60,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.bookings
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.bookings
  add column if not exists saved_address_id uuid references public.client_addresses(id) on delete set null;

alter table public.bookings
  add column if not exists selected_services jsonb not null default '[]'::jsonb;

alter table public.bookings
  add column if not exists selected_durations jsonb not null default '[]'::jsonb;

alter table public.bookings
  add column if not exists payment_status text;

update public.bookings
set payment_status = case
  when lower(coalesce(status, '')) = 'pending_payment_verification' then 'awaiting_verification'
  when lower(coalesce(status, '')) = 'payment_method_review' then 'pending'
  when lower(coalesce(status, '')) in ('cancelled', 'canceled') then 'cancelled'
  when lower(coalesce(status, '')) = 'expired' then 'expired'
  when lower(coalesce(status, '')) = 'rejected' then 'rejected'
  when lower(coalesce(status, '')) = 'refunded' then 'refunded'
  else 'pending'
end
where payment_status is null;

alter table public.bookings
  alter column payment_status set default 'pending';

alter table public.bookings
  alter column payment_status set not null;

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

alter table public.bookings
  add column if not exists cancelled_by text;

alter table public.bookings
  add column if not exists cancellation_window text;

alter table public.bookings
  add column if not exists updated_at timestamptz not null default now();

alter table public.client_addresses
  add column if not exists area text;

alter table public.client_addresses
  add column if not exists instructions text;

alter table public.client_preferences
  add column if not exists preferred_service_ids jsonb not null default '[]'::jsonb;

alter table public.client_preferences
  add column if not exists preferred_durations jsonb not null default '{}'::jsonb;

alter table public.client_preferences
  add column if not exists preferred_address_id uuid references public.client_addresses(id) on delete set null;

alter table public.client_preferences
  add column if not exists usual_area text;

alter table public.client_preferences
  add column if not exists usual_notes text;

alter table public.client_preferences
  add column if not exists favorite_selection jsonb;

alter table public.client_preferences
  add column if not exists recent_booking_combinations jsonb not null default '[]'::jsonb;

alter table public.client_preferences
  add column if not exists favorite_combination jsonb;

alter table public.client_preferences
  add column if not exists recent_combinations jsonb not null default '[]'::jsonb;

update public.client_preferences
set
  favorite_selection = coalesce(favorite_selection, favorite_combination),
  favorite_combination = coalesce(favorite_combination, favorite_selection),
  recent_booking_combinations = case
    when jsonb_typeof(recent_booking_combinations) = 'array'
      and jsonb_array_length(recent_booking_combinations) > 0
      then recent_booking_combinations
    when jsonb_typeof(recent_combinations) = 'array'
      then recent_combinations
    else '[]'::jsonb
  end,
  recent_combinations = case
    when jsonb_typeof(recent_combinations) = 'array'
      and jsonb_array_length(recent_combinations) > 0
      then recent_combinations
    when jsonb_typeof(recent_booking_combinations) = 'array'
      then recent_booking_combinations
    else '[]'::jsonb
  end;

alter table public.booking_holds
  add column if not exists client_key text;

alter table public.booking_holds
  add column if not exists released_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid = 'public.bookings'::regclass
      and conname = 'bookings_payment_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_payment_status_check
      check (
        payment_status in (
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
        )
      ) not valid;
  end if;
end;
$$;

alter table public.bookings
  drop constraint if exists bookings_cancelled_by_check;

alter table public.bookings
  add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('client', 'admin')) not valid;

alter table public.bookings
  drop constraint if exists bookings_cancellation_window_check;

alter table public.bookings
  add constraint bookings_cancellation_window_check
  check (cancellation_window is null or cancellation_window in ('free', 'grace', 'late')) not valid;

alter table public.bookings
  drop constraint if exists bookings_duration_minutes_check;

alter table public.bookings
  add constraint bookings_duration_minutes_check
  check (duration_minutes = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) not valid;

alter table public.booking_holds
  drop constraint if exists booking_holds_duration_minutes_check;

alter table public.booking_holds
  add constraint booking_holds_duration_minutes_check
  check (duration_minutes = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_service_ids_are_json_array;

alter table public.client_preferences
  add constraint client_preferences_service_ids_are_json_array
  check (jsonb_typeof(preferred_service_ids) = 'array') not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_durations_are_json_object;

alter table public.client_preferences
  add constraint client_preferences_durations_are_json_object
  check (jsonb_typeof(preferred_durations) = 'object') not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_favorite_selection_is_object;

alter table public.client_preferences
  add constraint client_preferences_favorite_selection_is_object
  check (favorite_selection is null or jsonb_typeof(favorite_selection) = 'object') not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_favorite_combination_is_object;

alter table public.client_preferences
  add constraint client_preferences_favorite_combination_is_object
  check (favorite_combination is null or jsonb_typeof(favorite_combination) = 'object') not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_recent_booking_combinations_are_array;

alter table public.client_preferences
  add constraint client_preferences_recent_booking_combinations_are_array
  check (jsonb_typeof(recent_booking_combinations) = 'array') not valid;

alter table public.client_preferences
  drop constraint if exists client_preferences_recent_combinations_are_json_array;

alter table public.client_preferences
  add constraint client_preferences_recent_combinations_are_json_array
  check (jsonb_typeof(recent_combinations) = 'array') not valid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid = 'public.client_preferences'::regclass
      and conname = 'client_preferences_last_booking_id_fkey'
  ) then
    alter table public.client_preferences
      add constraint client_preferences_last_booking_id_fkey
      foreign key (last_booking_id) references public.bookings(id) on delete set null not valid;
  end if;
end;
$$;

create index if not exists bookings_user_id_created_at_idx
on public.bookings (user_id, created_at desc)
where user_id is not null;

create index if not exists bookings_guest_email_created_at_idx
on public.bookings (lower(client_email), created_at desc);

create index if not exists bookings_guest_phone_created_at_idx
on public.bookings (client_phone, created_at desc)
where client_phone is not null;

create index if not exists bookings_saved_address_id_idx
on public.bookings (saved_address_id)
where saved_address_id is not null;

create index if not exists bookings_order_id_idx
on public.bookings (order_id)
where order_id is not null;

create index if not exists bookings_date_start_idx
on public.bookings (date, start_minutes);

create index if not exists bookings_payment_status_idx
on public.bookings (payment_status);

create index if not exists orders_user_id_created_at_idx
on public.orders (user_id, created_at desc)
where user_id is not null;

create index if not exists client_profiles_email_idx
on public.client_profiles (lower(email));

create index if not exists client_profiles_phone_idx
on public.client_profiles (phone);

create index if not exists client_addresses_user_id_idx
on public.client_addresses (user_id);

create unique index if not exists client_addresses_one_default_per_user_idx
on public.client_addresses (user_id)
where is_default;

create index if not exists client_preferences_last_booking_id_idx
on public.client_preferences (last_booking_id)
where last_booking_id is not null;

create index if not exists booking_holds_date_expires_idx
on public.booking_holds (date, expires_at);

create index if not exists booking_holds_client_key_active_idx
on public.booking_holds (client_key, expires_at)
where released_at is null;

create index if not exists booking_holds_active_slot_idx
on public.booking_holds (date, start_minutes, expires_at)
where released_at is null;

create or replace function public.current_user_is_booking_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $admin_check$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$admin_check$;

revoke all on function public.current_user_is_booking_admin() from public;
grant execute on function public.current_user_is_booking_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $set_updated_at$
begin
  new.updated_at = now();
  return new;
end;
$set_updated_at$;

create or replace function public.sync_client_preference_aliases()
returns trigger
language plpgsql
set search_path = public
as $sync_client_preference_aliases$
declare
  legacy_recent jsonb;
  current_recent jsonb;
begin
  new.favorite_selection = coalesce(new.favorite_selection, new.favorite_combination);
  new.favorite_combination = coalesce(new.favorite_combination, new.favorite_selection);

  legacy_recent := case
    when jsonb_typeof(new.recent_booking_combinations) = 'array' then new.recent_booking_combinations
    else '[]'::jsonb
  end;
  current_recent := case
    when jsonb_typeof(new.recent_combinations) = 'array' then new.recent_combinations
    else '[]'::jsonb
  end;

  if jsonb_array_length(legacy_recent) = 0 and jsonb_array_length(current_recent) > 0 then
    new.recent_booking_combinations = current_recent;
  elsif jsonb_array_length(current_recent) = 0 and jsonb_array_length(legacy_recent) > 0 then
    new.recent_combinations = legacy_recent;
  else
    new.recent_booking_combinations = legacy_recent;
    new.recent_combinations = current_recent;
  end if;

  return new;
end;
$sync_client_preference_aliases$;

create or replace function public.validate_client_preferred_address()
returns trigger
language plpgsql
set search_path = public
as $validate_client_preferred_address$
begin
  if new.preferred_address_id is not null and not exists (
    select 1
    from public.client_addresses as address
    where address.id = new.preferred_address_id
      and address.user_id = new.user_id
  ) then
    raise exception 'Preferred address must belong to the same client.';
  end if;

  return new;
end;
$validate_client_preferred_address$;

drop trigger if exists set_client_profiles_updated_at on public.client_profiles;
create trigger set_client_profiles_updated_at
before update on public.client_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_client_addresses_updated_at on public.client_addresses;
create trigger set_client_addresses_updated_at
before update on public.client_addresses
for each row execute function public.set_updated_at();

drop trigger if exists sync_client_preference_aliases on public.client_preferences;
create trigger sync_client_preference_aliases
before insert or update of favorite_selection, favorite_combination, recent_booking_combinations, recent_combinations
on public.client_preferences
for each row execute function public.sync_client_preference_aliases();

drop trigger if exists set_client_preferences_updated_at on public.client_preferences;
create trigger set_client_preferences_updated_at
before update on public.client_preferences
for each row execute function public.set_updated_at();

drop trigger if exists validate_client_preferred_address on public.client_preferences;
create trigger validate_client_preferred_address
before insert or update of user_id, preferred_address_id on public.client_preferences
for each row execute function public.validate_client_preferred_address();

alter table public.client_profiles enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_preferences enable row level security;
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.booking_holds enable row level security;
alter table public.admin_users enable row level security;

revoke all on table public.client_profiles from anon, authenticated;
revoke all on table public.client_addresses from anon, authenticated;
revoke all on table public.client_preferences from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.booking_holds from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;

grant select, insert, update on table public.client_profiles to authenticated;
grant select, insert, update, delete on table public.client_addresses to authenticated;
grant select, insert, update on table public.client_preferences to authenticated;
grant select, update, delete on table public.bookings to authenticated;
grant select, update on table public.orders to authenticated;
grant select on table public.booking_holds to authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists "Allow public booking inserts" on public.bookings;
drop policy if exists "Allow public booking reads" on public.bookings;
drop policy if exists "Allow public booking updates" on public.bookings;
drop policy if exists "Allow public booking deletes" on public.bookings;
drop policy if exists "Public can create bookings" on public.bookings;
drop policy if exists "Authenticated users can create bookings" on public.bookings;
drop policy if exists "Authenticated users can read bookings" on public.bookings;
drop policy if exists "Authenticated users can update bookings" on public.bookings;
drop policy if exists "Authenticated users can delete bookings" on public.bookings;
drop policy if exists "Booking admins can create bookings" on public.bookings;
drop policy if exists "Booking admins can read bookings" on public.bookings;
drop policy if exists "Booking admins can update bookings" on public.bookings;
drop policy if exists "Booking admins can delete bookings" on public.bookings;
drop policy if exists "Clients can read own bookings" on public.bookings;
drop policy if exists "Clients and admins can read permitted bookings" on public.bookings;
drop policy if exists "Booking admins can update permitted bookings" on public.bookings;
drop policy if exists "Booking admins can delete permitted bookings" on public.bookings;

drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Authenticated users can create orders" on public.orders;
drop policy if exists "Clients can read own orders" on public.orders;
drop policy if exists "Booking admins can read orders" on public.orders;
drop policy if exists "Booking admins can update orders" on public.orders;
drop policy if exists "Clients and admins can read permitted orders" on public.orders;
drop policy if exists "Booking admins can update permitted orders" on public.orders;

drop policy if exists "Clients can read own profile" on public.client_profiles;
drop policy if exists "Clients can create own profile" on public.client_profiles;
drop policy if exists "Clients can update own profile" on public.client_profiles;
drop policy if exists "Clients can delete own profile" on public.client_profiles;
drop policy if exists "Clients and admins can read own profile" on public.client_profiles;
drop policy if exists "Clients and admins can create own profile" on public.client_profiles;
drop policy if exists "Clients and admins can update own profile" on public.client_profiles;
drop policy if exists "Clients and admins can delete own profile" on public.client_profiles;

drop policy if exists "Clients can read own addresses" on public.client_addresses;
drop policy if exists "Clients can create own addresses" on public.client_addresses;
drop policy if exists "Clients can update own addresses" on public.client_addresses;
drop policy if exists "Clients can delete own addresses" on public.client_addresses;
drop policy if exists "Clients and admins can read own addresses" on public.client_addresses;
drop policy if exists "Clients and admins can create own addresses" on public.client_addresses;
drop policy if exists "Clients and admins can update own addresses" on public.client_addresses;
drop policy if exists "Clients and admins can delete own addresses" on public.client_addresses;

drop policy if exists "Clients can read own preferences" on public.client_preferences;
drop policy if exists "Clients can create own preferences" on public.client_preferences;
drop policy if exists "Clients can update own preferences" on public.client_preferences;
drop policy if exists "Clients can delete own preferences" on public.client_preferences;
drop policy if exists "Clients and admins can read own preferences" on public.client_preferences;
drop policy if exists "Clients and admins can create own preferences" on public.client_preferences;
drop policy if exists "Clients and admins can update own preferences" on public.client_preferences;
drop policy if exists "Clients and admins can delete own preferences" on public.client_preferences;

drop policy if exists "Booking admins can read booking holds" on public.booking_holds;
drop policy if exists "Booking admins can read admin users" on public.admin_users;

create policy "Clients and admins can read own profile"
on public.client_profiles for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can create own profile"
on public.client_profiles for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can update own profile"
on public.client_profiles for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can read own addresses"
on public.client_addresses for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can create own addresses"
on public.client_addresses for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can update own addresses"
on public.client_addresses for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can delete own addresses"
on public.client_addresses for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can read own preferences"
on public.client_preferences for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can create own preferences"
on public.client_preferences for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can update own preferences"
on public.client_preferences for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Clients and admins can read permitted bookings"
on public.bookings for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Booking admins can update permitted bookings"
on public.bookings for update to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete permitted bookings"
on public.bookings for delete to authenticated
using (public.current_user_is_booking_admin());

create policy "Clients and admins can read permitted orders"
on public.orders for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

create policy "Booking admins can update permitted orders"
on public.orders for update to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can read booking holds"
on public.booking_holds for select to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can read admin users"
on public.admin_users for select to authenticated
using (public.current_user_is_booking_admin());

create or replace function public.booking_reference_from_notes(booking_notes text)
returns text
language plpgsql
immutable
set search_path = public
as $booking_reference_from_notes$
declare
  parsed_notes jsonb;
begin
  if booking_notes is null or trim(booking_notes) = '' then
    return null;
  end if;

  begin
    parsed_notes := booking_notes::jsonb;
  exception when others then
    return null;
  end;

  return nullif(trim(parsed_notes #>> '{appBooking,bookingReference}'), '');
end;
$booking_reference_from_notes$;

revoke all on function public.booking_reference_from_notes(text) from public;

create or replace function public.cleanup_expired_booking_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $cleanup_booking_holds$
declare
  cleaned_count integer := 0;
begin
  delete from public.booking_holds
  where expires_at < now()
     or released_at is not null;

  get diagnostics cleaned_count = row_count;
  return cleaned_count;
end;
$cleanup_booking_holds$;

create or replace function public.create_booking_hold(
  hold_date date,
  hold_start_minutes integer,
  hold_duration_minutes integer,
  hold_buffer_minutes integer default 60,
  hold_client_key text default null
)
returns table (
  hold_id uuid,
  hold_token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $create_booking_hold$
declare
  minimum_notice_minutes constant integer := 120;
  london_today date := (now() at time zone 'Europe/London')::date;
  london_now_minutes integer := (
    extract(hour from now() at time zone 'Europe/London')::integer * 60
    + extract(minute from now() at time zone 'Europe/London')::integer
  );
  normalized_client_key text := trim(coalesce(hold_client_key, ''));
  requested_end integer;
  requested_buffer_end integer;
  refreshed_hold_id uuid;
  refreshed_hold_token uuid;
  refreshed_expires_at timestamptz;
begin
  if normalized_client_key = ''
     or length(normalized_client_key) < 20
     or length(normalized_client_key) > 120
     or normalized_client_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using
      errcode = '22023',
      message = 'A valid booking hold client key is required.';
  end if;

  if hold_date is null then
    raise exception using
      errcode = '22023',
      message = 'A valid booking hold date is required.';
  end if;

  if hold_date < london_today then
    raise exception using
      errcode = '22023',
      message = 'Booking hold date cannot be in the past.';
  end if;

  if hold_date = london_today and hold_start_minutes < london_now_minutes + minimum_notice_minutes then
    raise exception using
      errcode = '23P01',
      message = 'Online appointments need at least 2 hours notice. Please choose a later time.';
  end if;

  if hold_start_minutes is null
     or hold_start_minutes < 0
     or hold_start_minutes >= 1440
     or hold_duration_minutes is null
     or hold_duration_minutes <= 0
     or not (hold_duration_minutes = any(ARRAY[60, 90, 120, 150, 180, 210, 240])) then
    raise exception using
      errcode = '22023',
      message = 'Booking hold duration is invalid.';
  end if;

  if hold_buffer_minutes is null
     or hold_buffer_minutes < 0
     or hold_buffer_minutes > 240 then
    raise exception using
      errcode = '22023',
      message = 'Booking hold buffer is invalid.';
  end if;

  requested_end := hold_start_minutes + hold_duration_minutes;
  requested_buffer_end := requested_end + hold_buffer_minutes;

  if requested_end > 1440 or requested_buffer_end > 1680 then
    raise exception using
      errcode = '22023',
      message = 'Booking hold time range is invalid.';
  end if;

  perform pg_advisory_xact_lock(hashtext(hold_date::text));

  if exists (
    select 1
    from public.bookings as existing
    where existing.date = hold_date
      and coalesce(existing.status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded', 'completed', 'no-show', 'no_show')
      and coalesce(existing.payment_status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded')
      and int4range(
        existing.start_minutes,
        existing.start_minutes + existing.duration_minutes,
        '[)'
      ) && int4range(
        hold_start_minutes,
        requested_buffer_end,
        '[)'
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Time slot is no longer available.';
  end if;

  if exists (
    select 1
    from public.booking_holds as existing_hold
    where existing_hold.date = hold_date
      and existing_hold.expires_at > now()
      and existing_hold.released_at is null
      and existing_hold.client_key is distinct from normalized_client_key
      and int4range(
        existing_hold.start_minutes,
        existing_hold.start_minutes + existing_hold.duration_minutes + existing_hold.buffer_minutes,
        '[)'
      ) && int4range(
        hold_start_minutes,
        requested_buffer_end,
        '[)'
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Time slot is no longer available.';
  end if;

  update public.booking_holds
     set hold_token = gen_random_uuid(),
         expires_at = now() + interval '10 minutes',
         released_at = null
   where id = (
     select existing_hold.id
     from public.booking_holds as existing_hold
     where existing_hold.client_key = normalized_client_key
       and existing_hold.date = hold_date
       and existing_hold.start_minutes = hold_start_minutes
       and existing_hold.duration_minutes = hold_duration_minutes
       and existing_hold.buffer_minutes = hold_buffer_minutes
       and existing_hold.expires_at > now()
       and existing_hold.released_at is null
     order by existing_hold.created_at desc
     limit 1
   )
   returning booking_holds.id, booking_holds.hold_token, booking_holds.expires_at
   into refreshed_hold_id, refreshed_hold_token, refreshed_expires_at;

  if refreshed_hold_id is not null then
    hold_id := refreshed_hold_id;
    hold_token := refreshed_hold_token;
    expires_at := refreshed_expires_at;
    return next;
    return;
  end if;

  update public.booking_holds
     set released_at = now(),
         expires_at = least(booking_holds.expires_at, now())
   where booking_holds.client_key = normalized_client_key
     and booking_holds.expires_at > now()
     and booking_holds.released_at is null;

  insert into public.booking_holds (
    client_key,
    date,
    start_minutes,
    duration_minutes,
    buffer_minutes,
    expires_at
  )
  values (
    normalized_client_key,
    hold_date,
    hold_start_minutes,
    hold_duration_minutes,
    hold_buffer_minutes,
    now() + interval '10 minutes'
  )
  returning booking_holds.id, booking_holds.hold_token, booking_holds.expires_at
  into hold_id, hold_token, expires_at;

  return next;
end;
$create_booking_hold$;

create or replace function public.release_booking_hold(
  release_hold_id uuid,
  release_hold_token uuid,
  release_client_key text default null
)
returns table (
  hold_id uuid,
  released boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $release_booking_hold$
declare
  normalized_client_key text := trim(coalesce(release_client_key, ''));
  existing_hold public.booking_holds%rowtype;
begin
  if release_hold_id is null or release_hold_token is null then
    raise exception using
      errcode = '22023',
      message = 'Booking hold ID and token are required.';
  end if;

  if normalized_client_key = ''
     or length(normalized_client_key) < 20
     or length(normalized_client_key) > 120
     or normalized_client_key !~ '^[A-Za-z0-9:_-]+$' then
    raise exception using
      errcode = '22023',
      message = 'A valid booking hold client key is required.';
  end if;

  select *
  into existing_hold
  from public.booking_holds
  where id = release_hold_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Booking hold was not found.';
  end if;

  if existing_hold.hold_token <> release_hold_token
     or existing_hold.client_key is distinct from normalized_client_key then
    raise exception using
      errcode = '42501',
      message = 'Booking hold token is invalid.';
  end if;

  if existing_hold.released_at is not null or existing_hold.expires_at <= now() then
    hold_id := existing_hold.id;
    released := false;
    return next;
    return;
  end if;

  update public.booking_holds
     set released_at = now(),
         expires_at = least(booking_holds.expires_at, now())
   where booking_holds.id = release_hold_id;

  hold_id := existing_hold.id;
  released := true;
  return next;
end;
$release_booking_hold$;

revoke all on function public.cleanup_expired_booking_holds() from public;
revoke all on function public.create_booking_hold(date, integer, integer, integer, text) from public;
revoke all on function public.release_booking_hold(uuid, uuid, text) from public;

grant execute on function public.cleanup_expired_booking_holds() to anon, authenticated;
grant execute on function public.create_booking_hold(date, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid, text) to anon, authenticated;

create table if not exists public.session_preferences (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) > 0),
  category text,
  is_visible boolean not null default true,
  sort_order integer not null check (sort_order > 0),
  conflict_ids uuid[] not null default '{}'::uuid[],
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists session_preferences_sort_order_active_idx
on public.session_preferences (sort_order)
where deleted_at is null;

create index if not exists session_preferences_visible_sort_idx
on public.session_preferences (sort_order, id)
where is_visible = true and deleted_at is null;

create or replace function public.set_session_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_session_preferences_updated_at on public.session_preferences;
create trigger set_session_preferences_updated_at
before update on public.session_preferences
for each row
execute function public.set_session_preferences_updated_at();

alter table public.session_preferences enable row level security;

revoke all on table public.session_preferences from anon;
revoke all on table public.session_preferences from authenticated;
grant select on table public.session_preferences to anon, authenticated;
grant insert, update, delete on table public.session_preferences to authenticated;

drop policy if exists "Clients can read visible session preferences" on public.session_preferences;
drop policy if exists "Booking admins can read all session preferences" on public.session_preferences;
drop policy if exists "Booking admins can create session preferences" on public.session_preferences;
drop policy if exists "Booking admins can update session preferences" on public.session_preferences;
drop policy if exists "Booking admins can delete session preferences" on public.session_preferences;

create policy "Clients can read visible session preferences"
on public.session_preferences
for select
to anon, authenticated
using (is_visible = true and deleted_at is null);

create policy "Booking admins can read all session preferences"
on public.session_preferences
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can create session preferences"
on public.session_preferences
for insert
to authenticated
with check (public.current_user_is_booking_admin());

create policy "Booking admins can update session preferences"
on public.session_preferences
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete session preferences"
on public.session_preferences
for delete
to authenticated
using (public.current_user_is_booking_admin());

insert into public.session_preferences (id, label, category, is_visible, sort_order, conflict_ids)
values
  ('11111111-1111-4111-8111-111111111111', 'Neck focus', 'Focus area', true, 1, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111112', 'Shoulder focus', 'Focus area', true, 2, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111113', 'Lower-back focus', 'Focus area', true, 3, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111114', 'Calf focus', 'Focus area', true, 4, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111115', 'Foot focus', 'Focus area', true, 5, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111116', 'Stronger shoulders', 'Pressure', true, 6, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111117', 'Stronger back', 'Pressure', true, 7, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111118', 'Lighter calves', 'Pressure', true, 8, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111119', 'Lighter pressure', 'Pressure', true, 9, array['11111111-1111-4111-8111-111111111120']::uuid[]),
  ('11111111-1111-4111-8111-111111111120', 'Firm pressure', 'Pressure', true, 10, array['11111111-1111-4111-8111-111111111119']::uuid[]),
  ('11111111-1111-4111-8111-111111111121', 'Head massage', 'Include', true, 11, array['11111111-1111-4111-8111-111111111128']::uuid[]),
  ('11111111-1111-4111-8111-111111111122', 'Foot massage', 'Include', true, 12, array['11111111-1111-4111-8111-111111111127']::uuid[]),
  ('11111111-1111-4111-8111-111111111123', 'Hand massage', 'Include', true, 13, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111124', 'Jaw massage', 'Include', true, 14, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111125', 'Face and ears', 'Include', true, 15, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111126', 'Abdomen massage', 'Include', true, 16, array['11111111-1111-4111-8111-111111111129']::uuid[]),
  ('11111111-1111-4111-8111-111111111127', 'Avoid feet', 'Avoid', true, 17, array['11111111-1111-4111-8111-111111111122']::uuid[]),
  ('11111111-1111-4111-8111-111111111128', 'Avoid head', 'Avoid', true, 18, array['11111111-1111-4111-8111-111111111121']::uuid[]),
  ('11111111-1111-4111-8111-111111111129', 'Avoid abdomen', 'Avoid', true, 19, array['11111111-1111-4111-8111-111111111126']::uuid[]),
  ('11111111-1111-4111-8111-111111111130', 'Avoid sensitive areas', 'Avoid', true, 20, '{}'::uuid[])
on conflict (id) do nothing;

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

create or replace function public.link_recent_guest_booking_to_client(link_payload jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $link_recent_guest_booking_to_client$
declare
  requested_user_id uuid := auth.uid();
  requested_saved_address_id uuid;
  booking_items jsonb;
  booking_item jsonb;
  requested_booking_id uuid;
  linked_booking_id uuid;
  requested_booking_reference text;
  linked_ids uuid[] := array[]::uuid[];
begin
  if requested_user_id is null then
    raise exception 'A signed-in client is required.';
  end if;

  if link_payload is null or jsonb_typeof(link_payload) <> 'object' then
    raise exception 'A booking link payload is required.';
  end if;

  booking_items := coalesce(link_payload -> 'bookings', '[]'::jsonb);
  if jsonb_typeof(booking_items) <> 'array' or jsonb_array_length(booking_items) = 0 then
    raise exception 'At least one recent booking is required.';
  end if;

  if jsonb_array_length(booking_items) > 5 then
    raise exception 'Too many bookings were supplied.';
  end if;

  requested_saved_address_id := nullif(link_payload ->> 'saved_address_id', '')::uuid;
  if requested_saved_address_id is not null and not exists (
    select 1
    from public.client_addresses as saved_address
    where saved_address.id = requested_saved_address_id
      and saved_address.user_id = requested_user_id
  ) then
    raise exception 'Saved address is not available for this client.';
  end if;

  for booking_item in select * from jsonb_array_elements(booking_items)
  loop
    requested_booking_id := nullif(booking_item ->> 'id', '')::uuid;
    requested_booking_reference := nullif(trim(coalesce(
      booking_item ->> 'booking_reference',
      booking_item ->> 'bookingReference'
    )), '');

    if requested_booking_id is null or requested_booking_reference is null then
      raise exception 'Booking id and reference are required.';
    end if;

    linked_booking_id := null;

    update public.bookings
    set
      user_id = requested_user_id,
      saved_address_id = coalesce(requested_saved_address_id, saved_address_id)
    where id = requested_booking_id
      and user_id is null
      and public.booking_reference_from_notes(notes) = requested_booking_reference
    returning id into linked_booking_id;

    if linked_booking_id is null then
      raise exception 'Booking is not available to link.';
    end if;

    linked_ids := array_append(linked_ids, linked_booking_id);
  end loop;

  return linked_ids;
end;
$link_recent_guest_booking_to_client$;

revoke all on function public.link_recent_guest_booking_to_client(jsonb) from public;
grant execute on function public.link_recent_guest_booking_to_client(jsonb) to authenticated;

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
    updated_at = now(),
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
