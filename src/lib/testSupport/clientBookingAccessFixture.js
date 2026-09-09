import { readFile } from "node:fs/promises";
import { fixtureSql, migrationSql as stage1Sql } from "./clientAccessFixture.js";

const readMigration = (name) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
export const stage2Sql = await readMigration("20260907130000_enforce_client_booking_access.sql");
const selfRegistrationSql = await readMigration("20260908140000_enable_client_self_registration.sql");
const reconciled = await readMigration("20260718120000_reconcile_live_production_schema.sql");
const repaired = await readMigration("20260804120000_production_safety_repair.sql");
const recentCancel = await readMigration("20260720130000_cancel_recent_booking_request.sql");

function definition(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const body = source.slice(start);
  const delimiter = body.match(/\bas (\$[a-z_]*\$)/i)?.[1];
  if (!delimiter) throw new Error(`Missing body ${name}`);
  const opening = body.indexOf(delimiter);
  const closing = body.indexOf(`${delimiter};`, opening + delimiter.length);
  if (closing < 0) throw new Error(`Unclosed body ${name}`);
  return body.slice(0, closing + delimiter.length + 1);
}

export const businessDefinitions = [
  ...["cleanup_expired_booking_holds", "create_booking_hold", "release_booking_hold", "create_secure_booking", "cancel_client_booking", "create_admin_personal_event", "update_secure_booking"].map((name) => definition(reconciled, name)),
  ...["booking_app_notes_json", "booking_reference_from_notes", "create_secure_order", "reschedule_client_booking", "link_recent_guest_booking_to_client", "get_public_booking_blocks"].map((name) => definition(repaired, name)),
  definition(recentCancel, "cancel_recent_booking_request"),
].join("\n");

export const bookingFixtureSql = `${fixtureSql()}
  drop function public.create_secure_booking(jsonb);
  drop function public.create_secure_order(jsonb);
  drop function public.create_booking_hold(date,integer,integer,integer,text);
  create table public.orders (
    id uuid primary key default gen_random_uuid(), user_id uuid, client_id uuid,
    client_name text, client_email text, payment_provider text, payment_id text,
    payment_status text default 'pending', total_amount numeric default 0, created_at timestamptz default now()
  );
  create table public.client_addresses (id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table public.bookings (
    id uuid primary key default gen_random_uuid(), order_id uuid, user_id uuid, saved_address_id uuid,
    client_name text not null, client_email text not null, client_phone text, service_id text, service text, service_name text,
    date date not null, start_minutes integer not null, end_minutes integer, duration_minutes integer not null,
    address text, postcode text, selected_area text, price numeric, travel_fee numeric, congestion_fee numeric,
    payment_id text, payment_status text, payment_method text, status text default 'confirmed', notes text,
    selected_services jsonb default '[]', selected_durations jsonb default '[]',
    booking_reference text, payment_reference text, cancelled_at timestamptz, cancelled_by text, cancellation_window text,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table public.booking_holds (
    id uuid primary key default gen_random_uuid(), hold_token uuid default gen_random_uuid(), client_key text,
    date date not null, start_minutes integer not null, duration_minutes integer not null, buffer_minutes integer default 60,
    expires_at timestamptz default now()+interval '10 minutes', created_at timestamptz default now(), released_at timestamptz
  );
  ${businessDefinitions}
  alter table public.bookings enable row level security;
  alter table public.orders enable row level security;
  alter table public.booking_holds enable row level security;
  grant select,update,delete on public.bookings to authenticated;
  grant select,update on public.orders to authenticated;
  grant select on public.booking_holds to authenticated;
  ${reconciled.slice(reconciled.indexOf('create policy "Clients and admins can read permitted bookings"'), reconciled.indexOf('create policy "Booking admins can read admin users"'))}
  -- Deliberately callable old overloads and column grants simulate incomplete historical cleanup.
  create function public.create_booking_hold(date,integer,integer,integer) returns boolean language sql as $$select true$$;
  create function public.release_booking_hold(uuid,uuid) returns boolean language sql as $$select true$$;
  create function public.create_secure_booking(text) returns boolean language sql as $$select true$$;
  create function public.create_secure_order(text) returns boolean language sql as $$select true$$;
  grant execute on all functions in schema public to anon, authenticated;
  grant insert (client_name) on public.bookings to anon, authenticated;
  grant insert on public.orders, public.booking_holds to anon, authenticated;
  ${stage1Sql}
  ${selfRegistrationSql}
`;
