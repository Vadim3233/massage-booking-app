-- Clean replacement for the returning-client security migration.
-- This migration is additive and idempotent: existing guest bookings remain valid.

create extension if not exists pgcrypto;

-- Core dependencies used by the secure RPCs. These definitions intentionally
-- match the existing booking application schema and do not remove existing data.
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

-- One private profile per Supabase Auth user.
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

-- Reusable private addresses owned by authenticated clients.
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
  'Private saved treatment addresses for returning clients.';

-- Defaults and recent-session information used by the Book Again flow.
create table if not exists public.client_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_service_ids jsonb not null default '[]'::jsonb,
  preferred_durations jsonb not null default '{}'::jsonb,
  preferred_address_id uuid references public.client_addresses(id) on delete set null,
  usual_area text,
  usual_notes text,
  last_booking_id uuid,
  recent_combinations jsonb not null default '[]'::jsonb,
  favorite_combination jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_preferences is
  'Private returning-client defaults, favourites, and recent booking combinations.';

-- Complete partially existing installations without duplicating declarations.
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

alter table public.client_profiles
  add column if not exists full_name text;
alter table public.client_profiles
  add column if not exists email text;
alter table public.client_profiles
  add column if not exists phone text;
alter table public.client_profiles
  add column if not exists created_at timestamptz not null default now();
alter table public.client_profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.client_addresses
  add column if not exists label text not null default 'Home';
alter table public.client_addresses
  add column if not exists address_line_1 text;
alter table public.client_addresses
  add column if not exists address_line_2 text;
alter table public.client_addresses
  add column if not exists city text not null default 'London';
alter table public.client_addresses
  add column if not exists postcode text;
alter table public.client_addresses
  add column if not exists area text;
alter table public.client_addresses
  add column if not exists instructions text;
alter table public.client_addresses
  add column if not exists is_default boolean not null default false;
alter table public.client_addresses
  add column if not exists created_at timestamptz not null default now();
alter table public.client_addresses
  add column if not exists updated_at timestamptz not null default now();

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
  add column if not exists last_booking_id uuid;
alter table public.client_preferences
  add column if not exists recent_combinations jsonb not null default '[]'::jsonb;
alter table public.client_preferences
  add column if not exists favorite_combination jsonb;
alter table public.client_preferences
  add column if not exists created_at timestamptz not null default now();
alter table public.client_preferences
  add column if not exists updated_at timestamptz not null default now();

-- Recreate data-shape and booking-history constraints once, with valid targets.
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
  drop constraint if exists client_preferences_recent_combinations_are_json_array;
alter table public.client_preferences
  add constraint client_preferences_recent_combinations_are_json_array
  check (jsonb_typeof(recent_combinations) = 'array');

alter table public.client_preferences
  drop constraint if exists client_preferences_last_booking_id_fkey;
alter table public.client_preferences
  add constraint client_preferences_last_booking_id_fkey
  foreign key (last_booking_id) references public.bookings(id) on delete set null;

-- Timestamp maintenance shared by all client-owned records.
create or replace function public.set_client_updated_at()
returns trigger
language plpgsql
set search_path = public
as $updated_at$
begin
  new.updated_at = now();
  return new;
end;
$updated_at$;

drop trigger if exists set_client_profiles_updated_at on public.client_profiles;
create trigger set_client_profiles_updated_at
before update on public.client_profiles
for each row execute function public.set_client_updated_at();

drop trigger if exists set_client_addresses_updated_at on public.client_addresses;
create trigger set_client_addresses_updated_at
before update on public.client_addresses
for each row execute function public.set_client_updated_at();

drop trigger if exists set_client_preferences_updated_at on public.client_preferences;
create trigger set_client_preferences_updated_at
before update on public.client_preferences
for each row execute function public.set_client_updated_at();

-- A preferred address must belong to the same authenticated client.
create or replace function public.validate_client_preferred_address()
returns trigger
language plpgsql
set search_path = public
as $preferred_address$
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
$preferred_address$;

drop trigger if exists validate_client_preferred_address on public.client_preferences;
create trigger validate_client_preferred_address
before insert or update of user_id, preferred_address_id on public.client_preferences
for each row execute function public.validate_client_preferred_address();

-- Lookup indexes for client records and booking history.
create index if not exists client_profiles_email_idx
on public.client_profiles (lower(email));

create index if not exists client_profiles_phone_idx
on public.client_profiles (phone);

create index if not exists client_addresses_user_id_idx
on public.client_addresses (user_id);

create unique index if not exists client_addresses_one_default_per_user_idx
on public.client_addresses (user_id)
where is_default;

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

create index if not exists orders_user_id_created_at_idx
on public.orders (user_id, created_at desc)
where user_id is not null;

-- Server-enforced admin allowlist check.
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

-- RLS is enabled on all private and booking ownership tables.
alter table public.client_profiles enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_preferences enable row level security;
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.admin_users enable row level security;

-- Remove legacy policies before creating one coherent policy set.
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

drop policy if exists "Public can create bookings" on public.bookings;
drop policy if exists "Authenticated users can create bookings" on public.bookings;
drop policy if exists "Clients can read own bookings" on public.bookings;
drop policy if exists "Booking admins can read bookings" on public.bookings;
drop policy if exists "Booking admins can update bookings" on public.bookings;
drop policy if exists "Booking admins can delete bookings" on public.bookings;
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

create policy "Clients and admins can delete own profile"
on public.client_profiles for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

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

create policy "Clients and admins can delete own preferences"
on public.client_preferences for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

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

create policy "Booking admins can read admin users"
on public.admin_users for select to authenticated
using (public.current_user_is_booking_admin());

-- Direct anonymous table access is removed. Guest creation is available only
-- through the two validated SECURITY DEFINER functions below.
revoke all on table public.client_profiles from anon, authenticated;
revoke all on table public.client_addresses from anon, authenticated;
revoke all on table public.client_preferences from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;

grant select, insert, update, delete on table public.client_profiles to authenticated;
grant select, insert, update, delete on table public.client_addresses to authenticated;
grant select, insert, update, delete on table public.client_preferences to authenticated;
grant select, update, delete on table public.bookings to authenticated;
grant select, update on table public.orders to authenticated;
grant select on table public.admin_users to authenticated;

-- Creates one order while preventing callers from assigning another user's id.
create or replace function public.create_secure_order(order_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $secure_order$
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
  requested_user_id uuid;
  effective_user_id uuid;
  created_order public.orders%rowtype;
begin
  if order_payload is null or jsonb_typeof(order_payload) <> 'object' then
    raise exception 'Order payload must be a JSON object.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(order_payload) as supplied(key)
    where not (supplied.key = any(allowed_keys))
  ) then
    raise exception 'Order payload contains unsupported fields.';
  end if;

  requested_user_id := nullif(order_payload ->> 'user_id', '')::uuid;

  if auth.uid() is null then
    effective_user_id := null;
  elsif public.current_user_is_booking_admin() then
    effective_user_id := requested_user_id;
  else
    effective_user_id := auth.uid();
    if requested_user_id is not null and requested_user_id <> auth.uid() then
      raise exception 'Cannot create an order for another client.';
    end if;
  end if;

  insert into public.orders (
    id,
    user_id,
    client_id,
    client_name,
    client_email,
    payment_provider,
    payment_id,
    payment_status,
    total_amount
  )
  values (
    coalesce(nullif(order_payload ->> 'id', '')::uuid, gen_random_uuid()),
    effective_user_id,
    effective_user_id,
    nullif(trim(order_payload ->> 'client_name'), ''),
    lower(nullif(trim(order_payload ->> 'client_email'), '')),
    nullif(trim(order_payload ->> 'payment_provider'), ''),
    nullif(trim(order_payload ->> 'payment_id'), ''),
    coalesce(nullif(trim(order_payload ->> 'payment_status'), ''), 'pending'),
    greatest(coalesce(nullif(order_payload ->> 'total_amount', '')::numeric, 0), 0)
  )
  returning * into created_order;

  return created_order;
end;
$secure_order$;

-- Creates one validated booking. It has one INSERT column list and one VALUES
-- list by design so the field mapping remains auditable.
create or replace function public.create_secure_booking(booking_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
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
    'status',
    'notes',
    'selected_services',
    'selected_durations'
  ];
  requested_user_id uuid;
  effective_user_id uuid;
  requested_order_id uuid;
  requested_saved_address_id uuid;
  requested_date date;
  requested_start integer;
  requested_duration integer;
  requested_end integer;
  normalized_price numeric(10,2);
  normalized_travel_fee numeric(10,2);
  normalized_congestion_fee numeric(10,2);
  created_booking public.bookings%rowtype;
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

  requested_user_id := nullif(booking_payload ->> 'user_id', '')::uuid;
  requested_order_id := nullif(booking_payload ->> 'order_id', '')::uuid;
  requested_saved_address_id := nullif(booking_payload ->> 'saved_address_id', '')::uuid;
  requested_date := nullif(booking_payload ->> 'date', '')::date;
  requested_start := nullif(booking_payload ->> 'start_minutes', '')::integer;
  requested_duration := nullif(booking_payload ->> 'duration_minutes', '')::integer;
  requested_end := coalesce(
    nullif(booking_payload ->> 'end_minutes', '')::integer,
    requested_start + requested_duration
  );
  normalized_price := greatest(coalesce(nullif(booking_payload ->> 'price', '')::numeric, 0), 0);
  normalized_travel_fee := greatest(coalesce(nullif(booking_payload ->> 'travel_fee', '')::numeric, 0), 0);
  normalized_congestion_fee := greatest(coalesce(nullif(booking_payload ->> 'congestion_fee', '')::numeric, 0), 0);

  if requested_date is null then
    raise exception 'Booking date is required.';
  end if;
  if requested_start is null or requested_start < 0 or requested_start >= 1440 then
    raise exception 'Booking start time is invalid.';
  end if;
  if requested_duration is null or requested_duration <= 0 then
    raise exception 'Booking duration must be greater than zero.';
  end if;
  if requested_end <= requested_start or requested_end > 2880 then
    raise exception 'Booking end time is invalid.';
  end if;
  if nullif(trim(booking_payload ->> 'client_name'), '') is null then
    raise exception 'Client name is required.';
  end if;
  if nullif(trim(booking_payload ->> 'client_email'), '') is null then
    raise exception 'Client email is required.';
  end if;
  if nullif(trim(coalesce(booking_payload ->> 'service', booking_payload ->> 'service_name')), '') is null then
    raise exception 'Service name is required.';
  end if;

  if auth.uid() is null then
    effective_user_id := null;
    if requested_user_id is not null or requested_saved_address_id is not null then
      raise exception 'Guest bookings cannot reference private client records.';
    end if;
  elsif public.current_user_is_booking_admin() then
    effective_user_id := requested_user_id;
  else
    effective_user_id := auth.uid();
    if requested_user_id is not null and requested_user_id <> auth.uid() then
      raise exception 'Cannot create a booking for another client.';
    end if;
  end if;

  if requested_saved_address_id is not null and not exists (
    select 1
    from public.client_addresses as saved_address
    where saved_address.id = requested_saved_address_id
      and (
        public.current_user_is_booking_admin()
        or saved_address.user_id = effective_user_id
      )
  ) then
    raise exception 'Saved address is not available to this client.';
  end if;

  if requested_order_id is not null and not exists (
    select 1
    from public.orders as existing_order
    where existing_order.id = requested_order_id
      and (
        public.current_user_is_booking_admin()
        or existing_order.user_id is not distinct from effective_user_id
      )
  ) then
    raise exception 'Order is not available to this client.';
  end if;

  -- Serializes competing inserts for the same date before checking overlap.
  perform pg_advisory_xact_lock(hashtext(requested_date::text));

  if exists (
    select 1
    from public.bookings as existing_booking
    where existing_booking.date = requested_date
      and existing_booking.status not in ('cancelled', 'refunded')
      and requested_start < coalesce(
        existing_booking.end_minutes,
        existing_booking.start_minutes + existing_booking.duration_minutes
      )
      and existing_booking.start_minutes < requested_end
  ) then
    raise exception 'Time slot is no longer available.' using errcode = '23P01';
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
    notes,
    selected_services,
    selected_durations
  )
  values (
    coalesce(nullif(booking_payload ->> 'id', '')::uuid, gen_random_uuid()),
    requested_order_id,
    effective_user_id,
    requested_saved_address_id,
    trim(booking_payload ->> 'client_name'),
    lower(trim(booking_payload ->> 'client_email')),
    nullif(trim(booking_payload ->> 'client_phone'), ''),
    nullif(trim(booking_payload ->> 'service_id'), ''),
    trim(coalesce(booking_payload ->> 'service', booking_payload ->> 'service_name')),
    nullif(trim(coalesce(booking_payload ->> 'service_name', booking_payload ->> 'service')), ''),
    requested_date,
    requested_start,
    requested_end,
    requested_duration,
    nullif(trim(booking_payload ->> 'address'), ''),
    nullif(upper(trim(booking_payload ->> 'postcode')), ''),
    nullif(trim(booking_payload ->> 'selected_area'), ''),
    normalized_price,
    normalized_travel_fee,
    normalized_congestion_fee,
    nullif(trim(booking_payload ->> 'payment_id'), ''),
    coalesce(nullif(trim(booking_payload ->> 'status'), ''), 'confirmed'),
    nullif(booking_payload ->> 'notes', ''),
    coalesce(booking_payload -> 'selected_services', '[]'::jsonb),
    coalesce(booking_payload -> 'selected_durations', '[]'::jsonb)
  )
  returning * into created_booking;

  return created_booking;
end;
$secure_booking$;

revoke all on function public.create_secure_order(jsonb) from public;
revoke all on function public.create_secure_booking(jsonb) from public;
grant execute on function public.create_secure_order(jsonb) to anon, authenticated;
grant execute on function public.create_secure_booking(jsonb) to anon, authenticated;
