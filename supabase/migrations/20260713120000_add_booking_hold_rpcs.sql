-- Booking hold RPCs used by the client slot-selection flow.
-- Holds reserve a chosen time briefly without exposing client personal data.

alter table public.booking_holds
  add column if not exists client_key text;

alter table public.booking_holds
  add column if not exists released_at timestamptz;

create index if not exists booking_holds_client_key_active_idx
on public.booking_holds (client_key, expires_at)
where released_at is null;

create index if not exists booking_holds_active_slot_idx
on public.booking_holds (date, start_minutes, expires_at)
where released_at is null;

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
