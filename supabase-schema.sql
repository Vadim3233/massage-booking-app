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

alter table public.bookings add column if not exists order_id uuid;
alter table public.bookings add column if not exists service_id text;
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists end_minutes integer;
alter table public.bookings add column if not exists selected_area text;
alter table public.bookings add column if not exists price numeric(10,2) not null default 0;
alter table public.bookings add column if not exists travel_fee numeric(10,2) not null default 0;
alter table public.bookings add column if not exists congestion_fee numeric(10,2) not null default 0;
alter table public.bookings add column if not exists payment_id text;

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

create table if not exists public.selected_working_zones (
  id text primary key,
  zone_name text not null,
  sub_zone_name text not null,
  polygon_geojson jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_holds_date_expires_idx
on public.booking_holds (date, expires_at);

alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.admin_users enable row level security;
alter table public.booking_holds enable row level security;
alter table public.selected_working_zones enable row level security;

insert into public.admin_users (email)
values ('uk.london.vadim@gmail.com')
on conflict (email) do nothing;

create or replace function public.current_user_is_booking_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

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
set search_path = public
stable
as $$
  select
    b.id as booking_id,
    b.date,
    b.start_minutes,
    b.duration_minutes,
    coalesce(nullif(b.notes::jsonb #>> '{appBooking,travelBuffer}', '')::integer, 60) as buffer_minutes
  from public.bookings b
  where b.status = 'confirmed'
    and b.date between start_date and end_date
  union all
  select
    h.id as booking_id,
    h.date,
    h.start_minutes,
    h.duration_minutes,
    h.buffer_minutes
  from public.booking_holds h
  where h.expires_at > now()
    and h.date between start_date and end_date
  order by 2, 3;
$$;

create or replace function public.create_booking_hold(
  hold_date date,
  hold_start_minutes integer,
  hold_duration_minutes integer,
  hold_buffer_minutes integer
)
returns table (
  hold_id uuid,
  hold_token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  hold_end integer := hold_start_minutes + hold_duration_minutes + hold_buffer_minutes;
begin
  delete from public.booking_holds as expired_holds
  where expired_holds.expires_at <= now();

  if exists (
    select 1
    from public.bookings b
    where b.status = 'confirmed'
      and b.date = hold_date
      and hold_start_minutes < b.start_minutes + b.duration_minutes + coalesce(nullif(b.notes::jsonb #>> '{appBooking,travelBuffer}', '')::integer, 60)
      and b.start_minutes < hold_end
  ) or exists (
    select 1
    from public.booking_holds h
    where h.expires_at > now()
      and h.date = hold_date
      and hold_start_minutes < h.start_minutes + h.duration_minutes + h.buffer_minutes
      and h.start_minutes < hold_end
  ) then
    raise exception 'Time slot is no longer available.';
  end if;

  return query
  insert into public.booking_holds (
    date,
    start_minutes,
    duration_minutes,
    buffer_minutes,
    expires_at
  )
  values (
    hold_date,
    hold_start_minutes,
    hold_duration_minutes,
    hold_buffer_minutes,
    now() + interval '10 minutes'
  )
  returning booking_holds.id, booking_holds.hold_token, booking_holds.expires_at;
end;
$$;

create or replace function public.release_booking_hold(
  release_hold_id uuid,
  release_hold_token uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.booking_holds
  where id = release_hold_id
    and hold_token = release_hold_token;
$$;

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
drop policy if exists "Authenticated users can create bookings" on public.bookings;
drop policy if exists "Booking admins can read bookings" on public.bookings;
drop policy if exists "Booking admins can update bookings" on public.bookings;
drop policy if exists "Booking admins can delete bookings" on public.bookings;
drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Booking admins can read orders" on public.orders;
drop policy if exists "Booking admins can update orders" on public.orders;
drop policy if exists "Booking admins can read admin users" on public.admin_users;
drop policy if exists "Booking admins can read booking holds" on public.booking_holds;
drop policy if exists "Public can read working zones" on public.selected_working_zones;
drop policy if exists "Booking admins can insert working zones" on public.selected_working_zones;
drop policy if exists "Booking admins can update working zones" on public.selected_working_zones;
drop policy if exists "Booking admins can delete working zones" on public.selected_working_zones;

create policy "Public can create bookings"
on public.bookings
for insert
to anon
with check (true);

create policy "Public can create orders"
on public.orders
for insert
to anon
with check (true);

create policy "Authenticated users can create bookings"
on public.bookings
for insert
to authenticated
with check (true);

create policy "Booking admins can read bookings"
on public.bookings
for select
to authenticated
using (public.current_user_is_booking_admin());

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

create policy "Booking admins can read orders"
on public.orders
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can update orders"
on public.orders
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can read booking holds"
on public.booking_holds
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Public can read working zones"
on public.selected_working_zones
for select
to anon, authenticated
using (true);

create policy "Booking admins can insert working zones"
on public.selected_working_zones
for insert
to authenticated
with check (public.current_user_is_booking_admin());

create policy "Booking admins can update working zones"
on public.selected_working_zones
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete working zones"
on public.selected_working_zones
for delete
to authenticated
using (public.current_user_is_booking_admin());

grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;
grant execute on function public.create_booking_hold(date, integer, integer, integer) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid) to anon, authenticated;
