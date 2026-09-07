import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260713130000_enforce_client_booking_limits.sql",
  import.meta.url
);

const migrationSql = await readFile(migrationUrl, "utf8");
const db = new PGlite();

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function setContext({ userId = null, isAdmin = false } = {}) {
  await db.query("update public.test_context set user_id = $1::uuid, is_admin = $2::boolean", [userId, isAdmin]);
}

async function datePlus(days) {
  const row = await queryOne("select ((now() at time zone 'Europe/London')::date + $1::integer)::text as value", [days]);
  return row.value;
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

async function createHold({ date, start = 600, duration = 60, clientKey = "client-key-12345678901234567890" }) {
  return await queryOne(
    `insert into public.booking_holds (client_key, date, start_minutes, duration_minutes, buffer_minutes, expires_at)
     values ($1::text, $2::date, $3::integer, $4::integer, 60, now() + interval '10 minutes')
     returning id, hold_token, client_key`,
    [clientKey, date, start, duration]
  );
}

function payload({
  date,
  start = 600,
  duration = 60,
  email = "guest@example.com",
  phone = "07123 456789",
  id = crypto.randomUUID(),
  name = "Guest Client",
  serviceId = "massage",
  status = "pending_payment_verification",
  paymentStatus = "awaiting_verification",
  userId = null,
  hold = null,
} = {}) {
  return {
    id,
    user_id: userId,
    client_name: name,
    client_email: email,
    client_phone: phone,
    service_id: serviceId,
    service: "massage",
    service_name: "massage",
    date,
    start_minutes: start,
    end_minutes: start + duration,
    duration_minutes: duration,
    selected_area: "Kensington",
    price: 85,
    payment_status: paymentStatus,
    status,
    notes: JSON.stringify({ appBooking: { bookingReference: `VDM-${id}` } }),
    selected_services: [],
    selected_durations: [],
    ...(hold ? { hold_id: hold.id, hold_token: hold.hold_token, hold_client_key: hold.client_key } : {}),
  };
}

async function createClientBooking(options = {}) {
  const bookingDate = options.date ?? await datePlus(5);
  const hold = options.hold === null
    ? null
    : options.hold ?? await createHold({
      clientKey: options.clientKey,
      date: bookingDate,
      duration: options.duration ?? 60,
      start: options.start ?? 600,
    });

  return await queryOne(
    "select * from public.create_secure_booking($1::jsonb)",
    [JSON.stringify(payload({ ...options, date: bookingDate, hold }))]
  );
}

async function insertBooking({
  date,
  start = 600,
  duration = 60,
  email = "guest@example.com",
  phone = "07123456789",
  status = "confirmed",
  paymentStatus = "awaiting_verification",
  serviceId = "massage",
  userId = null,
} = {}) {
  await db.query(
    `insert into public.bookings (
       id, user_id, client_name, client_email, client_phone, service_id, service, service_name,
       date, start_minutes, end_minutes, duration_minutes, price, payment_status, status, notes
     )
     values (
       gen_random_uuid(), $1::uuid, 'Stored Client', lower($2::text), $3::text, $4::text, 'massage', 'massage',
       $5::date, $6::integer, $7::integer, $8::integer, 85, $9::text, $10::text, '{}'
     )`,
    [userId, email, phone, serviceId, date, start, start + duration, duration, paymentStatus, status]
  );
}

async function assertSqlRejects(fn, matcher) {
  await assert.rejects(fn, matcher);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;

    create table public.test_context (
      user_id uuid,
      is_admin boolean not null default false
    );
    insert into public.test_context (user_id, is_admin) values (null, false);

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $auth_uid$
      select user_id from public.test_context limit 1
    $auth_uid$;

    create function public.current_user_is_booking_admin()
    returns boolean
    language sql
    stable
    as $is_admin$
      select coalesce(is_admin, false) from public.test_context limit 1
    $is_admin$;

    create function public.booking_reference_from_notes(booking_notes text)
    returns text
    language plpgsql
    immutable
    set search_path = public
    as $booking_reference_from_notes$
    declare
      parsed_notes jsonb;
    begin
      parsed_notes := booking_notes::jsonb;
      return coalesce(
        nullif(trim(parsed_notes #>> '{appBooking,bookingReference}'), ''),
        nullif(trim(parsed_notes #>> '{appBooking,paymentReference}'), '')
      );
    exception
      when others then
        return null;
    end;
    $booking_reference_from_notes$;

    create table public.orders (
      id uuid primary key default gen_random_uuid(),
      user_id uuid,
      client_email text
    );

    create table public.client_addresses (
      id uuid primary key default gen_random_uuid(),
      user_id uuid
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
      created_at timestamptz not null default now()
    );

    create table public.booking_holds (
      id uuid primary key default gen_random_uuid(),
      hold_token uuid not null default gen_random_uuid(),
      client_key text,
      date date not null,
      start_minutes integer not null,
      duration_minutes integer not null,
      buffer_minutes integer not null default 60,
      expires_at timestamptz not null default now() + interval '10 minutes',
      released_at timestamptz,
      created_at timestamptz not null default now()
    );
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  await setContext();
  const withinWindowDate = await datePlus(5);
  const fortyDayDate = await datePlus(40);
  const fortyOneDayDate = await datePlus(41);
  const today = await londonClock();
  const tooSoonTodayStart = Math.min(Number(today.minutes) + 60, 1380);

  await db.exec("truncate public.bookings, public.booking_holds");
  await assertSqlRejects(
    () => createClientBooking({ date: today.date, start: tooSoonTodayStart }),
    /Online appointments need at least 2 hours notice/
  );

  const firstBooking = await createClientBooking({ date: withinWindowDate });
  assert.equal(firstBooking.client_email, "guest@example.com", "New client with no future booking can book");

  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 800 }),
    /Your first appointment is already reserved/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: withinWindowDate, status: "cancelled", paymentStatus: "cancelled" });
  await createClientBooking({ date: withinWindowDate, start: 800 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: withinWindowDate, status: "expired", paymentStatus: "expired" });
  await createClientBooking({ date: withinWindowDate, start: 800 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: withinWindowDate, status: "completed", paymentStatus: "paid" });
  await createClientBooking({ date: withinWindowDate, start: 600 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: withinWindowDate, status: "rejected", paymentStatus: "rejected" });
  await createClientBooking({ date: withinWindowDate, start: 600 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: await datePlus(-20), status: "completed", paymentStatus: "awaiting_verification" });
  await insertBooking({ date: withinWindowDate, start: 700 });
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 900 }),
    /Your first appointment is already reserved/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: await datePlus(-20), status: "confirmed", paymentStatus: "paid" });
  await insertBooking({ date: withinWindowDate, start: 700 });
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 900 }),
    /Your first appointment is already reserved/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: await datePlus(-20), status: "completed", paymentStatus: "paid" });
  await createClientBooking({ date: withinWindowDate, start: 700 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await insertBooking({ date: await datePlus(-20), status: "completed", paymentStatus: "paid" });
  for (let index = 0; index < 4; index += 1) {
    await insertBooking({ date: await datePlus(2 + index), start: 600 + index * 90 });
  }
  await createClientBooking({ date: withinWindowDate, start: 1200 });
  const sixthAppointmentDate = await datePlus(6);
  await assertSqlRejects(
    () => createClientBooking({ date: sixthAppointmentDate, start: 1200 }),
    /You already have five upcoming appointments/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await createClientBooking({ date: fortyDayDate, start: 600 });

  await db.exec("truncate public.bookings, public.booking_holds");
  await assertSqlRejects(
    () => createClientBooking({ date: fortyOneDayDate, start: 600 }),
    /Online appointments can currently be arranged up to 40 days ahead/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await createClientBooking({ date: withinWindowDate, start: 600 });
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 900, serviceId: "book-again-massage" }),
    /Your first appointment is already reserved/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  await createClientBooking({ date: withinWindowDate, start: 600, email: "Guest@Example.com", phone: "07123 456789" });
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 900, email: "guest@example.com", phone: "07123456789" }),
    /Your first appointment is already reserved/
  );

  await db.exec("truncate public.bookings, public.booking_holds");
  const authUserId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  await setContext({ userId: authUserId, isAdmin: false });
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, start: 600, userId: otherUserId }),
    /Cannot create a booking for another client/
  );
  const authBooking = await createClientBooking({ date: withinWindowDate, start: 900, userId: authUserId });
  assert.equal(authBooking.user_id, authUserId, "Authenticated booking is owned by auth.uid()");

  await db.exec("truncate public.bookings, public.booking_holds");
  await setContext({ userId: "33333333-3333-4333-8333-333333333333", isAdmin: true });
  const adminBooking = await createClientBooking({
    date: fortyOneDayDate,
    hold: null,
    phone: "",
    start: 600,
    userId: otherUserId,
  });
  assert.equal(adminBooking.user_id, otherUserId, "Admin-created appointment can bypass client limits and assign user");

  await db.exec("truncate public.bookings, public.booking_holds");
  await setContext();
  const consumedHold = await createHold({ date: withinWindowDate, start: 600 });
  await createClientBooking({ date: withinWindowDate, hold: consumedHold, start: 600 });
  const consumed = await queryOne("select released_at is not null as released from public.booking_holds where id = $1::uuid", [consumedHold.id]);
  assert.equal(consumed.released, true, "Successful booking consumes the hold");

  await db.exec("truncate public.bookings, public.booking_holds");
  await assertSqlRejects(
    () => createClientBooking({ date: withinWindowDate, hold: null, start: 600 }),
    /Time slot is no longer available/
  );

  assert.match(migrationSql, /pg_advisory_xact_lock\(hashtext\('client-booking-limit:' \|\| identity_lock_key\)\)/);
  assert.match(migrationSql, /status = 'completed'/);
  assert.match(migrationSql, /payment_status = 'paid'/);

  console.log("Client booking limit migration tests passed.");
} finally {
  await db.close();
}
