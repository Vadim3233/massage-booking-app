import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const holdMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260713120000_add_booking_hold_rpcs.sql", import.meta.url),
  "utf8"
);
const repairMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260804120000_production_safety_repair.sql", import.meta.url),
  "utf8"
);
const permissionRepairMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260804123000_fix_production_safety_repair_permissions.sql", import.meta.url),
  "utf8"
);
const anonGrantCleanupMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260804124500_remove_remaining_anon_function_grants.sql", import.meta.url),
  "utf8"
);
const helperAuthenticatedGrantCleanupMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260804130000_remove_helper_authenticated_function_grants.sql", import.meta.url),
  "utf8"
);
const postApplicationVerificationSql = await readFile(
  new URL("../../supabase/verification/20260804120000_production_safety_repair_post_application_verification.sql", import.meta.url),
  "utf8"
);

const db = new PGlite();

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function setContext({ userId = null, isAdmin = false, email = "" } = {}) {
  await db.query(
    "update public.test_context set user_id = $1::uuid, is_admin = $2::boolean, email = $3::text",
    [userId, isAdmin, email]
  );
}

async function assertSqlRejects(fn, matcher) {
  await assert.rejects(fn, matcher);
}

async function datePlus(days) {
  const row = await queryOne("select ((now() at time zone 'Europe/London')::date + $1::integer)::text as value", [days]);
  return row.value;
}

async function londonNowMinutes() {
  const row = await queryOne(`
    select (
      extract(hour from now() at time zone 'Europe/London')::integer * 60
      + extract(minute from now() at time zone 'Europe/London')::integer
    ) as value
  `);
  return Number(row.value);
}

async function canExecute(roleName, signature) {
  const row = await queryOne("select has_function_privilege($1::text, to_regprocedure($2::text), 'EXECUTE') as allowed", [
    roleName,
    signature,
  ]);
  return row.allowed;
}

function appNotes(reference, travelBuffer = 60) {
  return JSON.stringify({
    appBooking: {
      bookingReference: reference,
      paymentReference: reference,
      travelBuffer,
    },
  });
}

async function insertBooking({
  id = crypto.randomUUID(),
  userId,
  email,
  date = "2099-08-10",
  start = 600,
  duration = 60,
  status = "confirmed",
  paymentStatus = "paid",
  notes = appNotes(`VDM-${id}`, 60),
} = {}) {
  const row = await queryOne(
    `insert into public.bookings (
       id, user_id, client_name, client_email, client_phone, service_id, service, service_name,
       date, start_minutes, end_minutes, duration_minutes, address, postcode, selected_area,
       price, payment_status, status, notes, created_at
     )
     values (
       $1::uuid, $2::uuid, 'Test Client', lower($3::text), '07123456789',
       'massage', 'Massage', 'Massage', $4::date, $5::integer, $6::integer,
       $7::integer, '1 Test Street', 'SW1A 1AA', 'Chelsea', 100,
       $8::text, $9::text, $10::text, now()
     )
     returning *`,
    [id, userId, email, date, start, start + duration, duration, paymentStatus, status, notes]
  );
  return row;
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;

    create table public.test_context (
      user_id uuid,
      is_admin boolean not null default false,
      email text
    );
    insert into public.test_context (user_id, is_admin, email) values (null, false, null);

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $auth_uid$
      select user_id from public.test_context limit 1
    $auth_uid$;

    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $auth_jwt$
      select jsonb_build_object('email', email) from public.test_context limit 1
    $auth_jwt$;

    create function public.current_user_is_booking_admin()
    returns boolean
    language sql
    stable
    as $is_admin$
      select coalesce(is_admin, false) from public.test_context limit 1
    $is_admin$;

    create table public.orders (
      id uuid primary key default gen_random_uuid(),
      user_id uuid,
      client_id uuid,
      client_name text,
      client_email text,
      payment_provider text,
      payment_id text,
      payment_status text not null default 'pending',
      total_amount numeric not null default 0,
      created_at timestamptz not null default now()
    );

    create table public.client_addresses (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null
    );

    create table public.bookings (
      id uuid primary key default gen_random_uuid(),
      order_id uuid,
      user_id uuid,
      saved_address_id uuid,
      client_name text not null,
      client_email text not null,
      client_phone text,
      service_id text,
      service text,
      service_name text,
      date date not null,
      start_minutes integer not null,
      end_minutes integer,
      duration_minutes integer not null,
      address text,
      postcode text,
      selected_area text,
      price numeric,
      travel_fee numeric,
      congestion_fee numeric,
      payment_id text,
      payment_status text,
      status text not null default 'confirmed',
      notes text,
      selected_services jsonb default '[]'::jsonb,
      selected_durations jsonb default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
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

    create function public.create_booking_hold(
      hold_date date,
      hold_start_minutes integer,
      hold_duration_minutes integer,
      hold_buffer_minutes integer default 60
    )
    returns table (hold_id uuid, hold_token uuid, expires_at timestamptz)
    language sql
    security definer
    set search_path = public, pg_temp
    as $legacy_create_hold$
      insert into public.booking_holds (date, start_minutes, duration_minutes, buffer_minutes, expires_at)
      values (hold_date, hold_start_minutes, hold_duration_minutes, hold_buffer_minutes, now() + interval '10 minutes')
      returning id, hold_token, expires_at
    $legacy_create_hold$;

    create function public.release_booking_hold(
      release_hold_id uuid,
      release_hold_token uuid
    )
    returns table (hold_id uuid, released boolean)
    language sql
    security definer
    set search_path = public, pg_temp
    as $legacy_release_hold$
      update public.booking_holds
         set expires_at = least(expires_at, now())
       where id = release_hold_id
         and hold_token = release_hold_token
      returning id, true
    $legacy_release_hold$;

    grant execute on function public.create_booking_hold(date, integer, integer, integer) to anon, authenticated;
    grant execute on function public.release_booking_hold(uuid, uuid) to anon, authenticated;

    alter table public.bookings add constraint repair_test_not_valid_01 check (true) not valid;
    alter table public.bookings add constraint repair_test_not_valid_02 check (true) not valid;
    alter table public.bookings add constraint repair_test_not_valid_03 check (true) not valid;
    alter table public.bookings add constraint repair_test_not_valid_04 check (true) not valid;
    alter table public.bookings add constraint repair_test_not_valid_05 check (true) not valid;
    alter table public.bookings add constraint repair_test_not_valid_06 check (true) not valid;
    alter table public.booking_holds add constraint repair_test_not_valid_07 check (true) not valid;
    alter table public.booking_holds add constraint repair_test_not_valid_08 check (true) not valid;
    alter table public.orders add constraint repair_test_not_valid_09 check (true) not valid;
    alter table public.orders add constraint repair_test_not_valid_10 check (true) not valid;
    alter table public.client_addresses add constraint repair_test_not_valid_11 check (true) not valid;
    alter table public.client_addresses add constraint repair_test_not_valid_12 check (true) not valid;
  `);

  await db.exec(holdMigrationSql);
  await db.exec(repairMigrationSql);
  await db.exec(repairMigrationSql);
  await db.exec(permissionRepairMigrationSql);
  await db.exec(permissionRepairMigrationSql);

  await db.exec(`
    grant execute on function public.booking_app_notes_json(text) to anon;
    grant execute on function public.booking_reference_from_notes(text) to anon;
    grant execute on function public.link_recent_guest_booking_to_client(jsonb) to anon;
    grant execute on function public.reschedule_client_booking(uuid, date, integer) to anon;
  `);

  for (const signature of [
    "public.booking_app_notes_json(text)",
    "public.booking_reference_from_notes(text)",
    "public.link_recent_guest_booking_to_client(jsonb)",
    "public.reschedule_client_booking(uuid, date, integer)",
  ]) {
    assert.equal(await canExecute("anon", signature), true, `${signature} starts with a direct anon grant in the production-mismatch simulation`);
    assert.equal(await canExecute("public", signature), false, `${signature} does not rely on PUBLIC after the first permission repair`);
  }

  await db.exec(anonGrantCleanupMigrationSql);
  await db.exec(anonGrantCleanupMigrationSql);

  for (const signature of [
    "public.booking_app_notes_json(text)",
    "public.booking_reference_from_notes(text)",
    "public.link_recent_guest_booking_to_client(jsonb)",
    "public.reschedule_client_booking(uuid, date, integer)",
  ]) {
    assert.equal(await canExecute("anon", signature), false, `${signature} no longer allows anon`);
    assert.equal(await canExecute("public", signature), false, `${signature} no longer allows PUBLIC`);
  }

  assert.equal(await canExecute("authenticated", "public.booking_app_notes_json(text)"), false, "booking_app_notes_json remains private to function callers");
  assert.equal(await canExecute("authenticated", "public.booking_reference_from_notes(text)"), false, "booking_reference_from_notes remains private to function callers");
  assert.equal(await canExecute("authenticated", "public.link_recent_guest_booking_to_client(jsonb)"), true, "Authenticated clients can still link recent guest bookings");
  assert.equal(await canExecute("authenticated", "public.reschedule_client_booking(uuid, date, integer)"), true, "Authenticated clients can still reschedule");
  assert.equal(await canExecute("anon", "public.get_public_booking_blocks(date, date)"), true, "Public availability remains available to anon");
  assert.equal(await canExecute("anon", "public.create_secure_order(jsonb)"), true, "Client order creation remains available to anon");
  assert.equal(await canExecute("anon", "public.create_booking_hold(date, integer, integer, integer, text)"), true, "Modern hold creation remains available to anon");
  assert.equal(await canExecute("anon", "public.release_booking_hold(uuid, uuid, text)"), true, "Modern hold release remains available to anon");

  await db.exec(`
    grant execute on function public.booking_app_notes_json(text) to authenticated;
    grant execute on function public.booking_reference_from_notes(text) to authenticated;
  `);
  assert.equal(await canExecute("authenticated", "public.booking_app_notes_json(text)"), true, "booking_app_notes_json starts with a direct authenticated grant in the second production-mismatch simulation");
  assert.equal(await canExecute("authenticated", "public.booking_reference_from_notes(text)"), true, "booking_reference_from_notes starts with a direct authenticated grant in the second production-mismatch simulation");
  assert.equal(await canExecute("anon", "public.booking_app_notes_json(text)"), false, "booking_app_notes_json remains unavailable to anon before helper cleanup");
  assert.equal(await canExecute("public", "public.booking_reference_from_notes(text)"), false, "booking_reference_from_notes remains unavailable to PUBLIC before helper cleanup");

  await db.exec(helperAuthenticatedGrantCleanupMigrationSql);
  await db.exec(helperAuthenticatedGrantCleanupMigrationSql);

  assert.equal(await canExecute("authenticated", "public.booking_app_notes_json(text)"), false, "booking_app_notes_json no longer allows authenticated");
  assert.equal(await canExecute("authenticated", "public.booking_reference_from_notes(text)"), false, "booking_reference_from_notes no longer allows authenticated");
  assert.equal(await canExecute("anon", "public.booking_app_notes_json(text)"), false, "booking_app_notes_json still does not allow anon");
  assert.equal(await canExecute("anon", "public.booking_reference_from_notes(text)"), false, "booking_reference_from_notes still does not allow anon");
  assert.equal(await canExecute("public", "public.booking_app_notes_json(text)"), false, "booking_app_notes_json still does not allow PUBLIC");
  assert.equal(await canExecute("public", "public.booking_reference_from_notes(text)"), false, "booking_reference_from_notes still does not allow PUBLIC");
  assert.equal(await canExecute("authenticated", "public.link_recent_guest_booking_to_client(jsonb)"), true, "Authenticated guest linking remains unchanged");
  assert.equal(await canExecute("authenticated", "public.reschedule_client_booking(uuid, date, integer)"), true, "Authenticated rescheduling remains unchanged");

  const postVerification = await db.query(postApplicationVerificationSql);
  assert.deepEqual(
    postVerification.rows.map((row) => [row.check_name, row.status, Number(row.issue_count)]),
    [
      ["expected_repaired_function_signatures_security_and_grants", "PASS", 0],
      ["obsolete_hold_overload_execute_permissions_removed", "PASS", 0],
      ["no_unrelated_hold_overloads_removed_or_added", "PASS", 0],
      ["affected_tables_still_exist", "PASS", 0],
      ["affected_table_record_counts_observable", "PASS", 0],
      ["not_valid_constraints_unchanged_expected_count", "PASS", 0],
    ],
    "Post-application verification passes after all three migrations"
  );

  const futureDate = await datePlus(10);
  const secondFutureDate = await datePlus(11);
  const fortyDayDate = await datePlus(40);
  const fortyOneDayDate = await datePlus(41);
  const todayDate = await datePlus(0);

  assert.equal(
    (await queryOne("select to_regprocedure('public.create_booking_hold(date, integer, integer, integer)') is null as missing")).missing,
    true,
    "Legacy create_booking_hold overload is removed"
  );
  assert.equal(
    (await queryOne("select to_regprocedure('public.release_booking_hold(uuid, uuid)') is null as missing")).missing,
    true,
    "Legacy release_booking_hold overload is removed"
  );

  const clientKey = "client-key-12345678901234567890";
  const hold = await queryOne(
    "select * from public.create_booking_hold($1::date, 600, 60, 60, $2::text)",
    [futureDate, clientKey]
  );
  assert.ok(hold.hold_id, "Modern client-key hold still works");

  const release = await queryOne(
    "select * from public.release_booking_hold($1::uuid, $2::uuid, $3::text)",
    [hold.hold_id, hold.hold_token, clientKey]
  );
  assert.equal(release.released, true, "Modern client-key hold release still works");

  const plainNotesBooking = await insertBooking({
    email: "plain@example.com",
    notes: "Legacy text note, not JSON",
    start: 720,
    date: futureDate,
  });
  const blocks = await db.query(
    "select booking_id::text, buffer_minutes from public.get_public_booking_blocks($1::date, $1::date)",
    [futureDate]
  );
  const plainBlock = blocks.rows.find((row) => row.booking_id === plainNotesBooking.id);
  assert.equal(plainBlock?.buffer_minutes, 60, "Plain-text notes do not break public availability");

  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  await setContext({ userId: userA, email: "client@example.com" });

  await db.exec("truncate public.bookings, public.booking_holds, public.orders");
  const bookingA = await insertBooking({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: userA,
    email: "client@example.com",
    date: futureDate,
    start: 600,
    notes: appNotes("VDM-A", 60),
  });
  await insertBooking({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: userA,
    email: "client@example.com",
    date: futureDate,
    start: 720,
    notes: appNotes("VDM-B", 60),
  });

  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 600)", [bookingA.id, "2020-01-01"]),
    /Past dates cannot be booked online/
  );

  const tooSoonTodayStart = Math.min(1439, await londonNowMinutes());
  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, $3::integer)", [bookingA.id, todayDate, tooSoonTodayStart]),
    /2 hours notice/
  );

  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 600)", [bookingA.id, fortyOneDayDate]),
    /40 days ahead/
  );

  const fortyDayMove = await queryOne(
    "select * from public.reschedule_client_booking($1::uuid, $2::date, 1020)",
    [bookingA.id, fortyDayDate]
  );
  assert.equal(new Date(fortyDayMove.date).toISOString().slice(0, 10), fortyDayDate, "Reschedule accepts the 40th calendar day");

  await db.query("update public.bookings set date = $1::date, start_minutes = 600, end_minutes = 660, duration_minutes = 45 where id = $2::uuid", [futureDate, bookingA.id]);
  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 1020)", [bookingA.id, futureDate]),
    /duration is invalid/
  );
  await db.query("update public.bookings set duration_minutes = 60 where id = $1::uuid", [bookingA.id]);

  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 690)", [bookingA.id, futureDate]),
    /That time is no longer available/
  );

  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 630)", [bookingA.id, futureDate]),
    /That time is no longer available/
  );

  await db.query(
    `insert into public.booking_holds (client_key, date, start_minutes, duration_minutes, buffer_minutes, expires_at)
     values ('other-client-key-123456789012345', $1::date, 900, 60, 60, now() + interval '10 minutes')`,
    [futureDate]
  );
  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 840)", [bookingA.id, futureDate]),
    /currently being held/
  );

  await setContext({ userId: userB, email: "other@example.com" });
  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 1020)", [bookingA.id, futureDate]),
    /does not belong/
  );

  await setContext({ userId: userA, email: "client@example.com" });
  const moved = await queryOne(
    "select * from public.reschedule_client_booking($1::uuid, $2::date, 1020)",
    [bookingA.id, futureDate]
  );
  assert.equal(moved.start_minutes, 1020, "Valid reschedule succeeds");

  const bookingB = await queryOne("select id from public.bookings where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid");
  await assertSqlRejects(
    () => db.query("select * from public.reschedule_client_booking($1::uuid, $2::date, 1020)", [bookingB.id, futureDate]),
    /That time is no longer available/
  );
  assert.match(repairMigrationSql, /pg_advisory_xact_lock\(hashtext\('booking-date:' \|\| new_date::text\)\)/);

  await db.exec("truncate public.bookings, public.booking_holds, public.orders");
  const guestBooking = await insertBooking({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: null,
    email: "client@example.com",
    date: secondFutureDate,
    start: 600,
    notes: appNotes("VDM-GUEST", 60),
  });

  await setContext({ userId: null, email: "" });
  await assertSqlRejects(
    () => db.query("select public.link_recent_guest_booking_to_client($1::jsonb)", [JSON.stringify({ bookings: [{ id: guestBooking.id, booking_reference: "VDM-GUEST" }] })]),
    /signed-in client/
  );

  await setContext({ userId: userA, email: "wrong@example.com" });
  await assertSqlRejects(
    () => db.query("select public.link_recent_guest_booking_to_client($1::jsonb)", [JSON.stringify({ bookings: [{ id: guestBooking.id, booking_reference: "VDM-GUEST" }] })]),
    /not available to link/
  );

  await db.query("update public.bookings set created_at = now() - interval '2 days' where id = $1::uuid", [guestBooking.id]);
  await setContext({ userId: userA, email: "client@example.com" });
  await assertSqlRejects(
    () => db.query("select public.link_recent_guest_booking_to_client($1::jsonb)", [JSON.stringify({ bookings: [{ id: guestBooking.id, booking_reference: "VDM-GUEST" }] })]),
    /not available to link/
  );

  await db.query("update public.bookings set created_at = now(), user_id = null where id = $1::uuid", [guestBooking.id]);
  const linkPayload = JSON.stringify({ bookings: [{ id: guestBooking.id, booking_reference: "VDM-GUEST" }] });
  const linked = await queryOne("select public.link_recent_guest_booking_to_client($1::jsonb) as ids", [linkPayload]);
  assert.deepEqual(linked.ids, [guestBooking.id], "Matching recent guest booking links");
  const linkedAgain = await queryOne("select public.link_recent_guest_booking_to_client($1::jsonb) as ids", [linkPayload]);
  assert.deepEqual(linkedAgain.ids, [guestBooking.id], "Repeated guest link is idempotent");

  await setContext({ userId: null, email: "" });
  await assertSqlRejects(
    () => db.query("select * from public.create_secure_order($1::jsonb)", [JSON.stringify({
      client_email: "guest@example.com",
      payment_id: "pay_paid",
      payment_provider: "manual-demo",
      payment_status: "paid",
      total_amount: 999,
    })]),
    /Clients cannot create orders/
  );

  const order = await queryOne(
    "select * from public.create_secure_order($1::jsonb)",
    [JSON.stringify({
      client_email: "guest@example.com",
      client_name: "Guest",
      payment_id: "pay_bank_transfer",
      payment_provider: "manual-demo",
      payment_status: "awaiting_verification",
      total_amount: 999,
    })]
  );
  assert.equal(order.payment_status, "awaiting_verification", "Guest bank-transfer order still works");
  assert.equal(Number(order.total_amount), 0, "Client-supplied order amount is not trusted");

  await setContext({ userId: userA, isAdmin: true, email: "admin@example.com" });
  const adminOrder = await queryOne(
    "select * from public.create_secure_order($1::jsonb)",
    [JSON.stringify({
      client_email: "admin@example.com",
      payment_id: "pay_admin",
      payment_provider: "manual-demo",
      payment_status: "paid",
      total_amount: 123,
    })]
  );
  assert.equal(adminOrder.payment_status, "paid", "Admin order status remains intentionally trusted");
  assert.equal(Number(adminOrder.total_amount), 123, "Admin order amount can be retained");

  console.log("Production safety repair migration tests passed.");
} finally {
  await db.close();
}
