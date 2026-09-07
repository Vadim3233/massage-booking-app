-- Admin-managed client session preferences.
--
-- Preferences shown in the client booking Review step must be shared across
-- browsers/devices, so the database is the production source of truth.

create extension if not exists pgcrypto;

create table if not exists public.session_preferences (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) > 0),
  category text,
  is_visible boolean not null default true,
  sort_order integer not null check (sort_order > 0),
  conflict_ids uuid[] not null default '{}'::uuid[],
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists session_preferences_sort_order_active_idx
on public.session_preferences (sort_order)
where deleted_at is null;

create index if not exists session_preferences_visible_sort_idx
on public.session_preferences (sort_order, id)
where is_visible = true and deleted_at is null;

create or replace function public.set_session_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_session_preferences_updated_at on public.session_preferences;
create trigger set_session_preferences_updated_at
before update on public.session_preferences
for each row
execute function public.set_session_preferences_updated_at();

alter table public.session_preferences enable row level security;

revoke all on table public.session_preferences from anon;
revoke all on table public.session_preferences from authenticated;
grant select on table public.session_preferences to anon, authenticated;
grant insert, update, delete on table public.session_preferences to authenticated;

drop policy if exists "Clients can read visible session preferences" on public.session_preferences;
drop policy if exists "Booking admins can read all session preferences" on public.session_preferences;
drop policy if exists "Booking admins can create session preferences" on public.session_preferences;
drop policy if exists "Booking admins can update session preferences" on public.session_preferences;
drop policy if exists "Booking admins can delete session preferences" on public.session_preferences;

create policy "Clients can read visible session preferences"
on public.session_preferences
for select
to anon, authenticated
using (is_visible = true and deleted_at is null);

create policy "Booking admins can read all session preferences"
on public.session_preferences
for select
to authenticated
using (public.current_user_is_booking_admin());

create policy "Booking admins can create session preferences"
on public.session_preferences
for insert
to authenticated
with check (public.current_user_is_booking_admin());

create policy "Booking admins can update session preferences"
on public.session_preferences
for update
to authenticated
using (public.current_user_is_booking_admin())
with check (public.current_user_is_booking_admin());

create policy "Booking admins can delete session preferences"
on public.session_preferences
for delete
to authenticated
using (public.current_user_is_booking_admin());

insert into public.session_preferences (id, label, category, is_visible, sort_order, conflict_ids)
values
  ('11111111-1111-4111-8111-111111111111', 'Neck focus', 'Focus area', true, 1, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111112', 'Shoulder focus', 'Focus area', true, 2, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111113', 'Lower-back focus', 'Focus area', true, 3, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111114', 'Calf focus', 'Focus area', true, 4, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111115', 'Foot focus', 'Focus area', true, 5, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111116', 'Stronger shoulders', 'Pressure', true, 6, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111117', 'Stronger back', 'Pressure', true, 7, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111118', 'Lighter calves', 'Pressure', true, 8, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111119', 'Lighter pressure', 'Pressure', true, 9, array['11111111-1111-4111-8111-111111111120']::uuid[]),
  ('11111111-1111-4111-8111-111111111120', 'Firm pressure', 'Pressure', true, 10, array['11111111-1111-4111-8111-111111111119']::uuid[]),
  ('11111111-1111-4111-8111-111111111121', 'Head massage', 'Include', true, 11, array['11111111-1111-4111-8111-111111111128']::uuid[]),
  ('11111111-1111-4111-8111-111111111122', 'Foot massage', 'Include', true, 12, array['11111111-1111-4111-8111-111111111127']::uuid[]),
  ('11111111-1111-4111-8111-111111111123', 'Hand massage', 'Include', true, 13, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111124', 'Jaw massage', 'Include', true, 14, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111125', 'Face and ears', 'Include', true, 15, '{}'::uuid[]),
  ('11111111-1111-4111-8111-111111111126', 'Abdomen massage', 'Include', true, 16, array['11111111-1111-4111-8111-111111111129']::uuid[]),
  ('11111111-1111-4111-8111-111111111127', 'Avoid feet', 'Avoid', true, 17, array['11111111-1111-4111-8111-111111111122']::uuid[]),
  ('11111111-1111-4111-8111-111111111128', 'Avoid head', 'Avoid', true, 18, array['11111111-1111-4111-8111-111111111121']::uuid[]),
  ('11111111-1111-4111-8111-111111111129', 'Avoid abdomen', 'Avoid', true, 19, array['11111111-1111-4111-8111-111111111126']::uuid[]),
  ('11111111-1111-4111-8111-111111111130', 'Avoid sensitive areas', 'Avoid', true, 20, '{}'::uuid[])
on conflict (id) do nothing;
