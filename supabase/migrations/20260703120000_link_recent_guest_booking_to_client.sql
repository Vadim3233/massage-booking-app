-- Allow a newly signed-in client to attach only the guest booking they just made.
-- This intentionally does not match historical guest bookings by contact details.

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
