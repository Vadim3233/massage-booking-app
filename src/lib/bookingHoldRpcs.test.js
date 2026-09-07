import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260713120000_add_booking_hold_rpcs.sql",
  import.meta.url
);

const migrationSql = await readFile(migrationUrl, "utf8");
const publicAvailabilityMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260731140000_align_public_availability_with_holds.sql", import.meta.url),
  "utf8"
);
const db = new PGlite();

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function assertRejectsSql(sql, params, matcher) {
  await assert.rejects(
    () => db.query(sql, params),
    matcher
  );
}

async function londonClock() {
  return await queryOne(`
    select
      (now() at time zone 'Europe/London')::date::text as date,
      (
        extract(hour from now() at time zone 'Europe/London')::integer * 60
        + extract(minute from now() at time zone 'Europe/London')::integer
      ) as minutes
  `);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;

    create table public.bookings (
      id uuid primary key default gen_random_uuid(),
      date date not null,
      start_minutes integer not null,
      duration_minutes integer not null,
      status text not null default 'confirmed',
      payment_status text,
      notes text default '{}'
    );

    create table public.booking_holds (
      id uuid primary key default gen_random_uuid(),
      hold_token uuid not null default gen_random_uuid(),
      date date not null,
      start_minutes integer not null,
      duration_minutes integer not null,
      buffer_minutes integer not null default 60,
      expires_at timestamptz not null default now() + interval '10 minutes',
      created_at timestamptz not null default now()
    );
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);
  await db.exec(publicAvailabilityMigrationSql);
  await db.exec(publicAvailabilityMigrationSql);

  const clientA = "client-a-12345678901234567890";
  const clientB = "client-b-12345678901234567890";
  const date = "2099-07-13";
  const today = await londonClock();
  const tooSoonTodayStart = Math.min(Number(today.minutes) + 60, 1439);

  await assertRejectsSql(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [today.date, tooSoonTodayStart, 60, 60, clientA],
    /Online appointments need at least 2 hours notice/
  );

  const hold = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 600, 60, 60, clientA]
  );

  assert.ok(hold.hold_id, "Hold creation returns an ID");
  assert.ok(hold.hold_token, "Hold creation returns a token");
  assert.ok(hold.expires_at, "Hold creation returns authoritative expiry");

  await assertRejectsSql(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 630, 60, 60, clientB],
    /Time slot is no longer available/
  );

  const refreshed = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 600, 60, 60, clientA]
  );

  assert.equal(refreshed.hold_id, hold.hold_id, "Same client refreshes the existing same-slot hold");
  assert.notEqual(refreshed.hold_token, hold.hold_token, "Refreshing rotates the hold token");

  const released = await queryOne(
    "select * from public.release_booking_hold($1::uuid, $2::uuid, $3::text)",
    [refreshed.hold_id, refreshed.hold_token, clientA]
  );

  assert.equal(released.hold_id, refreshed.hold_id);
  assert.equal(released.released, true);

  const repeatedRelease = await queryOne(
    "select * from public.release_booking_hold($1::uuid, $2::uuid, $3::text)",
    [refreshed.hold_id, refreshed.hold_token, clientA]
  );

  assert.equal(repeatedRelease.released, false, "Repeated release is safe");

  await assertRejectsSql(
    "select * from public.release_booking_hold($1::uuid, gen_random_uuid(), $2::text)",
    [refreshed.hold_id, clientA],
    /Booking hold token is invalid/
  );

  const privateHold = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 760, 60, 60, clientA]
  );

  await assertRejectsSql(
    "select * from public.release_booking_hold($1::uuid, $2::uuid, $3::text)",
    [privateHold.hold_id, privateHold.hold_token, clientB],
    /Booking hold token is invalid/
  );

  await db.query(
    "update public.booking_holds set expires_at = now() - interval '1 minute' where id = $1::uuid",
    [privateHold.hold_id]
  );

  const afterExpiry = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 760, 60, 60, clientB]
  );

  assert.ok(afterExpiry.hold_id, "Expired holds do not block availability");

  await db.query(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 900, 60, 'confirmed', 'paid')",
    [date]
  );

  await assertRejectsSql(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 900, 60, 60, clientA],
    /Time slot is no longer available/
  );

  await db.query(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 1020, 60, 'rejected', 'rejected')",
    [date]
  );

  const rejectedSlot = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 1020, 60, 60, clientA]
  );
  assert.ok(rejectedSlot.hold_id, "Rejected bookings do not block holds");

  await db.query(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 1140, 60, 'completed', 'paid')",
    [date]
  );

  const completedSlot = await queryOne(
    "select * from public.create_booking_hold($1::date, $2::integer, $3::integer, $4::integer, $5::text)",
    [date, 1140, 60, 60, clientA]
  );
  assert.ok(completedSlot.hold_id, "Completed bookings do not block holds");

  const activePendingBooking = await queryOne(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 1200, 60, 'pending_payment_verification', 'awaiting_verification') returning id",
    [date]
  );
  const activeCashBooking = await queryOne(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 1320, 60, 'payment_method_review', 'cash_on_arrival') returning id",
    [date]
  );
  const cancelledBooking = await queryOne(
    "insert into public.bookings (date, start_minutes, duration_minutes, status, payment_status) values ($1::date, 1380, 60, 'cancelled', 'cancelled') returning id",
    [date]
  );

  const publicBlocks = await db.query(
    "select booking_id::text, start_minutes from public.get_public_booking_blocks($1::date, $1::date)",
    [date]
  );
  const publicBlockById = new Map(publicBlocks.rows.map((row) => [row.booking_id, row.start_minutes]));

  assert.equal(
    publicBlockById.get(activePendingBooking.id),
    1200,
    "Pending payment bookings are hidden from client availability"
  );
  assert.equal(
    publicBlockById.get(activeCashBooking.id),
    1320,
    "Payment-review/cash bookings are hidden from client availability"
  );
  assert.equal(
    publicBlockById.has(cancelledBooking.id),
    false,
    "Cancelled bookings do not block public availability"
  );

  const cleaned = await queryOne("select public.cleanup_expired_booking_holds() as count");
  assert.ok(Number(cleaned.count) >= 1, "Expired/released hold cleanup removes rows");

  console.log("Booking hold RPC migration tests passed.");
} finally {
  await db.close();
}
