-- Reconcile remaining production schema drift after the production-safety repair.
--
-- This is a narrow forward-only migration. It does not validate existing
-- NOT VALID constraints, modify migration history, or rewrite production data.

create table if not exists public.client_telegram_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  booking_reference text not null,
  client_email text,
  client_phone text,
  chat_id text not null,
  chat_type text,
  telegram_user_id text,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  is_active boolean not null default true,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.client_telegram_links enable row level security;

revoke all on table public.client_telegram_links from public;
revoke all on table public.client_telegram_links from anon;
revoke all on table public.client_telegram_links from authenticated;
grant select on table public.client_telegram_links to authenticated;

create unique index if not exists client_telegram_links_chat_id_unique
on public.client_telegram_links (chat_id);

create index if not exists client_telegram_links_booking_reference_idx
on public.client_telegram_links (upper(booking_reference));

create index if not exists client_telegram_links_client_email_idx
on public.client_telegram_links (lower(client_email));

create index if not exists client_telegram_links_client_phone_idx
on public.client_telegram_links (regexp_replace(coalesce(client_phone, ''), '\s+', '', 'g'));

drop policy if exists "Booking admins can read telegram links" on public.client_telegram_links;
create policy "Booking admins can read telegram links"
on public.client_telegram_links
for select
to authenticated
using (public.current_user_is_booking_admin());

do $reconcile_missing_functions$
begin
  if to_regprocedure('public.cancel_recent_booking_request(uuid, text)') is null then
    execute $create_cancel_recent_booking_request$
      create function public.cancel_recent_booking_request(
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
    $create_cancel_recent_booking_request$;
  end if;

  if to_regprocedure('public.link_telegram_chat_to_booking(jsonb)') is null then
    execute $create_link_telegram_chat_to_booking$
      create function public.link_telegram_chat_to_booking(link_payload jsonb)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $link_telegram_chat_to_booking$
      declare
        normalized_reference text := upper(nullif(trim(link_payload ->> 'booking_reference'), ''));
        normalized_chat_id text := nullif(trim(link_payload ->> 'chat_id'), '');
        matched_booking public.bookings%rowtype;
        linked_row public.client_telegram_links%rowtype;
      begin
        if link_payload is null or jsonb_typeof(link_payload) <> 'object' then
          raise exception 'Telegram link payload must be a JSON object.';
        end if;

        if normalized_reference is null then
          raise exception 'Booking reference is required.';
        end if;

        if normalized_chat_id is null then
          raise exception 'Telegram chat id is required.';
        end if;

        select *
          into matched_booking
        from public.bookings
        where upper(coalesce(booking_reference, '')) = normalized_reference
           or upper(coalesce(payment_reference, '')) = normalized_reference
           or upper(coalesce(public.booking_reference_from_notes(notes), '')) = normalized_reference
        order by created_at desc
        limit 1;

        if not found then
          raise exception 'Booking reference was not found.' using errcode = 'P0002';
        end if;

        insert into public.client_telegram_links (
          booking_id,
          booking_reference,
          client_email,
          client_phone,
          chat_id,
          chat_type,
          telegram_user_id,
          telegram_username,
          telegram_first_name,
          telegram_last_name,
          is_active,
          linked_at,
          last_seen_at
        )
        values (
          matched_booking.id,
          normalized_reference,
          nullif(trim(matched_booking.client_email), ''),
          nullif(trim(matched_booking.client_phone), ''),
          normalized_chat_id,
          nullif(trim(link_payload ->> 'chat_type'), ''),
          nullif(trim(link_payload ->> 'telegram_user_id'), ''),
          nullif(trim(link_payload ->> 'username'), ''),
          nullif(trim(link_payload ->> 'first_name'), ''),
          nullif(trim(link_payload ->> 'last_name'), ''),
          true,
          now(),
          now()
        )
        on conflict (chat_id)
        do update set
          booking_id = excluded.booking_id,
          booking_reference = excluded.booking_reference,
          client_email = excluded.client_email,
          client_phone = excluded.client_phone,
          chat_type = excluded.chat_type,
          telegram_user_id = excluded.telegram_user_id,
          telegram_username = excluded.telegram_username,
          telegram_first_name = excluded.telegram_first_name,
          telegram_last_name = excluded.telegram_last_name,
          is_active = true,
          last_seen_at = now()
        returning * into linked_row;

        return jsonb_build_object(
          'booking_id', linked_row.booking_id,
          'booking_reference', linked_row.booking_reference,
          'chat_id', linked_row.chat_id,
          'linked', true
        );
      end;
      $link_telegram_chat_to_booking$;
    $create_link_telegram_chat_to_booking$;
  end if;
end;
$reconcile_missing_functions$;

do $reconcile_public_availability$
declare
  availability_definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.get_public_booking_blocks(date, date)'))
    into availability_definition;

  if availability_definition is null
    or availability_definition not like '%from public.booking_holds%'
    or availability_definition not like '%public.booking_app_notes_json(b.notes)%'
  then
    execute $create_get_public_booking_blocks$
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
      set search_path = public, pg_temp
      stable
      as $get_public_booking_blocks$
        select
          b.id as booking_id,
          b.date,
          b.start_minutes,
          b.duration_minutes,
          coalesce(nullif(public.booking_app_notes_json(b.notes) #>> '{appBooking,travelBuffer}', '')::integer, 60) as buffer_minutes
        from public.bookings b
        where b.date between start_date and end_date
          and coalesce(b.status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded', 'completed', 'no-show', 'no_show')
          and coalesce(b.payment_status, '') not in ('cancelled', 'canceled', 'expired', 'rejected', 'refunded')
        union all
        select
          h.id as booking_id,
          h.date,
          h.start_minutes,
          h.duration_minutes,
          h.buffer_minutes
        from public.booking_holds h
        where h.date between start_date and end_date
          and h.expires_at > now()
          and h.released_at is null
        order by 2, 3;
      $get_public_booking_blocks$;
    $create_get_public_booking_blocks$;
  end if;
end;
$reconcile_public_availability$;

do $reconcile_function_permissions$
declare
  target_signature text;
begin
  foreach target_signature in array array[
    'public.cancel_client_booking(uuid)',
    'public.create_admin_personal_event(jsonb)',
    'public.current_user_is_booking_admin()',
    'public.update_secure_booking(jsonb)'
  ]
  loop
    if to_regprocedure(target_signature) is not null then
      execute format('revoke execute on function %s from anon', target_signature);
      execute format('revoke all on function %s from public', target_signature);
      execute format('grant execute on function %s to authenticated', target_signature);
    end if;
  end loop;
end;
$reconcile_function_permissions$;

revoke all on function public.cancel_recent_booking_request(uuid, text) from public;
grant execute on function public.cancel_recent_booking_request(uuid, text) to anon, authenticated;

revoke all on function public.link_telegram_chat_to_booking(jsonb) from public;
grant execute on function public.link_telegram_chat_to_booking(jsonb) to anon, authenticated;

revoke all on function public.get_public_booking_blocks(date, date) from public;
grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;
