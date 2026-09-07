-- Durable admin-owned date-specific Working Hours overrides.
--
-- One row means that exact calendar date no longer inherits the recurring
-- weekly schedule. No row means "use the weekly schedule".

create table if not exists public.business_working_hours_overrides (
  override_date date primary key,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.set_business_working_hours_overrides_updated_at()
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

revoke execute on function public.set_business_working_hours_overrides_updated_at() from public;

drop trigger if exists set_business_working_hours_overrides_updated_at on public.business_working_hours_overrides;
create trigger set_business_working_hours_overrides_updated_at
before update on public.business_working_hours_overrides
for each row
execute function public.set_business_working_hours_overrides_updated_at();

alter table public.business_working_hours_overrides enable row level security;

revoke all on table public.business_working_hours_overrides from anon;
revoke all on table public.business_working_hours_overrides from authenticated;
grant select on table public.business_working_hours_overrides to anon, authenticated;
grant insert, update, delete on table public.business_working_hours_overrides to authenticated;

drop policy if exists "Clients can read business working hours overrides" on public.business_working_hours_overrides;
drop policy if exists "Booking admins can create business working hours overrides" on public.business_working_hours_overrides;
drop policy if exists "Booking admins can update business working hours overrides" on public.business_working_hours_overrides;
drop policy if exists "Booking admins can delete business working hours overrides" on public.business_working_hours_overrides;

create policy "Clients can read business working hours overrides"
on public.business_working_hours_overrides
for select
to anon, authenticated
using (true);

create policy "Booking admins can create business working hours overrides"
on public.business_working_hours_overrides
for insert
to authenticated
with check (public.current_user_is_booking_admin());

create policy "Booking admins can update business working hours overrides"
on public.business_working_hours_overrides
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete business working hours overrides"
on public.business_working_hours_overrides
for delete
to authenticated
using (public.current_user_is_booking_admin());
