import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../supabase/migrations/20260606170000_private_data_security_hardening.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8").toLowerCase();
const dollarQuoteCount = (sql.match(/\$\$/g) ?? []).length;

const privateTables = [
  "client_profiles",
  "client_addresses",
  "client_preferences",
  "bookings",
  "orders",
  "booking_holds",
];

privateTables.forEach((table) => {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
});

const profilesCreatePosition = sql.indexOf("create table if not exists public.client_profiles");
const profilesRlsPosition = sql.indexOf("alter table public.client_profiles enable row level security");
const addressesCreatePosition = sql.indexOf("create table if not exists public.client_addresses");
const addressesRlsPosition = sql.indexOf("alter table public.client_addresses enable row level security");
const preferencesCreatePosition = sql.indexOf("create table if not exists public.client_preferences");
const preferencesRlsPosition = sql.indexOf("alter table public.client_preferences enable row level security");

assert.ok(profilesCreatePosition >= 0 && profilesCreatePosition < profilesRlsPosition);
assert.ok(addressesCreatePosition >= 0 && addressesCreatePosition < addressesRlsPosition);
assert.ok(preferencesCreatePosition >= 0 && preferencesCreatePosition < preferencesRlsPosition);
assert.equal(dollarQuoteCount % 2, 0, "SQL dollar quotes must be balanced");
assert.match(sql, /add column if not exists user_id uuid references auth\.users/);
assert.doesNotMatch(sql, /\bdo\s+\$\$/);
assert.doesNotMatch(
  sql,
  /(?:^|;)\s*add column\b/m,
  "Every ADD COLUMN must include its own ALTER TABLE statement",
);
assert.match(sql, /drop constraint if exists client_preferences_last_booking_id_fkey/);
assert.match(sql, /add constraint client_preferences_last_booking_id_fkey/);
assert.equal(
  (sql.match(/client_preferences_last_booking_id_fkey/g) ?? []).length,
  2,
  "The last-booking foreign key should have one drop and one add statement",
);
assert.match(sql, /create policy "clients can read own profile"/);
assert.match(sql, /create policy "clients can read own addresses"/);
assert.match(sql, /create policy "clients can read own preferences"/);
assert.match(sql, /create or replace function public\.create_secure_booking/);
assert.match(sql, /create or replace function public\.create_secure_order/);
assert.match(sql, /awaiting_verification/);
assert.match(sql, /alternative_requested/);
assert.match(sql, /create or replace function public\.update_secure_booking/);
assert.match(sql, /security definer/);
assert.match(sql, /auth\.uid\(\)/);
assert.match(sql, /current_user_is_booking_admin/);
assert.match(sql, /drop policy if exists "public can create bookings"/);
assert.match(sql, /drop policy if exists "authenticated users can create bookings"/);
assert.doesNotMatch(sql, /grant select on public\.bookings to anon/);
assert.doesNotMatch(sql, /grant update on public\.bookings to anon/);
assert.doesNotMatch(sql, /grant delete on public\.bookings to anon/);

console.log("Security schema tests passed.");
