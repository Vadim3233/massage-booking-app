import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const AUDIT_SQL_PATH = "supabase/verification/20260806_final_schema_and_migration_reconciliation_audit.sql";

async function createAuditCatalogue({ omitExpectedFunction = false } = {}) {
  const db = new PGlite();

  await db.exec(`
    create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    insert into supabase_migrations.schema_migrations(version) values
      ('20260804120000'), ('20260804123000'), ('20260804124500');

    create role anon;
    create role authenticated;

    create table public.bookings(id uuid, date date, start_minutes integer, duration_minutes integer, end_minutes integer, notes text, status text, payment_status text, user_id uuid);
    create table public.orders(id uuid, payment_id text);
    create table public.booking_holds(id uuid, date date, start_minutes integer, duration_minutes integer, buffer_minutes integer, expires_at timestamptz, released_at timestamptz);
    create table public.client_profiles(id uuid);
    create table public.client_addresses(id uuid);
    create table public.client_preferences(id uuid);
    create table public.client_telegram_links(id uuid);
  `);

  const functions = [
    ["public.current_user_is_booking_admin()", "boolean", "", "select true", false, "public", ["authenticated"]],
    ["public.booking_app_notes_json(booking_notes text)", "jsonb", "text", "select '{}'::jsonb", false, "public, pg_temp", []],
    ["public.booking_reference_from_notes(booking_notes text)", "text", "text", "select null::text", false, "public, pg_temp", []],
    ["public.get_public_booking_blocks(start_date date, end_date date)", "table(booking_id uuid, date date, start_minutes integer, duration_minutes integer, buffer_minutes integer)", "date, date", "select null::uuid, start_date, 0, 60, 60 where false", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.create_booking_hold(hold_date date, hold_start_minutes integer, hold_duration_minutes integer, hold_buffer_minutes integer, hold_client_key text)", "table(hold_id uuid, hold_token uuid, expires_at timestamptz)", "date, integer, integer, integer, text", "select null::uuid, null::uuid, now()", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.release_booking_hold(release_hold_id uuid, release_hold_token uuid, release_client_key text)", "table(released boolean)", "uuid, uuid, text", "select true", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.create_secure_order(order_payload jsonb)", "public.orders", "jsonb", "select * from public.orders limit 1", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.reschedule_client_booking(booking_id uuid, new_date date, new_start_minutes integer)", "public.bookings", "uuid, date, integer", "select * from public.bookings limit 1", true, "public, pg_temp", ["authenticated"]],
    ["public.link_recent_guest_booking_to_client(link_payload jsonb)", "uuid[]", "jsonb", "select array[]::uuid[]", true, "public, pg_temp", ["authenticated"]],
    ["public.cancel_client_booking(booking_id uuid)", "public.bookings", "uuid", "select * from public.bookings limit 1", true, "public", ["authenticated"]],
    ["public.cancel_recent_booking_request(booking_id uuid, booking_reference text)", "public.bookings", "uuid, text", "select * from public.bookings limit 1", true, "public", ["anon", "authenticated"]],
    ["public.create_secure_booking(booking_payload jsonb)", "public.bookings", "jsonb", "select * from public.bookings limit 1", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.update_secure_booking(booking_payload jsonb)", "public.bookings", "jsonb", "select * from public.bookings limit 1", true, "public, pg_temp", ["authenticated"]],
    ["public.create_admin_personal_event(booking_payload jsonb)", "public.bookings", "jsonb", "select * from public.bookings limit 1", true, "public", ["authenticated"]],
    ["public.link_telegram_chat_to_booking(link_payload jsonb)", "jsonb", "jsonb", "select '{}'::jsonb", true, "public, pg_temp", ["anon", "authenticated"]],
    ["public.cleanup_expired_booking_holds()", "integer", "", "select 0", true, "public, pg_temp", ["anon", "authenticated"]],
  ];

  for (const [definition, returns, grantSignature, body, securityDefiner, searchPath, grants] of functions) {
    if (omitExpectedFunction && definition === "public.cleanup_expired_booking_holds()") continue;
    await db.exec(`
      create function ${definition}
      returns ${returns}
      language sql
      ${securityDefiner ? "security definer" : ""}
      set search_path = ${searchPath}
      as $$ ${body} $$;
      revoke all on function ${definition.split("(")[0]}(${grantSignature}) from public;
    `);
    for (const role of grants) {
      await db.exec(`grant execute on function ${definition.split("(")[0]}(${grantSignature}) to ${role};`);
    }
  }

  return db;
}

async function runAudit(options) {
  const db = await createAuditCatalogue(options);
  const sql = await readFile(AUDIT_SQL_PATH, "utf8");
  const result = await db.query(sql);
  await db.close();
  return result.rows;
}

const completeRows = await runAudit();
assert.ok(completeRows.length > 0, "Audit returns one unified result table");

const absentClients = completeRows.find(
  (row) => row.category === "affected_table_presence" && row.object_name === "public.clients"
);
assert.equal(absentClients?.status, "MATCHED", "Absent public.clients is documented as expected absence");

const absentWrongTelegramTable = completeRows.find(
  (row) => row.category === "affected_table_presence" && row.object_name === "public.telegram_chat_links"
);
assert.equal(absentWrongTelegramTable?.status, "MATCHED", "Absent historical Telegram table name is documented");

const presentTelegramTable = completeRows.find(
  (row) => row.category === "affected_table_presence" && row.object_name === "public.client_telegram_links"
);
assert.equal(presentTelegramTable?.status, "MATCHED", "Actual Telegram link table is checked");

const unrecordedRemainingReconciliation = completeRows.find(
  (row) => row.category === "migration_history"
    && row.object_name === "20260806120000_reconcile_remaining_production_schema.sql"
);
assert.equal(
  unrecordedRemainingReconciliation?.status,
  "HISTORICAL_MISMATCH",
  "Unrecorded 20260806120000 is visible in the consolidated audit"
);

const missingFunctionRows = await runAudit({ omitExpectedFunction: true });
const missingFunction = missingFunctionRows.find(
  (row) => row.category === "function_signature_security_and_grants"
    && row.object_name === "public.cleanup_expired_booking_holds()"
);
assert.equal(missingFunction?.status, "BLOCKER", "Missing expected function becomes an audit row");

console.log("Final reconciliation audit regression tests passed.");
