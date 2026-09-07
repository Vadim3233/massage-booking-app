import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../../supabase/migrations/20260713140000_harden_secure_booking_updates.sql",
  import.meta.url
);

const migrationSql = await readFile(migrationUrl, "utf8");
const db = new PGlite();

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function setAdmin(isAdmin) {
  await db.query("update public.test_context set is_admin = $1::boolean", [isAdmin]);
}

function updatePayload(overrides = {}) {
  const id = overrides.id ?? "00000000-0000-4000-8000-000000000101";
  return {
    id,
    client_name: "Payment Client",
    client_email: "payment@example.com",
    client_phone: "07123456789",
    service_id: "massage",
    service: "massage",
    service_name: "massage",
    date: "2099-07-13",
    start_minutes: 600,
    end_minutes: 660,
    duration_minutes: 60,
    selected_area: "Kensington",
    price: 85,
    payment_status: "awaiting_verification",
    status: "pending_payment_verification",
    notes: "{}",
    selected_services: [],
    selected_durations: [],
    ...overrides,
  };
}

async function insertBooking(overrides = {}) {
  const payload = updatePayload(overrides);
  await db.query(
    `insert into public.bookings (
       id, client_name, client_email, client_phone, service_id, service, service_name,
       date, start_minutes, end_minutes, duration_minutes, selected_area, price,
       payment_status, status, notes, selected_services, selected_durations
     )
     values (
       $1::uuid, $2::text, lower($3::text), $4::text, $5::text, $6::text, $7::text,
       $8::date, $9::integer, $10::integer, $11::integer, $12::text, $13::numeric,
       $14::text, $15::text, $16::text, $17::jsonb, $18::jsonb
     )`,
    [
      payload.id,
      payload.client_name,
      payload.client_email,
      payload.client_phone,
      payload.service_id,
      payload.service,
      payload.service_name,
      payload.date,
      payload.start_minutes,
      payload.end_minutes,
      payload.duration_minutes,
      payload.selected_area,
      payload.price,
      payload.payment_status,
      payload.status,
      payload.notes,
      JSON.stringify(payload.selected_services),
      JSON.stringify(payload.selected_durations),
    ]
  );
  return payload;
}

async function updateBooking(payload) {
  return await queryOne("select * from public.update_secure_booking($1::jsonb)", [JSON.stringify(payload)]);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;

    create table public.test_context (
      is_admin boolean not null default false
    );
    insert into public.test_context (is_admin) values (false);

    create function public.current_user_is_booking_admin()
    returns boolean
    language sql
    stable
    as $is_admin$
      select coalesce(is_admin, false) from public.test_context limit 1
    $is_admin$;

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $auth_uid$
      select '11111111-1111-4111-8111-111111111111'::uuid
    $auth_uid$;

    create table public.orders (
      id uuid primary key default gen_random_uuid()
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
      cancelled_at timestamptz,
      cancelled_by text,
      cancellation_window text,
      notes text,
      selected_services jsonb default '[]'::jsonb,
      selected_durations jsonb default '[]'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  await insertBooking();

  await assert.rejects(
    () => updateBooking(updatePayload({ payment_status: "paid", status: "confirmed" })),
    /Only booking admins may update bookings/
  );

  await assert.rejects(
    () => updateBooking(updatePayload({ payment_status: "cash_on_arrival", status: "confirmed" })),
    /Only booking admins may update bookings/
  );

  await setAdmin(true);

  const paid = await updateBooking(updatePayload({ payment_status: "paid", status: "confirmed" }));
  assert.equal(paid.payment_status, "paid", "Admin can verify bank-transfer payment");
  assert.equal(paid.status, "confirmed");

  const cashId = "00000000-0000-4000-8000-000000000102";
  await insertBooking({
    id: cashId,
    payment_status: "cash_on_arrival",
    status: "payment_method_review",
    start_minutes: 720,
    end_minutes: 780,
  });
  const cashApproved = await updateBooking(updatePayload({
    id: cashId,
    payment_status: "cash_on_arrival",
    status: "confirmed",
    start_minutes: 720,
    end_minutes: 780,
  }));
  assert.equal(cashApproved.payment_status, "cash_on_arrival", "Cash approval remains due on arrival");
  assert.equal(cashApproved.status, "confirmed");

  const rejected = await updateBooking(updatePayload({
    id: cashId,
    cancelled_at: "2099-07-01T10:00:00.000Z",
    cancelled_by: "admin",
    cancellation_window: "free",
    payment_status: "cancelled",
    status: "cancelled",
    start_minutes: 720,
    end_minutes: 780,
  }));
  assert.equal(rejected.payment_status, "cancelled", "Cash rejection cancels payment state");
  assert.equal(rejected.status, "cancelled", "Cash rejection releases active reservation");
  assert.equal(rejected.cancelled_by, "admin");
  assert.equal(rejected.cancellation_window, "free");

  const completedId = "00000000-0000-4000-8000-000000000103";
  const editableId = "00000000-0000-4000-8000-000000000104";
  await insertBooking({
    id: completedId,
    payment_status: "paid",
    status: "completed",
    start_minutes: 900,
    end_minutes: 960,
  });
  await insertBooking({
    id: editableId,
    payment_status: "awaiting_verification",
    status: "pending_payment_verification",
    start_minutes: 1020,
    end_minutes: 1080,
  });
  const movedOntoCompletedSlot = await updateBooking(updatePayload({
    id: editableId,
    payment_status: "awaiting_verification",
    status: "pending_payment_verification",
    start_minutes: 900,
    end_minutes: 960,
  }));
  assert.equal(movedOntoCompletedSlot.start_minutes, 900, "Completed bookings do not block admin edits");

  console.log("Secure booking update migration tests passed.");
} finally {
  await db.close();
}
