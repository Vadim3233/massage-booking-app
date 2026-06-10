-- Private-data security hardening for the Vad Massage booking application.
--
-- This migration is intentionally self-contained and idempotent where
-- PostgreSQL supports IF EXISTS / IF NOT EXISTS. It keeps guest booking
-- available through validated SECURITY DEFINER functions while preventing
-- anonymous users from listing private client or booking data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  client_name text,
  client_email text,
  payment_provider text,
  payment_id text,
  payment_status text not null default 'pending',
  total_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  client_name text not null,
  client_email text not null,
  client_phone text,
  service_id text,
  service text not null,
  service_name text,
  date date not null,
  start_minutes integer not null,
  end_minutes integer,
  duration_minutes integer not null,
  address text,
  postcode text,
  selected_area text,
  price numeric(10,2) not null default 0,
  travel_fee numeric(10,2) not null default 0,
  congestion_fee numeric(10,2) not null default 0,
  payment_id text,
  status text not null default 'confirmed',
  notes text,
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

-- ---------------------------------------------------------------------------
-- Private returning-client tables
-- ---------------------------------------------------------------------------

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_profiles is
  'Private returning-client profile data. One row per Supabase Auth user.';

create table if not exists public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  address_line_1 text not null,
  address_line_2 text,
  city text not null default 'London',
  postcode text,
  area text,
  instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_addresses is
  'Private reusable treatment addresses owned by authenticated clients.';

create table if not exists public.client_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_service_ids jsonb not null default '[]'::jsonb,
  preferred_durations jsonb not null default '{}'::jsonb,
  preferred_address_id uuid references public.client_addresses(id) on delete set null,
  usual_area text,
  usual_notes text,
  last_booking_id uuid,
  favorite_selection jsonb,
  recent_booking_combinations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_preferences is
  'Private returning-client defaults and Book Again metadata.';

-- ---------------------------------------------------------------------------
-- Repair columns when this migration follows a partially applied schema
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists saved_address_id uuid references public.client_addresses(id) on delete set null;
alter table public.bookings add column if not exists selected_services jsonb not null default '[]'::jsonb;
alter table public.bookings add column if not exists selected_durations jsonb not null default '[]'::jsonb;

alter table public.client_profiles add column if not exists full_name text;
alter table public.client_profiles add column if not exists email text;
alter table public.client_profiles add column if not exists phone text;
alter table public.client_profiles add column if not exists created_at timestamptz not null default now();
alter table public.client_profiles add column if not exists updated_at timestamptz not null default now();

alter table public.client_addresses add column if not exists label text not null default 'Home';
alter table public.client_addresses add column if not exists address_line_1 text;
alter table public.client_addresses add column if not exists address_line_2 text;
alter table public.client_addresses add column if not exists city text not null default 'London';
alter table public.client_addresses add column if not exists postcode text;
alter table public.client_addresses add column if not exists area text;
alter table public.client_addresses add column if not exists instructions text;
alter table public.client_addresses add column if not exists is_default boolean not null default false;
alter table public.client_addresses add column if not exists created_at timestamptz not null default now();
alter table public.client_addresses add column if not exists updated_at timestamptz not null default now();

alter table public.client_preferences add column if not exists preferred_service_ids jsonb not null default '[]'::jsonb;
alter table public.client_preferences add column if not exists preferred_durations jsonb not null default '{}'::jsonb;
alter table public.client_preferences add column if not exists preferred_address_id uuid references public.client_addresses(id) on delete set null;
alter table public.client_preferences add column if not exists usual_area text;
alter table public.client_preferences add column if not exists usual_notes text;
alter table public.client_preferences add column if not exists last_booking_id uuid;
alter table public.client_preferences add column if not exists favorite_selection jsonb;
alter table public.client_preferences add column if not exists recent_booking_combinations jsonb not null default '[]'::jsonb;
alter table public.client_preferences add column if not exists created_at timestamptz not null default now();
alter table public.client_preferences add column if not exists updated_at timestamptz not null default now();

comment on column public.bookings.user_id is
  'Authenticated client id when logged in; NULL for guest bookings.';

comment on column public.bookings.saved_address_id is
  'Optional saved address owned by the authenticated booking client.';

comment on column public.bookings.selected_services is
  'Snapshot of the treatments and enhancements selected for this booking.';

comment on column public.bookings.selected_durations is
  'Snapshot of treatment duration selections for booking history.';

-- Recreate named constraints once, after all referenced tables and columns exist.
alter table public.client_preferences
  drop constraint if exists client_preferences_last_booking_id_fkey;

alter table public.client_preferences
  add constraint client_preferences_last_booking_id_fkey
  foreign key (last_booking_id)
  references public.bookings(id)
  on delete set null;

alter table public.client_preferences
  drop constraint if exists client_preferences_service_ids_are_json_array;

alter table public.client_preferences
  add constraint client_preferences_service_ids_are_json_array
  check (jsonb_typeof(preferred_service_ids) = 'array');

alter table public.client_preferences
  drop constraint if exists client_preferences_durations_are_json_object;

alter table public.client_preferences
  add constraint client_preferences_durations_are_json_object
  check (jsonb_typeof(preferred_durations) = 'object');

alter table public.client_preferences
  drop constraint if exists client_preferences_favorite_selection_is_object;

alter table public.client_preferences
  add constraint client_preferences_favorite_selection_is_object
  check (
    favorite_selection is null
    or jsonb_typeof(favorite_selection) = 'object'
  );

alter table public.client_preferences
  drop constraint if exists client_preferences_recent_combinations_are_array;

alter table public.client_preferences
  add constraint client_preferences_recent_combinations_are_array
  check (jsonb_typeof(recent_booking_combinations) = 'array');

-- ---------------------------------------------------------------------------
-- Trigger functions and triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.validate_client_preferred_address()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.preferred_address_id is not null
     and not exists (
       select 1
       from public.client_addresses as address
       where address.id = new.preferred_address_id
         and address.user_id = new.user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Preferred address must belong to the same client.';
  end if;

  return new;
end;
$function$;

drop trigger if exists set_client_profiles_updated_at on public.client_profiles;

create trigger set_client_profiles_updated_at
before update on public.client_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_addresses_updated_at on public.client_addresses;

create trigger set_client_addresses_updated_at
before update on public.client_addresses
for each row
execute function public.set_updated_at();

drop trigger if exists set_client_preferences_updated_at on public.client_preferences;

create trigger set_client_preferences_updated_at
before update on public.client_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists validate_client_preferred_address on public.client_preferences;

create trigger validate_client_preferred_address
before insert or update of user_id, preferred_address_id
on public.client_preferences
for each row
execute function public.validate_client_preferred_address();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create unique index if not exists client_addresses_one_default_per_user_idx
on public.client_addresses (user_id)
where is_default;

create index if not exists client_profiles_email_idx
on public.client_profiles (lower(email));

create index if not exists client_profiles_phone_idx
on public.client_profiles (phone);

create index if not exists client_addresses_user_id_idx
on public.client_addresses (user_id);

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

create index if not exists orders_user_id_created_at_idx
on public.orders (user_id, created_at desc)
where user_id is not null;

create index if not exists client_preferences_last_booking_id_idx
on public.client_preferences (last_booking_id)
where last_booking_id is not null;

create index if not exists booking_holds_date_expires_idx
on public.booking_holds (date, expires_at);

-- ---------------------------------------------------------------------------
-- Admin authorization
-- ---------------------------------------------------------------------------

create or replace function public.current_user_is_booking_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $function$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$function$;

revoke all on function public.current_user_is_booking_admin() from public;
revoke all on function public.current_user_is_booking_admin() from anon;
grant execute on function public.current_user_is_booking_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security and table privileges
-- ---------------------------------------------------------------------------

alter table public.client_profiles enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_preferences enable row level security;
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.booking_holds enable row level security;
alter table public.admin_users enable row level security;

revoke all on table public.client_profiles from anon;
revoke all on table public.client_addresses from anon;
revoke all on table public.client_preferences from anon;
revoke all on table public.bookings from anon;
revoke all on table public.orders from anon;
revoke all on table public.booking_holds from anon;
revoke all on table public.admin_users from anon;

revoke all on table public.client_profiles from authenticated;
revoke all on table public.client_addresses from authenticated;
revoke all on table public.client_preferences from authenticated;
revoke all on table public.bookings from authenticated;
revoke all on table public.orders from authenticated;
revoke all on table public.booking_holds from authenticated;
revoke all on table public.admin_users from authenticated;

grant select, insert, update, delete
on table public.client_profiles
to authenticated;

grant select, insert, update, delete
on table public.client_addresses
to authenticated;

grant select, insert, update, delete
on table public.client_preferences
to authenticated;

grant select, update, delete
on table public.bookings
to authenticated;

grant select, update
on table public.orders
to authenticated;

grant select
on table public.booking_holds
to authenticated;

grant select
on table public.admin_users
to authenticated;

-- ---------------------------------------------------------------------------
-- Remove legacy policies
-- ---------------------------------------------------------------------------

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

drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Authenticated users can create orders" on public.orders;
drop policy if exists "Booking admins can read orders" on public.orders;
drop policy if exists "Booking admins can update orders" on public.orders;
drop policy if exists "Clients can read own orders" on public.orders;
drop policy if exists "Clients and admins can read permitted orders" on public.orders;

drop policy if exists "Booking admins can read booking holds" on public.booking_holds;
drop policy if exists "Booking admins can read admin users" on public.admin_users;

-- ---------------------------------------------------------------------------
-- Client-owned data policies
-- ---------------------------------------------------------------------------

drop policy if exists "Clients can read own profile" on public.client_profiles;
create policy "Clients can read own profile"
on public.client_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can create own profile" on public.client_profiles;
create policy "Clients can create own profile"
on public.client_profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can update own profile" on public.client_profiles;
create policy "Clients can update own profile"
on public.client_profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
)
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can delete own profile" on public.client_profiles;
create policy "Clients can delete own profile"
on public.client_profiles
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can read own addresses" on public.client_addresses;
create policy "Clients can read own addresses"
on public.client_addresses
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can create own addresses" on public.client_addresses;
create policy "Clients can create own addresses"
on public.client_addresses
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can update own addresses" on public.client_addresses;
create policy "Clients can update own addresses"
on public.client_addresses
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
)
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can delete own addresses" on public.client_addresses;
create policy "Clients can delete own addresses"
on public.client_addresses
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can read own preferences" on public.client_preferences;
create policy "Clients can read own preferences"
on public.client_preferences
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can create own preferences" on public.client_preferences;
create policy "Clients can create own preferences"
on public.client_preferences
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can update own preferences" on public.client_preferences;
create policy "Clients can update own preferences"
on public.client_preferences
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
)
with check (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

drop policy if exists "Clients can delete own preferences" on public.client_preferences;
create policy "Clients can delete own preferences"
on public.client_preferences
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

-- ---------------------------------------------------------------------------
-- Booking, order, hold, and admin policies
-- ---------------------------------------------------------------------------

create policy "Clients and admins can read permitted bookings"
on public.bookings
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

create policy "Booking admins can update bookings"
on public.bookings
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete bookings"
on public.bookings
for delete
to authenticated
using (public.current_user_is_booking_admin());

create policy "Clients and admins can read permitted orders"
on public.orders
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_booking_admin()
);

create policy "Booking admins can update orders"
on public.orders
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can read booking holds"
on public.booking_holds
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.current_user_is_booking_admin());

-- ---------------------------------------------------------------------------
-- Validated guest/authenticated order creation
-- ---------------------------------------------------------------------------

create or replace function public.create_secure_order(order_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  allowed_keys constant text[] := array[
    'id',
    'user_id',
    'client_email',
    'client_name',
    'payment_id',
    'payment_provider',
    'payment_status',
    'total_amount'
  ];
  requested_id uuid;
  effective_user_id uuid;
  is_admin boolean := public.current_user_is_booking_admin();
  normalized_email text;
  normalized_name text;
  normalized_status text;
  normalized_total numeric(10,2);
begin
  if order_payload is null
     or jsonb_typeof(order_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Order payload must be an object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(order_payload) as payload_key(key_name)
    where key_name <> all (allowed_keys)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Order payload contains unsupported fields.';
  end if;

  requested_id := coalesce(
    nullif(order_payload ->> 'id', '')::uuid,
    gen_random_uuid()
  );

  effective_user_id := case
    when is_admin then nullif(order_payload ->> 'user_id', '')::uuid
    else auth.uid()
  end;

  normalized_email := lower(trim(coalesce(
    order_payload ->> 'client_email',
    ''
  )));

  normalized_name := trim(coalesce(
    order_payload ->> 'client_name',
    ''
  ));

  normalized_total := round(
    greatest(
      0,
      coalesce(nullif(order_payload ->> 'total_amount', '')::numeric, 0)
    ),
    2
  );

  normalized_status := case
    when is_admin
         and order_payload ->> 'payment_status' in (
           'pending',
           'paid',
           'failed',
           'refunded',
           'bank transfer pending',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival',
           'cancelled'
         )
      then order_payload ->> 'payment_status'
    when order_payload ->> 'payment_status' in (
           'paid',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival'
         )
      then order_payload ->> 'payment_status'
    else 'pending'
  end;

  if normalized_email = ''
     or length(normalized_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'A valid client email is required.';
  end if;

  if normalized_name = ''
     or length(normalized_name) > 160 then
    raise exception using
      errcode = '22023',
      message = 'A valid client name is required.';
  end if;

  if normalized_total > 100000 then
    raise exception using
      errcode = '22023',
      message = 'Order total is outside the accepted range.';
  end if;

  insert into public.orders (
    id,
    user_id,
    client_email,
    client_name,
    payment_id,
    payment_provider,
    payment_status,
    total_amount
  )
  values (
    requested_id,
    effective_user_id,
    normalized_email,
    normalized_name,
    left(nullif(trim(order_payload ->> 'payment_id'), ''), 200),
    left(nullif(trim(order_payload ->> 'payment_provider'), ''), 80),
    normalized_status,
    normalized_total
  )
  on conflict (id) do nothing;

  return requested_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Validated guest/authenticated booking creation
-- ---------------------------------------------------------------------------

create or replace function public.create_secure_booking(booking_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $booking_function$
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
    'notes',
    'selected_services',
    'selected_durations'
  ];
  requested_id uuid;
  requested_order_id uuid;
  requested_address_id uuid;
  effective_user_id uuid;
  is_admin boolean := public.current_user_is_booking_admin();
  booking_date date;
  booking_start integer;
  booking_duration integer;
  booking_end integer;
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
begin
  if booking_payload is null
     or jsonb_typeof(booking_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Booking payload must be an object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(booking_payload) as payload_key(key_name)
    where key_name <> all (allowed_keys)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Booking payload contains unsupported fields.';
  end if;

  requested_id := coalesce(
    nullif(booking_payload ->> 'id', '')::uuid,
    gen_random_uuid()
  );

  requested_order_id := nullif(
    booking_payload ->> 'order_id',
    ''
  )::uuid;

  requested_address_id := nullif(
    booking_payload ->> 'saved_address_id',
    ''
  )::uuid;

  effective_user_id := case
    when is_admin then nullif(booking_payload ->> 'user_id', '')::uuid
    else auth.uid()
  end;

  booking_date := (booking_payload ->> 'date')::date;
  booking_start := (booking_payload ->> 'start_minutes')::integer;
  booking_duration := (booking_payload ->> 'duration_minutes')::integer;
  booking_end := booking_start + booking_duration;

  normalized_email := lower(trim(coalesce(
    booking_payload ->> 'client_email',
    ''
  )));

  normalized_name := trim(coalesce(
    booking_payload ->> 'client_name',
    ''
  ));

  normalized_phone := nullif(trim(coalesce(
    booking_payload ->> 'client_phone',
    ''
  )), '');

  normalized_service := trim(coalesce(
    booking_payload ->> 'service_name',
    booking_payload ->> 'service',
    ''
  ));

  normalized_status := case
    when is_admin
         and booking_payload ->> 'status' in (
           'confirmed',
           'pending',
           'pending_payment_verification',
           'payment_method_review',
           'cancelled',
           'completed',
           'refunded',
           'no-show'
         )
      then booking_payload ->> 'status'
    when booking_payload ->> 'status' in (
           'confirmed',
           'pending_payment_verification',
           'payment_method_review'
         )
      then booking_payload ->> 'status'
    else 'confirmed'
  end;

  normalized_payment_status := case
    when is_admin
         and booking_payload ->> 'payment_status' in (
           'pending',
           'paid',
           'failed',
           'refunded',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival',
           'cancelled'
         )
      then booking_payload ->> 'payment_status'
    when booking_payload ->> 'payment_status' in (
           'paid',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival'
         )
      then booking_payload ->> 'payment_status'
    else 'pending'
  end;

  -- Enforce status consistency rules for new bookings
  -- If payment_status is 'paid', status must be 'confirmed'
  if normalized_payment_status = 'paid' and normalized_status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "paid", status must be "confirmed".';
  end if;

  -- If status is 'confirmed', payment_status must be 'paid'
  if normalized_status = 'confirmed' and normalized_payment_status <> 'paid' then
    raise exception using
      errcode = '22023',
      message = 'When status is "confirmed", payment_status must be "paid".';
  end if;

  -- If status is 'cancelled', payment_status must be 'cancelled'
  if normalized_status = 'cancelled' and normalized_payment_status <> 'cancelled' then
    raise exception using
      errcode = '22023',
      message = 'When status is "cancelled", payment_status must be "cancelled".';
  end if;

  -- If payment_status is 'cancelled', status must be 'cancelled'
  if normalized_payment_status = 'cancelled' and normalized_status <> 'cancelled' then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "cancelled", status must be "cancelled".';
  end if;

  -- If status is 'pending_payment_verification', payment_status must be 'awaiting_verification'
  if normalized_status = 'pending_payment_verification' and normalized_payment_status <> 'awaiting_verification' then
    raise exception using
      errcode = '22023',
      message = 'When status is "pending_payment_verification", payment_status must be "awaiting_verification".';
  end if;

  -- If payment_status is 'awaiting_verification', status must be 'pending_payment_verification' or 'payment_method_review'
  if normalized_payment_status = 'awaiting_verification' and normalized_status not in ('pending_payment_verification', 'payment_method_review') then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "awaiting_verification", status must be "pending_payment_verification" or "payment_method_review".';
  end if;

  -- If status is 'payment_method_review', payment_status must be 'awaiting_verification' or 'alternative_requested'
  if normalized_status = 'payment_method_review' and normalized_payment_status not in ('awaiting_verification', 'alternative_requested', 'cash_on_arrival') then
    raise exception using
      errcode = '22023',
      message = 'When status is "payment_method_review", payment_status must be "awaiting_verification", "alternative_requested", or "cash_on_arrival".';
  end if;

  normalized_services := coalesce(
    booking_payload -> 'selected_services',
    '[]'::jsonb
  );

  normalized_durations := coalesce(
    booking_payload -> 'selected_durations',
    '[]'::jsonb
  );

  normalized_price := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0)
    ),
    2
  );

  normalized_travel_fee := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0)
    ),
    2
  );

  normalized_congestion_fee := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0)
    ),
    2
  );

  if normalized_name = ''
     or length(normalized_name) > 160 then
    raise exception using
      errcode = '22023',
      message = 'A valid client name is required.';
  end if;

  if normalized_email = ''
     or length(normalized_email) > 320
     or (not is_admin and normalized_email = 'not-provided@example.local') then
    raise exception using
      errcode = '22023',
      message = 'A valid client email is required.';
  end if;

  if normalized_phone is not null
     and length(normalized_phone) > 40 then
    raise exception using
      errcode = '22023',
      message = 'Client phone is too long.';
  end if;

  if normalized_service = ''
     or length(normalized_service) > 240 then
    raise exception using
      errcode = '22023',
      message = 'A valid treatment is required.';
  end if;

  if booking_date < current_date then
    raise exception using
      errcode = '22023',
      message = 'Booking date cannot be in the past.';
  end if;

  if booking_start < 0
     or booking_start >= 1440
     or booking_duration <= 0
     or not (booking_duration = any(ARRAY[60, 90, 120, 150, 180, 210, 240]))
     or booking_end > 1440 then
    raise exception using
      errcode = '22023',
      message = 'Booking duration must be one of: 60, 90, 120, 150, 180, 210, 240 minutes.';
  end if;

  if jsonb_typeof(normalized_services) <> 'array'
     or jsonb_array_length(normalized_services) > 20
     or jsonb_typeof(normalized_durations) <> 'array'
     or jsonb_array_length(normalized_durations) > 20 then
    raise exception using
      errcode = '22023',
      message = 'Booking treatment selection is invalid.';
  end if;

  if length(coalesce(booking_payload ->> 'address', '')) > 500
     or length(coalesce(booking_payload ->> 'notes', '')) > 12000 then
    raise exception using
      errcode = '22023',
      message = 'Booking address or notes are too long.';
  end if;

  if requested_address_id is not null
     and not is_admin
     and not exists (
       select 1
       from public.client_addresses as address
       where address.id = requested_address_id
         and address.user_id = effective_user_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Saved address does not belong to this client.';
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
    raise exception using
      errcode = '42501',
      message = 'Order does not belong to this booking client.';
  end if;

  -- Serialize final booking creation for the selected day, then reject an
  -- overlapping confirmed booking. The scheduling engine and hold RPC retain
  -- responsibility for working hours, chain mode, and travel buffers.
  perform pg_advisory_xact_lock(hashtext(booking_date::text));

  if exists (
    select 1
    from public.bookings as existing
    where existing.date = booking_date
      and existing.status not in ('cancelled', 'refunded')
      and int4range(
        existing.start_minutes,
        existing.start_minutes + existing.duration_minutes,
        '[)'
      ) && int4range(
        booking_start,
        booking_end,
        '[)'
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Time slot is no longer available.';
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
    status,
    payment_status,
    notes,
    selected_services,
    selected_durations
  )
  values (
    requested_id,
    requested_order_id,
    effective_user_id,
    requested_address_id,
    normalized_name,
    normalized_email,
    normalized_phone,
    left(nullif(trim(booking_payload ->> 'service_id'), ''), 120),
    normalized_service,
    normalized_service,
    booking_date,
    booking_start,
    booking_end,
    booking_duration,
    left(nullif(trim(booking_payload ->> 'address'), ''), 500),
    left(nullif(trim(booking_payload ->> 'postcode'), ''), 20),
    left(nullif(trim(booking_payload ->> 'selected_area'), ''), 120),
    normalized_price,
    normalized_travel_fee,
    normalized_congestion_fee,
    left(nullif(trim(booking_payload ->> 'payment_id'), ''), 200),
    normalized_status,
    normalized_payment_status,
    booking_payload ->> 'notes',
    normalized_services,
    normalized_durations
  )
  on conflict (id) do nothing;

  return requested_id;
end;
$booking_function$;

create or replace function public.update_secure_booking(booking_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $update_booking_function$
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
    'notes',
    'selected_services',
    'selected_durations'
  ];
  requested_id uuid;
  requested_order_id uuid;
  requested_address_id uuid;
  effective_user_id uuid;
  is_admin boolean := public.current_user_is_booking_admin();
  booking_date date;
  booking_start integer;
  booking_duration integer;
  booking_end integer;
  normalized_email text;
  normalized_name text;
  normalized_phone text;
  normalized_service text;
  normalized_status text;
  normalized_services jsonb;
  normalized_durations jsonb;
  normalized_price numeric(10,2);
  normalized_travel_fee numeric(10,2);
  normalized_congestion_fee numeric(10,2);
begin
  if booking_payload is null
     or jsonb_typeof(booking_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Booking payload must be an object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(booking_payload) as payload_key(key_name)
    where key_name <> all (allowed_keys)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Booking payload contains unsupported fields.';
  end if;

  if not is_admin then
    raise exception using
      errcode = '42501',
      message = 'Only booking admins may update bookings.';
  end if;

  requested_id := nullif(booking_payload ->> 'id', '')::uuid;
  if requested_id is null then
    raise exception using
      errcode = '22023',
      message = 'Booking id is required for updates.';
  end if;

  requested_order_id := nullif(
    booking_payload ->> 'order_id',
    ''
  )::uuid;

  requested_address_id := nullif(
    booking_payload ->> 'saved_address_id',
    ''
  )::uuid;

  effective_user_id := case
    when is_admin then nullif(booking_payload ->> 'user_id', '')::uuid
    else auth.uid()
  end;

  booking_date := (booking_payload ->> 'date')::date;
  booking_start := (booking_payload ->> 'start_minutes')::integer;
  booking_duration := (booking_payload ->> 'duration_minutes')::integer;
  booking_end := booking_start + booking_duration;

  normalized_email := lower(trim(coalesce(
    booking_payload ->> 'client_email',
    ''
  )));

  normalized_name := trim(coalesce(
    booking_payload ->> 'client_name',
    ''
  ));

  normalized_phone := nullif(trim(coalesce(
    booking_payload ->> 'client_phone',
    ''
  )), '');

  normalized_service := trim(coalesce(
    booking_payload ->> 'service_name',
    booking_payload ->> 'service',
    ''
  ));

  normalized_status := case
    when is_admin
         and booking_payload ->> 'status' in (
           'confirmed',
           'pending',
           'pending_payment_verification',
           'payment_method_review',
           'cancelled',
           'completed',
           'refunded',
           'no-show'
         )
      then booking_payload ->> 'status'
    when booking_payload ->> 'status' in (
           'confirmed',
           'pending_payment_verification',
           'payment_method_review'
         )
      then booking_payload ->> 'status'
    else 'confirmed'
  end;

  normalized_payment_status := case
    when is_admin
         and booking_payload ->> 'payment_status' in (
           'pending',
           'paid',
           'failed',
           'refunded',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival',
           'cancelled'
         )
      then booking_payload ->> 'payment_status'
    when booking_payload ->> 'payment_status' in (
           'paid',
           'awaiting_verification',
           'alternative_requested',
           'cash_on_arrival'
         )
      then booking_payload ->> 'payment_status'
    else 'pending'
  end;

  -- Enforce status consistency rules for updates
  -- If payment_status is 'paid', status must be 'confirmed'
  if normalized_payment_status = 'paid' and normalized_status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "paid", status must be "confirmed".';
  end if;

  -- If status is 'confirmed', payment_status must be 'paid'
  if normalized_status = 'confirmed' and normalized_payment_status <> 'paid' then
    raise exception using
      errcode = '22023',
      message = 'When status is "confirmed", payment_status must be "paid".';
  end if;

  -- If status is 'cancelled', payment_status must be 'cancelled'
  if normalized_status = 'cancelled' and normalized_payment_status <> 'cancelled' then
    raise exception using
      errcode = '22023',
      message = 'When status is "cancelled", payment_status must be "cancelled".';
  end if;

  -- If payment_status is 'cancelled', status must be 'cancelled'
  if normalized_payment_status = 'cancelled' and normalized_status <> 'cancelled' then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "cancelled", status must be "cancelled".';
  end if;

  -- If status is 'pending_payment_verification', payment_status must be 'awaiting_verification'
  if normalized_status = 'pending_payment_verification' and normalized_payment_status <> 'awaiting_verification' then
    raise exception using
      errcode = '22023',
      message = 'When status is "pending_payment_verification", payment_status must be "awaiting_verification".';
  end if;

  -- If payment_status is 'awaiting_verification', status must be 'pending_payment_verification' or 'payment_method_review'
  if normalized_payment_status = 'awaiting_verification' and normalized_status not in ('pending_payment_verification', 'payment_method_review') then
    raise exception using
      errcode = '22023',
      message = 'When payment_status is "awaiting_verification", status must be "pending_payment_verification" or "payment_method_review".';
  end if;

  -- If status is 'payment_method_review', payment_status must be 'awaiting_verification' or 'alternative_requested'
  if normalized_status = 'payment_method_review' and normalized_payment_status not in ('awaiting_verification', 'alternative_requested', 'cash_on_arrival') then
    raise exception using
      errcode = '22023',
      message = 'When status is "payment_method_review", payment_status must be "awaiting_verification", "alternative_requested", or "cash_on_arrival".';
  end if;

  normalized_services := coalesce(
    booking_payload -> 'selected_services',
    '[]'::jsonb
  );

  normalized_durations := coalesce(
    booking_payload -> 'selected_durations',
    '[]'::jsonb
  );

  normalized_price := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0)
    ),
    2
  );

  normalized_travel_fee := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0)
    ),
    2
  );

  normalized_congestion_fee := round(
    greatest(
      0,
      coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0)
    ),
    2
  );

  if normalized_name = ''
     or length(normalized_name) > 160 then
    raise exception using
      errcode = '22023',
      message = 'A valid client name is required.';
  end if;

  if normalized_email = ''
     or length(normalized_email) > 320
     or (not is_admin and normalized_email = 'not-provided@example.local') then
    raise exception using
      errcode = '22023',
      message = 'A valid client email is required.';
  end if;

  if normalized_phone is not null
     and length(normalized_phone) > 40 then
    raise exception using
      errcode = '22023',
      message = 'Client phone is too long.';
  end if;

  if normalized_service = ''
     or length(normalized_service) > 240 then
    raise exception using
      errcode = '22023',
      message = 'A valid treatment is required.';
  end if;

  if booking_date < current_date then
    raise exception using
      errcode = '22023',
      message = 'Booking date cannot be in the past.';
  end if;

  if booking_start < 0
     or booking_start >= 1440
     or booking_duration <= 0
     or not (booking_duration = any(ARRAY[60, 90, 120, 150, 180, 210, 240]))
     or booking_end > 1440 then
    raise exception using
      errcode = '22023',
      message = 'Booking duration must be one of: 60, 90, 120, 150, 180, 210, 240 minutes.';
  end if;

  if jsonb_typeof(normalized_services) <> 'array'
     or jsonb_array_length(normalized_services) > 20
     or jsonb_typeof(normalized_durations) <> 'array'
     or jsonb_array_length(normalized_durations) > 20 then
    raise exception using
      errcode = '22023',
      message = 'Booking treatment selection is invalid.';
  end if;

  if length(coalesce(booking_payload ->> 'address', '')) > 500
     or length(coalesce(booking_payload ->> 'notes', '')) > 12000 then
    raise exception using
      errcode = '22023',
      message = 'Booking address or notes are too long.';
  end if;

  if requested_address_id is not null
     and not exists (
       select 1
       from public.client_addresses as address
       where address.id = requested_address_id
         and address.user_id = effective_user_id
     ) then
    raise exception using
      errcode = '42501',
      message = 'Saved address does not belong to this client.';
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
    raise exception using
      errcode = '42501',
      message = 'Order does not belong to this booking client.';
  end if;

  perform pg_advisory_xact_lock(hashtext(booking_date::text));

  if exists (
    select 1
    from public.bookings as existing
    where existing.id <> requested_id
      and existing.date = booking_date
      and existing.status not in ('cancelled', 'refunded')
      and int4range(
        existing.start_minutes,
        existing.start_minutes + existing.duration_minutes,
        '[)'
      ) && int4range(
        booking_start,
        booking_end,
        '[)'
      )
  ) then
    raise exception using
      errcode = '23P01',
      message = 'Time slot is no longer available.';
  end if;

  update public.bookings
  set
    order_id = requested_order_id,
    user_id = effective_user_id,
    saved_address_id = requested_address_id,
    client_name = normalized_name,
    client_email = normalized_email,
    client_phone = normalized_phone,
    service_id = left(nullif(trim(booking_payload ->> 'service_id'), ''), 120),
    service = normalized_service,
    service_name = normalized_service,
    date = booking_date,
    start_minutes = booking_start,
    end_minutes = booking_end,
    duration_minutes = booking_duration,
    address = left(nullif(trim(booking_payload ->> 'address'), ''), 500),
    postcode = left(nullif(trim(booking_payload ->> 'postcode'), ''), 20),
    selected_area = left(nullif(trim(booking_payload ->> 'selected_area'), ''), 120),
    price = normalized_price,
    travel_fee = normalized_travel_fee,
    congestion_fee = normalized_congestion_fee,
    payment_id = left(nullif(trim(booking_payload ->> 'payment_id'), ''), 200),
    status = normalized_status,
    payment_status = normalized_payment_status,
    notes = booking_payload ->> 'notes',
    selected_services = normalized_services,
    selected_durations = normalized_durations
  where id = requested_id
  returning id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Booking update failed because the booking could not be found.';
  end if;

  return requested_id;
end;
$update_booking_function$;

revoke all on function public.create_secure_order(jsonb) from public;
revoke all on function public.create_secure_booking(jsonb) from public;
revoke all on function public.update_secure_booking(jsonb) from public;

grant execute on function public.create_secure_order(jsonb)
to anon, authenticated;

grant execute on function public.create_secure_booking(jsonb)
to anon, authenticated;

grant execute on function public.update_secure_booking(jsonb)
to authenticated;
