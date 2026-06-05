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

create index if not exists booking_holds_date_expires_idx
on public.booking_holds (date, expires_at);

alter table public.booking_holds enable row level security;

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

grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;
grant execute on function public.create_booking_hold(date, integer, integer, integer) to anon, authenticated;
grant execute on function public.release_booking_hold(uuid, uuid) to anon, authenticated;
