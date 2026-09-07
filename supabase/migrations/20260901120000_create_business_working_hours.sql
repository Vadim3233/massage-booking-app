-- Durable admin-owned Working Hours.
--
-- The weekly working schedule controls real client availability, so browser
-- localStorage must not be the production source of truth.

create table if not exists public.business_working_hours (
  id boolean primary key default true check (id),
  schedule jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.set_business_working_hours_updated_at()
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

drop trigger if exists set_business_working_hours_updated_at on public.business_working_hours;
create trigger set_business_working_hours_updated_at
before update on public.business_working_hours
for each row
execute function public.set_business_working_hours_updated_at();

alter table public.business_working_hours enable row level security;

revoke all on table public.business_working_hours from anon;
revoke all on table public.business_working_hours from authenticated;
grant select on table public.business_working_hours to anon, authenticated;
grant insert, update on table public.business_working_hours to authenticated;

drop policy if exists "Clients can read business working hours" on public.business_working_hours;
drop policy if exists "Booking admins can create business working hours" on public.business_working_hours;
drop policy if exists "Booking admins can update business working hours" on public.business_working_hours;

create policy "Clients can read business working hours"
on public.business_working_hours
for select
to anon, authenticated
using (true);

create policy "Booking admins can create business working hours"
on public.business_working_hours
for insert
to authenticated
with check (public.current_user_is_booking_admin());

create policy "Booking admins can update business working hours"
on public.business_working_hours
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());
