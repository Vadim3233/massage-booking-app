import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationSql = await readFile(
  new URL("../../supabase/migrations/20260806120000_reconcile_remaining_production_schema.sql", import.meta.url),
  "utf8"
);
const preflightSql = await readFile(
  new URL("../../supabase/verification/20260806120000_reconcile_remaining_production_schema_preflight.sql", import.meta.url),
  "utf8"
);
const postVerificationSql = await readFile(
  new URL("../../supabase/verification/20260806120000_reconcile_remaining_production_schema_post_verification.sql", import.meta.url),
  "utf8"
);

const db = new PGlite();

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function canExecute(roleName, signature) {
  const row = await queryOne("select has_function_privilege($1::text, to_regprocedure($2::text), 'EXECUTE') as allowed", [
    roleName,
    signature,
  ]);
  return row.allowed;
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

    create table public.bookings (
      id uuid primary key default gen_random_uuid(),
      booking_reference text,
      payment_reference text,
      user_id uuid,
      client_name text,
      client_email text,
      client_phone text,
      date date not null,
      start_minutes integer not null,
      end_minutes integer,
      duration_minutes integer not null,
      payment_status text,
      status text not null default 'confirmed',
      notes text,
      cancelled_at timestamptz,
      cancelled_by text,
      cancellation_window text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.booking_holds (
      id uuid primary key default gen_random_uuid(),
      date date not null,
      start_minutes integer not null,
      duration_minutes integer not null,
      buffer_minutes integer not null default 60,
      expires_at timestamptz not null default now() + interval '10 minutes',
      released_at timestamptz
    );

    create function public.booking_app_notes_json(booking_notes text)
    returns jsonb
    language plpgsql
    immutable
    set search_path = public, pg_temp
    as $notes_json$
    begin
      if booking_notes is null or trim(booking_notes) = '' then
        return '{}'::jsonb;
      end if;
      return booking_notes::jsonb;
    exception
      when others then
        return '{}'::jsonb;
    end;
    $notes_json$;

    create function public.booking_reference_from_notes(booking_notes text)
    returns text
    language sql
    immutable
    set search_path = public, pg_temp
    as $reference_from_notes$
      select coalesce(
        nullif(trim(public.booking_app_notes_json(booking_notes) #>> '{appBooking,bookingReference}'), ''),
        nullif(trim(public.booking_app_notes_json(booking_notes) #>> '{appBooking,paymentReference}'), '')
      )
    $reference_from_notes$;

    create function public.current_user_is_booking_admin()
    returns boolean
    language sql
    security definer
    set search_path = public
    stable
    as $admin_check$
      select coalesce(is_admin, false) from public.test_context limit 1
    $admin_check$;

    create function public.cancel_client_booking(booking_id uuid)
    returns public.bookings
    language sql
    security definer
    set search_path = public
    as $cancel_client$
      select * from public.bookings where id = booking_id limit 1
    $cancel_client$;

    create function public.create_admin_personal_event(booking_payload jsonb)
    returns public.bookings
    language plpgsql
    security definer
    set search_path = public
    as $personal_event$
    begin
      if not public.current_user_is_booking_admin() then
        raise exception 'Only booking admins may create personal events.' using errcode = '42501';
      end if;
      return null;
    end;
    $personal_event$;

    create function public.update_secure_booking(booking_payload jsonb)
    returns public.bookings
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $update_booking$
    begin
      if not public.current_user_is_booking_admin() then
        raise exception 'Only booking admins may update bookings.' using errcode = '42501';
      end if;
      return null;
    end;
    $update_booking$;

    create function public.get_public_booking_blocks(start_date date, end_date date)
    returns table (
      booking_id uuid,
      date date,
      start_minutes integer,
      duration_minutes integer,
      buffer_minutes integer
    )
    language sql
    security definer
    set search_path = public, pg_temp
    stable
    as $old_availability$
      select b.id, b.date, b.start_minutes, b.duration_minutes, 60
      from public.bookings b
      where b.date between start_date and end_date
    $old_availability$;

    grant execute on function public.current_user_is_booking_admin() to anon, authenticated;
    grant execute on function public.cancel_client_booking(uuid) to anon, authenticated;
    grant execute on function public.create_admin_personal_event(jsonb) to anon, authenticated;
    grant execute on function public.update_secure_booking(jsonb) to anon, authenticated;
    grant execute on function public.get_public_booking_blocks(date, date) to anon, authenticated;
  `);

  assert.equal(await canExecute("anon", "public.current_user_is_booking_admin()"), true);
  assert.equal(await canExecute("anon", "public.cancel_client_booking(uuid)"), true);
  assert.equal(
    (await queryOne("select to_regclass('public.client_telegram_links') is null as missing")).missing,
    true,
    "Production-mismatch fixture starts without Telegram link table"
  );
  assert.equal(
    (await queryOne("select to_regprocedure('public.cancel_recent_booking_request(uuid, text)') is null as missing")).missing,
    true,
    "Production-mismatch fixture starts without recent cancellation RPC"
  );

  const preflight = await db.query(preflightSql);
  assert.ok(preflight.rows.some((row) => row.check_name === "client_telegram_links_table" && row.status === "REQUIRED"));
  assert.ok(preflight.rows.some((row) => row.check_name === "cancel_recent_booking_request_signature" && row.status === "REQUIRED"));
  assert.ok(preflight.rows.some((row) => row.check_name === "link_telegram_chat_to_booking_signature" && row.status === "REQUIRED"));
  assert.ok(preflight.rows.some((row) => row.check_name === "availability_hold_aware_definition" && row.status === "REQUIRED"));

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  assert.equal(
    (await queryOne("select to_regclass('public.client_telegram_links') is not null as exists")).exists,
    true,
    "Telegram link table is created"
  );
  assert.equal(await canExecute("anon", "public.cancel_client_booking(uuid)"), false);
  assert.equal(await canExecute("anon", "public.create_admin_personal_event(jsonb)"), false);
  assert.equal(await canExecute("anon", "public.current_user_is_booking_admin()"), false);
  assert.equal(await canExecute("anon", "public.update_secure_booking(jsonb)"), false);
  assert.equal(await canExecute("authenticated", "public.cancel_client_booking(uuid)"), true);
  assert.equal(await canExecute("authenticated", "public.create_admin_personal_event(jsonb)"), true);
  assert.equal(await canExecute("authenticated", "public.current_user_is_booking_admin()"), true);
  assert.equal(await canExecute("authenticated", "public.update_secure_booking(jsonb)"), true);
  assert.equal(await canExecute("anon", "public.cancel_recent_booking_request(uuid, text)"), true);
  assert.equal(await canExecute("anon", "public.link_telegram_chat_to_booking(jsonb)"), true);

  await db.exec(`
    insert into public.bookings (
      id, booking_reference, payment_reference, client_name, client_email, client_phone,
      date, start_minutes, end_minutes, duration_minutes, payment_status, status, notes
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      'VDM-TEST',
      'VDM-TEST',
      'Test Client',
      'client@example.com',
      '07123456789',
      '2099-08-06',
      600,
      660,
      60,
      'awaiting_verification',
      'pending_payment_verification',
      'Plain text legacy note'
    );

    insert into public.booking_holds (id, date, start_minutes, duration_minutes, buffer_minutes, expires_at, released_at)
    values ('22222222-2222-4222-8222-222222222222', '2099-08-06', 720, 60, 60, now() + interval '10 minutes', null);
  `);

  const availability = await db.query(`
    select booking_id::text, buffer_minutes
    from public.get_public_booking_blocks('2099-08-06'::date, '2099-08-06'::date)
    order by start_minutes
  `);
  assert.deepEqual(
    availability.rows.map((row) => [row.booking_id, Number(row.buffer_minutes)]),
    [
      ["11111111-1111-4111-8111-111111111111", 60],
      ["22222222-2222-4222-8222-222222222222", 60],
    ],
    "Availability is hold-aware and safe with plain-text notes"
  );

  const telegramLink = await queryOne(`
    select public.link_telegram_chat_to_booking($$
      {
        "booking_reference": "VDM-TEST",
        "chat_id": "123456789",
        "chat_type": "private",
        "telegram_user_id": "987654321",
        "username": "clientname"
      }
    $$::jsonb) as result
  `);
  assert.equal(telegramLink.result.linked, true, "Telegram link RPC returns linked result");

  const recentCancel = await queryOne(`
    select id::text, status, payment_status
    from public.cancel_recent_booking_request('11111111-1111-4111-8111-111111111111'::uuid, 'VDM-TEST')
  `);
  assert.equal(recentCancel.status, "cancelled", "Recent cancellation RPC cancels a valid fresh booking");

  const postVerification = await db.query(postVerificationSql);
  assert.deepEqual(
    postVerification.rows.map((row) => row.status),
    postVerification.rows.map(() => "PASS"),
    "Post-verification passes after reconciliation"
  );

  console.log("Remaining production reconciliation migration tests passed.");
} finally {
  await db.close();
}
