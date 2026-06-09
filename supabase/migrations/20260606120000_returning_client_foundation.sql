-- Returning-client data foundation.
-- This migration is additive: existing guest bookings remain valid because all
-- new booking/order relationship columns are nullable.

create extension if not exists pgcrypto;

-- Keeps updated_at values consistent across client-owned records.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
comment on column public.client_profiles.user_id is
  'Supabase Auth user id. This is also the profile primary key.';

-- A returning client can keep several reusable treatment addresses.
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
  'Private saved addresses for returning clients. These are never public.';
comment on column public.client_addresses.is_default is
  'Marks the address suggested first for a future returning-client booking.';

-- Prevent more than one default address for the same client.
create unique index if not exists client_addresses_one_default_per_user_idx
on public.client_addresses (user_id)
where is_default;

-- Stores the client defaults needed by a future Book Again workflow.
create table if not exists public.client_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_service_ids jsonb not null default '[]'::jsonb,
  preferred_durations jsonb not null default '{}'::jsonb,
  preferred_address_id uuid references public.client_addresses(id) on delete set null,
  usual_area text,
  usual_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_preferences_service_ids_are_json_array
    check (jsonb_typeof(preferred_service_ids) = 'array'),
  constraint client_preferences_durations_are_json_object
    check (jsonb_typeof(preferred_durations) = 'object')
);

comment on table public.client_preferences is
  'Private defaults for future returning-client and Book Again flows.';
comment on column public.client_preferences.preferred_service_ids is
  'JSON array of selected service ids in the client preferred order.';
comment on column public.client_preferences.preferred_durations is
  'JSON object mapping service ids to preferred duration minutes.';

-- Ensure a preferred saved address always belongs to the same client.
create or replace function public.validate_client_preferred_address()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.preferred_address_id is not null and not exists (
    select 1
    from public.client_addresses address
    where address.id = new.preferred_address_id
      and address.user_id = new.user_id
  ) then
    raise exception 'Preferred address must belong to the same client.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_client_preferred_address on public.client_preferences;
create trigger validate_client_preferred_address
before insert or update of user_id, preferred_address_id on public.client_preferences
for each row execute function public.validate_client_preferred_address();

-- Link future orders and bookings to authenticated clients without changing
-- the existing guest email/phone fields or requiring login.
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.bookings
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists saved_address_id uuid references public.client_addresses(id) on delete set null,
  add column if not exists selected_services jsonb not null default '[]'::jsonb,
  add column if not exists selected_durations jsonb not null default '[]'::jsonb;

comment on column public.bookings.user_id is
  'Authenticated client id when logged in; NULL for guest bookings.';
comment on column public.bookings.saved_address_id is
  'Optional saved address used by a logged-in client; NULL for guest or one-off addresses.';
comment on column public.bookings.selected_services is
  'Snapshot of selected treatments/enhancements so booking history remains stable.';
comment on column public.bookings.selected_durations is
  'Snapshot of service duration selections for future repeat-booking support.';

-- Lookup indexes for profiles, addresses, and booking history.
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

-- Apply updated_at automatically.
drop trigger if exists set_client_profiles_updated_at on public.client_profiles;
create trigger set_client_profiles_updated_at
before update on public.client_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_client_addresses_updated_at on public.client_addresses;
create trigger set_client_addresses_updated_at
before update on public.client_addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_client_preferences_updated_at on public.client_preferences;
create trigger set_client_preferences_updated_at
before update on public.client_preferences
for each row execute function public.set_updated_at();

-- Private tables are protected now, even before a client login UI exists.
alter table public.client_profiles enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_preferences enable row level security;

-- Admins can support clients; authenticated clients can only access their own rows.
drop policy if exists "Clients can read own profile" on public.client_profiles;
create policy "Clients can read own profile"
on public.client_profiles for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can create own profile" on public.client_profiles;
create policy "Clients can create own profile"
on public.client_profiles for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can update own profile" on public.client_profiles;
create policy "Clients can update own profile"
on public.client_profiles for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can delete own profile" on public.client_profiles;
create policy "Clients can delete own profile"
on public.client_profiles for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can read own addresses" on public.client_addresses;
create policy "Clients can read own addresses"
on public.client_addresses for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can create own addresses" on public.client_addresses;
create policy "Clients can create own addresses"
on public.client_addresses for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can update own addresses" on public.client_addresses;
create policy "Clients can update own addresses"
on public.client_addresses for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can delete own addresses" on public.client_addresses;
create policy "Clients can delete own addresses"
on public.client_addresses for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can read own preferences" on public.client_preferences;
create policy "Clients can read own preferences"
on public.client_preferences for select to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can create own preferences" on public.client_preferences;
create policy "Clients can create own preferences"
on public.client_preferences for insert to authenticated
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can update own preferences" on public.client_preferences;
create policy "Clients can update own preferences"
on public.client_preferences for update to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin())
with check (user_id = auth.uid() or public.current_user_is_booking_admin());

drop policy if exists "Clients can delete own preferences" on public.client_preferences;
create policy "Clients can delete own preferences"
on public.client_preferences for delete to authenticated
using (user_id = auth.uid() or public.current_user_is_booking_admin());

-- A future signed-in client can read their own booking/order history.
drop policy if exists "Clients can read own bookings" on public.bookings;
create policy "Clients can read own bookings"
on public.bookings for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Clients can read own orders" on public.orders;
create policy "Clients can read own orders"
on public.orders for select to authenticated
using (user_id = auth.uid());

-- Preserve guest booking while preventing anonymous callers from attaching
-- themselves to a private profile or saved address.
drop policy if exists "Public can create bookings" on public.bookings;
create policy "Public can create bookings"
on public.bookings for insert to anon
with check (user_id is null and saved_address_id is null);

drop policy if exists "Authenticated users can create bookings" on public.bookings;
create policy "Authenticated users can create bookings"
on public.bookings for insert to authenticated
with check (
  (
    user_id is null
    or user_id = auth.uid()
    or public.current_user_is_booking_admin()
  )
  and (
    saved_address_id is null
    or public.current_user_is_booking_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.client_addresses address
        where address.id = saved_address_id
          and address.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Public can create orders" on public.orders;
create policy "Public can create orders"
on public.orders for insert to anon
with check (user_id is null);

drop policy if exists "Authenticated users can create orders" on public.orders;
create policy "Authenticated users can create orders"
on public.orders for insert to authenticated
with check (
  user_id is null
  or user_id = auth.uid()
  or public.current_user_is_booking_admin()
);
