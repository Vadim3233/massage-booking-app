-- Durable admin-owned Enhancement settings.
--
-- Enhancement visibility, pricing and labels affect the public booking flow, so
-- browser localStorage must not be the production source of truth.

create table if not exists public.business_enhancement_catalogue (
  id boolean primary key default true check (id),
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.business_enhancements (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  price numeric(10, 2) not null default 0 check (price >= 0),
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.set_business_enhancements_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

revoke execute on function public.set_business_enhancements_updated_at() from public;

drop trigger if exists set_business_enhancements_updated_at on public.business_enhancements;
create trigger set_business_enhancements_updated_at
before update on public.business_enhancements
for each row
execute function public.set_business_enhancements_updated_at();

create or replace function public.set_business_enhancement_catalogue_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

revoke execute on function public.set_business_enhancement_catalogue_updated_at() from public;

drop trigger if exists set_business_enhancement_catalogue_updated_at on public.business_enhancement_catalogue;
create trigger set_business_enhancement_catalogue_updated_at
before update on public.business_enhancement_catalogue
for each row
execute function public.set_business_enhancement_catalogue_updated_at();

alter table public.business_enhancement_catalogue enable row level security;
alter table public.business_enhancements enable row level security;

revoke all on table public.business_enhancement_catalogue from anon;
revoke all on table public.business_enhancement_catalogue from authenticated;
revoke all on table public.business_enhancements from anon;
revoke all on table public.business_enhancements from authenticated;

grant select on table public.business_enhancement_catalogue to anon, authenticated;
grant select on table public.business_enhancements to anon, authenticated;

drop policy if exists "Clients can read enhancement catalogue state" on public.business_enhancement_catalogue;
drop policy if exists "Booking admins can read enhancement catalogue state" on public.business_enhancement_catalogue;
drop policy if exists "Clients can read active enhancements" on public.business_enhancements;
drop policy if exists "Booking admins can read all enhancements" on public.business_enhancements;

create policy "Clients can read enhancement catalogue state"
on public.business_enhancement_catalogue
for select
to anon, authenticated
using (true);

create policy "Clients can read active enhancements"
on public.business_enhancements
for select
to anon, authenticated
using (active = true);

create policy "Booking admins can read all enhancements"
on public.business_enhancements
for select
to authenticated
using (public.current_user_is_booking_admin());

create or replace function public.replace_business_enhancements(enhancements_payload jsonb)
returns setof public.business_enhancements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  next_index integer := 0;
  next_id text;
  next_name text;
begin
  if not public.current_user_is_booking_admin() then
    raise exception 'Only booking admins can update enhancements.'
      using errcode = '42501';
  end if;

  if enhancements_payload is null or jsonb_typeof(enhancements_payload) <> 'array' then
    raise exception 'Enhancement payload must be an array.'
      using errcode = '22023';
  end if;

  insert into public.business_enhancement_catalogue (id, initialized_at, updated_at, updated_by)
  values (true, now(), now(), auth.uid())
  on conflict (id) do update
  set updated_at = now(),
      updated_by = auth.uid();

  delete from public.business_enhancements;

  for item in select value from jsonb_array_elements(enhancements_payload)
  loop
    next_id := btrim(coalesce(item->>'id', ''));
    next_name := btrim(coalesce(item->>'name', ''));

    if next_id = '' or next_name = '' then
      raise exception 'Enhancement id and name are required.'
        using errcode = '22023';
    end if;

    insert into public.business_enhancements (
      id,
      name,
      description,
      price,
      duration_minutes,
      active,
      display_order,
      updated_by
    )
    values (
      next_id,
      next_name,
      btrim(coalesce(item->>'description', '')),
      greatest(0, coalesce(nullif(item->>'price', '')::numeric, 0)),
      greatest(0, coalesce(nullif(item->>'durationMinutes', '')::integer, 0)),
      coalesce((item->>'active')::boolean, true),
      next_index,
      auth.uid()
    );

    next_index := next_index + 1;
  end loop;

  return query
  select *
  from public.business_enhancements
  order by display_order, name;
end;
$$;

revoke execute on function public.replace_business_enhancements(jsonb) from public;
revoke execute on function public.replace_business_enhancements(jsonb) from anon;
grant execute on function public.replace_business_enhancements(jsonb) to authenticated;
