-- No seeds: an admin explicitly reviews/imports their existing browser values.
create table public.business_service_area_catalogue (
  id boolean primary key default true check (id),
  updated_at timestamptz not null default now()
);
create table public.business_service_areas (
  id text primary key check (length(btrim(id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  active boolean not null default true,
  custom boolean not null default false,
  travel_fee numeric(10,2) not null check (travel_fee >= 0 and travel_fee <> 'NaN'::numeric),
  congestion_fee numeric(10,2) not null check (congestion_fee >= 0 and congestion_fee <> 'NaN'::numeric),
  display_order integer not null,
  updated_at timestamptz not null default now()
);
alter table public.business_service_area_catalogue enable row level security;
alter table public.business_service_areas enable row level security;
revoke all on public.business_service_area_catalogue, public.business_service_areas from anon, authenticated;
grant select on public.business_service_area_catalogue, public.business_service_areas to anon, authenticated;
create policy "Read area catalogue state" on public.business_service_area_catalogue for select to anon, authenticated using (true);
create policy "Read active service areas" on public.business_service_areas for select to anon, authenticated using (active);
create policy "Admins read all service areas" on public.business_service_areas for select to authenticated using (public.current_user_is_booking_admin());

create function public.replace_business_service_areas(areas_payload jsonb)
returns setof public.business_service_areas
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  item jsonb;
  position integer := 0;
begin
  if not coalesce(public.current_user_is_booking_admin(), false) then
    raise exception 'Only booking admins can update service areas.' using errcode = '42501';
  end if;
  if areas_payload is null or jsonb_typeof(areas_payload) <> 'array' then
    raise exception 'Service areas must be an array.' using errcode = '22023';
  end if;
  -- The singleton serializes catalogue replacements, including first initialization.
  insert into public.business_service_area_catalogue(id) values (true)
  on conflict (id) do update set updated_at = now();
  if exists (select 1 from jsonb_array_elements(areas_payload) as entry
    group by btrim(entry->>'id') having count(*) > 1) then
    raise exception 'Area identities must be unique.' using errcode = '22023';
  end if;
  delete from public.business_service_areas as existing
  where not exists (select 1 from jsonb_array_elements(areas_payload) as entry where btrim(entry->>'id') = existing.id);
  for item in select value from jsonb_array_elements(areas_payload) loop
    insert into public.business_service_areas(id, name, active, custom, travel_fee, congestion_fee, display_order)
    values (
      btrim(item->>'id'), btrim(item->>'name'),
      coalesce((item->>'active')::boolean, true),
      coalesce((item->>'custom')::boolean, false),
      (item->>'travelSurcharge')::numeric, (item->>'congestionFee')::numeric, position
    ) on conflict (id) do update set
      name = excluded.name, active = excluded.active, custom = excluded.custom,
      travel_fee = excluded.travel_fee, congestion_fee = excluded.congestion_fee,
      display_order = excluded.display_order, updated_at = now();
    position := position + 1;
  end loop;
  return query select * from public.business_service_areas order by display_order;
end;
$$;
revoke execute on function public.replace_business_service_areas(jsonb) from public, anon;
grant execute on function public.replace_business_service_areas(jsonb) to authenticated;
