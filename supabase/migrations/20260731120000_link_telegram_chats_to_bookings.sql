-- Links Telegram chats to booking references after a client opens the bot with
-- /start <booking-reference>. The table remains private; the public webhook can
-- only write through the narrow security-definer RPC below.

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

create or replace function public.link_telegram_chat_to_booking(link_payload jsonb)
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

revoke all on function public.link_telegram_chat_to_booking(jsonb) from public;
grant execute on function public.link_telegram_chat_to_booking(jsonb) to anon, authenticated;
