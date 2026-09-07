import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../supabase/migrations/20260606170000_private_data_security_hardening.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8").toLowerCase();
const guestLinkMigrationUrl = new URL(
  "../../supabase/migrations/20260703120000_link_recent_guest_booking_to_client.sql",
  import.meta.url,
);
const guestLinkSql = readFileSync(guestLinkMigrationUrl, "utf8").toLowerCase();
const clientRescheduleMigrationUrl = new URL(
  "../../supabase/migrations/20260704120000_reschedule_client_booking.sql",
  import.meta.url,
);
const clientRescheduleSql = readFileSync(clientRescheduleMigrationUrl, "utf8").toLowerCase();
const cancellationHistoryMigrationUrl = new URL(
  "../../supabase/migrations/20260704130000_add_cancellation_history_fields.sql",
  import.meta.url,
);
const cancellationHistorySql = readFileSync(cancellationHistoryMigrationUrl, "utf8").toLowerCase();
const clientCancellationMigrationUrl = new URL(
  "../../supabase/migrations/20260704133000_cancel_client_booking.sql",
  import.meta.url,
);
const clientCancellationSql = readFileSync(clientCancellationMigrationUrl, "utf8").toLowerCase();
const recentCancellationMigrationUrl = new URL(
  "../../supabase/migrations/20260720130000_cancel_recent_booking_request.sql",
  import.meta.url,
);
const recentCancellationSql = readFileSync(recentCancellationMigrationUrl, "utf8").toLowerCase();
const bookingHoldMigrationUrl = new URL(
  "../../supabase/migrations/20260713120000_add_booking_hold_rpcs.sql",
  import.meta.url,
);
const bookingHoldSql = readFileSync(bookingHoldMigrationUrl, "utf8").toLowerCase();
const clientBookingLimitsMigrationUrl = new URL(
  "../../supabase/migrations/20260713130000_enforce_client_booking_limits.sql",
  import.meta.url,
);
const clientBookingLimitsSql = readFileSync(clientBookingLimitsMigrationUrl, "utf8").toLowerCase();
const secureBookingUpdateMigrationUrl = new URL(
  "../../supabase/migrations/20260713140000_harden_secure_booking_updates.sql",
  import.meta.url,
);
const secureBookingUpdateSql = readFileSync(secureBookingUpdateMigrationUrl, "utf8").toLowerCase();
const sessionPreferencesMigrationUrl = new URL(
  "../../supabase/migrations/20260713150000_create_session_preferences.sql",
  import.meta.url,
);
const sessionPreferencesSql = readFileSync(sessionPreferencesMigrationUrl, "utf8").toLowerCase();
const workingHoursOverridesMigrationUrl = new URL(
  "../../supabase/migrations/20260902120000_create_business_working_hours_overrides.sql",
  import.meta.url,
);
const workingHoursOverridesSql = readFileSync(workingHoursOverridesMigrationUrl, "utf8").toLowerCase();
const telegramLinksMigrationUrl = new URL(
  "../../supabase/migrations/20260731120000_link_telegram_chats_to_bookings.sql",
  import.meta.url,
);
const telegramLinksSql = readFileSync(telegramLinksMigrationUrl, "utf8").toLowerCase();
const publicAvailabilityMigrationUrl = new URL(
  "../../supabase/migrations/20260731140000_align_public_availability_with_holds.sql",
  import.meta.url,
);
const publicAvailabilitySql = readFileSync(publicAvailabilityMigrationUrl, "utf8").toLowerCase();
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
assert.match(sql, /create table if not exists public\.client_profiles/);
assert.match(sql, /create table if not exists public\.client_addresses/);
assert.match(sql, /create table if not exists public\.client_preferences/);
assert.match(sql, /add column if not exists saved_address_id uuid references public\.client_addresses/);
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

assert.match(guestLinkSql, /create or replace function public\.link_recent_guest_booking_to_client/);
assert.match(guestLinkSql, /security definer/);
assert.match(guestLinkSql, /auth\.uid\(\)/);
assert.match(guestLinkSql, /user_id is null/);
assert.match(guestLinkSql, /booking_reference_from_notes\(notes\) = requested_booking_reference/);
assert.match(guestLinkSql, /grant execute on function public\.link_recent_guest_booking_to_client\(jsonb\) to authenticated/);
assert.doesNotMatch(guestLinkSql, /\bclient_email\b/);
assert.doesNotMatch(guestLinkSql, /\bemail\b/);
assert.doesNotMatch(guestLinkSql, /to anon/);

assert.match(clientRescheduleSql, /create or replace function public\.reschedule_client_booking/);
assert.match(clientRescheduleSql, /reschedule_client_booking\(\s*booking_id uuid,\s*new_date date,\s*new_start_minutes integer\s*\)/);
assert.match(clientRescheduleSql, /security definer/);
assert.match(clientRescheduleSql, /auth\.uid\(\)/);
assert.match(clientRescheduleSql, /existing_booking\.user_id is distinct from current_user_id/);
assert.match(clientRescheduleSql, /existing_start_at <= \(\(now\(\) at time zone 'europe\/london'\) \+ interval '24 hours'\)/);
assert.match(clientRescheduleSql, /conflict_booking\.id <> booking_id/);
assert.match(clientRescheduleSql, /grant execute on function public\.reschedule_client_booking\(uuid, date, integer\) to authenticated/);
assert.doesNotMatch(clientRescheduleSql, /to anon/);
assert.doesNotMatch(clientRescheduleSql, /create policy .*client.*update.*bookings/);
assert.doesNotMatch(clientRescheduleSql, /set\s+notes\s*=/);
assert.doesNotMatch(clientRescheduleSql, /payment_status\s*=/);
assert.doesNotMatch(clientRescheduleSql, /payment_method\s*=/);
assert.doesNotMatch(clientRescheduleSql, /client_email\s*=/);
assert.doesNotMatch(clientRescheduleSql, /client_phone\s*=/);

assert.match(cancellationHistorySql, /alter table public\.bookings\s+add column if not exists cancelled_at timestamptz/);
assert.match(cancellationHistorySql, /alter table public\.bookings\s+add column if not exists cancelled_by text/);
assert.match(cancellationHistorySql, /alter table public\.bookings\s+add column if not exists cancellation_window text/);
assert.doesNotMatch(cancellationHistorySql, /cancelled_at timestamptz\s+not null/);
assert.doesNotMatch(cancellationHistorySql, /cancelled_by text\s+not null/);
assert.doesNotMatch(cancellationHistorySql, /cancellation_window text\s+not null/);
assert.match(cancellationHistorySql, /cancelled_by is null or cancelled_by in \('client', 'admin'\)/);
assert.match(cancellationHistorySql, /cancellation_window is null or cancellation_window in \('free', 'grace', 'late'\)/);
assert.doesNotMatch(cancellationHistorySql, /create policy .*client.*update.*bookings/);
assert.doesNotMatch(cancellationHistorySql, /grant update on (table )?public\.bookings to authenticated/);

assert.match(clientCancellationSql, /create or replace function public\.cancel_client_booking/);
assert.match(clientCancellationSql, /cancel_client_booking\(\s*booking_id uuid\s*\)/);
assert.match(clientCancellationSql, /security definer/);
assert.match(clientCancellationSql, /auth\.uid\(\)/);
assert.match(clientCancellationSql, /existing_booking\.user_id is distinct from current_user_id/);
assert.match(clientCancellationSql, /normalized_status in \('cancelled', 'canceled', 'expired', 'completed', 'refunded', 'no-show', 'no_show'\)/);
assert.match(clientCancellationSql, /existing_start_at <= \(now\(\) at time zone 'europe\/london'\)/);
assert.match(clientCancellationSql, /existing_booking\.created_at > \(now\(\) - interval '1 hour'\)/);
assert.match(clientCancellationSql, /set status = 'cancelled'/);
assert.match(clientCancellationSql, /cancelled_at = now\(\)/);
assert.match(clientCancellationSql, /cancelled_by = 'client'/);
assert.match(clientCancellationSql, /cancellation_window = calculated_cancellation_window/);
assert.match(clientCancellationSql, /grant execute on function public\.cancel_client_booking\(uuid\) to authenticated/);
assert.doesNotMatch(clientCancellationSql, /delete\s+from\s+public\.bookings/);
assert.doesNotMatch(clientCancellationSql, /to anon/);
assert.doesNotMatch(clientCancellationSql, /create policy .*client.*update.*bookings/);
assert.doesNotMatch(clientCancellationSql, /payment_status\s*=/);
assert.doesNotMatch(clientCancellationSql, /payment_method\s*=/);
assert.doesNotMatch(clientCancellationSql, /notes\s*=/);
assert.doesNotMatch(clientCancellationSql, /address\s*=/);
assert.doesNotMatch(clientCancellationSql, /client_email\s*=/);
assert.doesNotMatch(clientCancellationSql, /service_name\s*=/);
assert.doesNotMatch(clientCancellationSql, /duration_minutes\s*=/);

assert.match(recentCancellationSql, /create or replace function public\.cancel_recent_booking_request/);
assert.match(recentCancellationSql, /cancel_recent_booking_request\(\s*booking_id uuid,\s*booking_reference text\s*\)/);
assert.match(recentCancellationSql, /security definer/);
assert.match(recentCancellationSql, /normalized_reference not in/);
assert.match(recentCancellationSql, /existing_booking\.booking_reference/);
assert.match(recentCancellationSql, /existing_booking\.payment_reference/);
assert.match(recentCancellationSql, /existing_booking\.created_at <= now\(\) - interval '1 hour'/);
assert.match(recentCancellationSql, /existing_start_at <= \(now\(\) at time zone 'europe\/london'\)/);
assert.match(recentCancellationSql, /set status = 'cancelled'/);
assert.match(recentCancellationSql, /payment_status = 'cancelled'/);
assert.match(recentCancellationSql, /cancellation_window = 'grace'/);
assert.match(recentCancellationSql, /grant execute on function public\.cancel_recent_booking_request\(uuid, text\) to anon, authenticated/);
assert.doesNotMatch(recentCancellationSql, /grant update on (table )?public\.bookings to anon/);
assert.doesNotMatch(recentCancellationSql, /delete\s+from\s+public\.bookings/);
assert.doesNotMatch(recentCancellationSql, /client_email\s*=/);
assert.doesNotMatch(recentCancellationSql, /client_phone\s*=/);
assert.doesNotMatch(recentCancellationSql, /service_name\s*=/);

assert.match(bookingHoldSql, /alter table public\.booking_holds\s+add column if not exists client_key text/);
assert.match(bookingHoldSql, /alter table public\.booking_holds\s+add column if not exists released_at timestamptz/);
assert.match(bookingHoldSql, /create or replace function public\.create_booking_hold/);
assert.match(bookingHoldSql, /create or replace function public\.release_booking_hold/);
assert.match(bookingHoldSql, /create or replace function public\.cleanup_expired_booking_holds/);
assert.match(bookingHoldSql, /security definer/);
assert.match(bookingHoldSql, /set search_path = public, pg_temp/);
assert.match(bookingHoldSql, /hold_client_key text default null/);
assert.match(bookingHoldSql, /release_client_key text default null/);
assert.match(bookingHoldSql, /gen_random_uuid\(\)/);
assert.match(bookingHoldSql, /expires_at = now\(\) \+ interval '10 minutes'/);
assert.match(bookingHoldSql, /existing_hold\.client_key is distinct from normalized_client_key/);
assert.match(bookingHoldSql, /existing_hold\.expires_at > now\(\)/);
assert.match(bookingHoldSql, /existing_hold\.released_at is null/);
assert.match(bookingHoldSql, /grant execute on function public\.create_booking_hold\(date, integer, integer, integer, text\) to anon, authenticated/);
assert.match(bookingHoldSql, /grant execute on function public\.release_booking_hold\(uuid, uuid, text\) to anon, authenticated/);
assert.doesNotMatch(bookingHoldSql, /client_email/);
assert.doesNotMatch(bookingHoldSql, /client_name/);
assert.doesNotMatch(bookingHoldSql, /client_phone/);

assert.match(clientBookingLimitsSql, /create or replace function public\.create_secure_booking\(booking_payload jsonb\)/);
assert.match(clientBookingLimitsSql, /security definer/);
assert.match(clientBookingLimitsSql, /set search_path = public, pg_temp/);
assert.match(clientBookingLimitsSql, /auth\.uid\(\)/);
assert.match(clientBookingLimitsSql, /current_user_is_booking_admin/);
assert.match(clientBookingLimitsSql, /payment_status = 'paid'/);
assert.match(clientBookingLimitsSql, /status = 'completed'/);
assert.match(clientBookingLimitsSql, /london_today \+ 40/);
assert.match(clientBookingLimitsSql, /pg_advisory_xact_lock\(hashtext\('client-booking-limit:' \|\| identity_lock_key\)\)/);
assert.match(clientBookingLimitsSql, /requested_hold_id/);
assert.match(clientBookingLimitsSql, /requested_hold_token/);
assert.match(clientBookingLimitsSql, /requested_hold_client_key/);
assert.match(clientBookingLimitsSql, /released_at = now\(\)/);
assert.match(clientBookingLimitsSql, /grant execute on function public\.create_secure_booking\(jsonb\) to anon, authenticated/);
assert.doesNotMatch(clientBookingLimitsSql, /grant update on (table )?public\.bookings to anon/);
assert.doesNotMatch(clientBookingLimitsSql, /grant delete on (table )?public\.bookings to anon/);

assert.match(secureBookingUpdateSql, /create or replace function public\.update_secure_booking\(booking_payload jsonb\)/);
assert.match(secureBookingUpdateSql, /security definer/);
assert.match(secureBookingUpdateSql, /set search_path = public, pg_temp/);
assert.match(secureBookingUpdateSql, /current_user_is_booking_admin\(\)/);
assert.match(secureBookingUpdateSql, /raise exception 'only booking admins may update bookings\.'/);
assert.match(secureBookingUpdateSql, /payment_status = normalized_payment_status/);
assert.match(secureBookingUpdateSql, /cancelled_at = normalized_cancelled_at/);
assert.match(secureBookingUpdateSql, /cancelled_by = normalized_cancelled_by/);
assert.match(secureBookingUpdateSql, /cancellation_window = normalized_cancellation_window/);
assert.match(secureBookingUpdateSql, /normalized_payment_status not in/);
assert.match(secureBookingUpdateSql, /grant execute on function public\.update_secure_booking\(jsonb\) to authenticated/);
assert.doesNotMatch(secureBookingUpdateSql, /grant execute on function public\.update_secure_booking\(jsonb\) to anon/);
assert.doesNotMatch(secureBookingUpdateSql, /grant update on (table )?public\.bookings to anon/);
assert.doesNotMatch(secureBookingUpdateSql, /grant delete on (table )?public\.bookings to anon/);

assert.match(sessionPreferencesSql, /create table if not exists public\.session_preferences/);
assert.match(sessionPreferencesSql, /id uuid primary key/);
assert.match(sessionPreferencesSql, /is_visible boolean not null default true/);
assert.match(sessionPreferencesSql, /sort_order integer not null/);
assert.match(sessionPreferencesSql, /conflict_ids uuid\[\] not null default '\{\}'::uuid\[\]/);
assert.match(sessionPreferencesSql, /deleted_at timestamptz/);
assert.match(sessionPreferencesSql, /alter table public\.session_preferences enable row level security/);
assert.match(sessionPreferencesSql, /create policy "clients can read visible session preferences"/);
assert.match(sessionPreferencesSql, /using \(is_visible = true and deleted_at is null\)/);
assert.match(sessionPreferencesSql, /create policy "booking admins can create session preferences"/);
assert.match(sessionPreferencesSql, /create policy "booking admins can update session preferences"/);
assert.match(sessionPreferencesSql, /create policy "booking admins can delete session preferences"/);
assert.match(sessionPreferencesSql, /public\.current_user_is_booking_admin\(\)/);
assert.match(sessionPreferencesSql, /grant select on table public\.session_preferences to anon, authenticated/);
assert.doesNotMatch(sessionPreferencesSql, /grant insert.*to anon/);
assert.doesNotMatch(sessionPreferencesSql, /grant update.*to anon/);
assert.doesNotMatch(sessionPreferencesSql, /grant delete.*to anon/);
assert.equal((sessionPreferencesSql.match(/neck focus/g) ?? []).length, 1);
assert.match(sessionPreferencesSql, /on conflict \(id\) do nothing/);

assert.match(workingHoursOverridesSql, /create table if not exists public\.business_working_hours_overrides/);
assert.match(workingHoursOverridesSql, /override_date date primary key/);
assert.match(workingHoursOverridesSql, /settings jsonb not null/);
assert.match(workingHoursOverridesSql, /alter table public\.business_working_hours_overrides enable row level security/);
assert.match(workingHoursOverridesSql, /grant select on table public\.business_working_hours_overrides to anon, authenticated/);
assert.match(workingHoursOverridesSql, /grant insert, update, delete on table public\.business_working_hours_overrides to authenticated/);
assert.match(workingHoursOverridesSql, /public\.current_user_is_booking_admin\(\)/);
assert.match(workingHoursOverridesSql, /for delete/);
assert.doesNotMatch(workingHoursOverridesSql, /grant insert.*to anon/);
assert.doesNotMatch(workingHoursOverridesSql, /grant update.*to anon/);
assert.doesNotMatch(workingHoursOverridesSql, /grant delete.*to anon/);

assert.match(telegramLinksSql, /create table if not exists public\.client_telegram_links/);
assert.match(telegramLinksSql, /alter table public\.client_telegram_links enable row level security/);
assert.match(telegramLinksSql, /create policy "booking admins can read telegram links"/);
assert.match(telegramLinksSql, /public\.current_user_is_booking_admin\(\)/);
assert.match(telegramLinksSql, /create or replace function public\.link_telegram_chat_to_booking\(link_payload jsonb\)/);
assert.match(telegramLinksSql, /security definer/);
assert.match(telegramLinksSql, /set search_path = public, pg_temp/);
assert.match(telegramLinksSql, /booking_reference_from_notes\(notes\)/);
assert.match(telegramLinksSql, /grant execute on function public\.link_telegram_chat_to_booking\(jsonb\) to anon, authenticated/);
assert.doesNotMatch(telegramLinksSql, /grant insert on table public\.client_telegram_links to anon/);
assert.doesNotMatch(telegramLinksSql, /grant update on (table )?public\.bookings to anon/);

assert.match(publicAvailabilitySql, /create or replace function public\.get_public_booking_blocks\(start_date date, end_date date\)/);
assert.match(publicAvailabilitySql, /set search_path = public, pg_temp/);
assert.match(publicAvailabilitySql, /coalesce\(b\.status, ''\) not in \('cancelled', 'canceled', 'expired', 'rejected', 'refunded', 'completed', 'no-show', 'no_show'\)/);
assert.match(publicAvailabilitySql, /coalesce\(b\.payment_status, ''\) not in \('cancelled', 'canceled', 'expired', 'rejected', 'refunded'\)/);
assert.match(publicAvailabilitySql, /h\.released_at is null/);
assert.match(publicAvailabilitySql, /grant execute on function public\.get_public_booking_blocks\(date, date\) to anon, authenticated/);
assert.doesNotMatch(publicAvailabilitySql, /where b\.status = 'confirmed'/);

console.log("Security schema tests passed.");
