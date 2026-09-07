import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setSupabaseClientFactory } from "./bookingSupabase.js";
import {
  BUSINESS_WORKING_HOURS_OVERRIDES_TABLE,
  BUSINESS_WORKING_HOURS_TABLE,
  cacheWeeklyWorkingSchedule,
  deleteWorkingHoursOverrideFromSupabase,
  loadAndCacheWeeklyWorkingScheduleFromSupabase,
  loadWorkingHoursOverridesFromSupabase,
  loadWeeklyWorkingScheduleFromSupabase,
  readCachedWeeklyWorkingSchedule,
  saveWorkingHoursOverrideToSupabase,
  saveWeeklyWorkingScheduleToSupabase,
} from "./workingHoursSupabase.js";
import {
  defaultWeeklyWorkingSchedule,
  normalizeWeeklyWorkingSchedule,
} from "./weeklyWorkingSchedule.js";

const migrationSql = await readFile(
  new URL("../../supabase/migrations/20260901120000_create_business_working_hours.sql", import.meta.url),
  "utf8"
);
const overridesMigrationSql = await readFile(
  new URL("../../supabase/migrations/20260902120000_create_business_working_hours_overrides.sql", import.meta.url),
  "utf8"
);

function createQueryBuilder({ rows = [], error = null, capture = null } = {}) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    upsert(payload) {
      capture?.(payload);
      return builder;
    },
    delete() {
      capture?.({ deleted: true });
      return builder;
    },
    then(resolve) {
      return Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(resolve);
    },
    async maybeSingle() {
      return error ? { data: null, error } : { data: rows[0] || null, error: null };
    },
    async single() {
      return error ? { data: null, error } : { data: rows[0] || null, error: null };
    },
  };
  return builder;
}

function installFakeSupabase({ rows = [], error = null, capture = null } = {}) {
  const calls = [];
  setSupabaseClientFactory(async () => ({
    from(tableName) {
      calls.push(tableName);
      assert([BUSINESS_WORKING_HOURS_TABLE, BUSINESS_WORKING_HOURS_OVERRIDES_TABLE].includes(tableName));
      return createQueryBuilder({ rows, error, capture });
    },
  }));
  return calls;
}

async function queryOne(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function canTablePrivilege(db, roleName, privilege) {
  const row = await queryOne(
    db,
    "select has_table_privilege($1::text, $2::text, $3::text) as allowed",
    [roleName, "public.business_working_hours", privilege]
  );
  return row.allowed;
}

async function canOverrideTablePrivilege(db, roleName, privilege) {
  const row = await queryOne(
    db,
    "select has_table_privilege($1::text, $2::text, $3::text) as allowed",
    [roleName, "public.business_working_hours_overrides", privilege]
  );
  return row.allowed;
}

const defaults = defaultWeeklyWorkingSchedule();
const remoteSchedule = normalizeWeeklyWorkingSchedule({
  ...defaults,
  Mon: { ...defaults.Mon, workingStart: "11:00", workingEnd: "17:00" },
  Wed: { ...defaults.Wed, unavailable: true },
});

{
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };

  const staleLocalSchedule = normalizeWeeklyWorkingSchedule({
    ...defaults,
    Mon: { ...defaults.Mon, workingStart: "09:00", workingEnd: "18:00" },
  });
  cacheWeeklyWorkingSchedule(staleLocalSchedule);
  assert.equal(readCachedWeeklyWorkingSchedule().Mon.workingStart, "09:00", "local cache can contain stale hours");

  installFakeSupabase({
    rows: [{ schedule: remoteSchedule, updated_at: "2026-09-01T10:00:00.000Z" }],
  });
  const result = await loadAndCacheWeeklyWorkingScheduleFromSupabase();
  assert.equal(result.schedule.Mon.workingStart, "11:00", "Supabase wins over stale localStorage");
  assert.equal(readCachedWeeklyWorkingSchedule().Mon.workingStart, "11:00", "successful remote read refreshes local cache");

  installFakeSupabase({ error: { code: "503", message: "temporarily unavailable" } });
  await assert.rejects(
    () => loadAndCacheWeeklyWorkingScheduleFromSupabase(),
    /Working Hours could not be loaded/,
    "failed remote read is surfaced"
  );
  assert.equal(
    readCachedWeeklyWorkingSchedule().Mon.workingStart,
    "11:00",
    "failed remote read does not replace cache with defaults"
  );

  const editedSchedule = normalizeWeeklyWorkingSchedule({
    ...remoteSchedule,
    Mon: { ...remoteSchedule.Mon, workingStart: "12:30", workingEnd: "16:30" },
  });
  installFakeSupabase({ error: { code: "42501", message: "permission denied" } });
  await assert.rejects(
    () => saveWeeklyWorkingScheduleToSupabase(editedSchedule),
    /Working Hours could not be saved: permission denied/,
    "failed remote save is surfaced"
  );
  assert.equal(
    readCachedWeeklyWorkingSchedule().Mon.workingStart,
    "11:00",
    "failed remote save does not replace the last confirmed cached schedule"
  );

  installFakeSupabase({
    rows: [{ schedule: editedSchedule, updated_at: "2026-09-01T10:02:00.000Z" }],
  });
  await saveWeeklyWorkingScheduleToSupabase(editedSchedule);
  assert.equal(readCachedWeeklyWorkingSchedule().Mon.workingStart, "12:30", "successful save refreshes cache");
  assert.equal(readCachedWeeklyWorkingSchedule().Mon.workingEnd, "16:30", "custom saved end time remains exact");

  const overrideDate = "2026-09-10";
  const overrideSettings = {
    fixedStart: "12:00",
    mode: "flexible",
    startMode: "flexible",
    unavailable: false,
    workingEnd: "16:00",
    workingStart: "12:00",
  };
  installFakeSupabase({
    rows: [{ override_date: overrideDate, settings: overrideSettings, updated_at: "2026-09-01T10:03:00.000Z" }],
  });
  const loadedOverrides = await loadWorkingHoursOverridesFromSupabase("2026-09-01", "2026-09-30", editedSchedule);
  assert.equal(loadedOverrides[overrideDate].workingStart, "12:00", "override survives simulated reload from Supabase");

  let savedPayload = null;
  installFakeSupabase({
    capture: (payload) => {
      savedPayload = payload;
    },
    rows: [{ override_date: overrideDate, settings: overrideSettings, updated_at: "2026-09-01T10:04:00.000Z" }],
  });
  const savedOverride = await saveWorkingHoursOverrideToSupabase(overrideDate, overrideSettings, editedSchedule);
  assert.equal(savedOverride.hasDateOverride, true, "saving different date settings keeps CUSTOM state");
  assert.equal(savedPayload.override_date, overrideDate, "override is upserted by plain date");
  assert.equal(savedPayload.settings.workingStart, "12:00", "override payload stores supported fields");
  assert.equal(Object.prototype.hasOwnProperty.call(savedPayload.settings, "releaseTime"), false, "releaseTime is not part of date override payload");

  let deletePayload = null;
  installFakeSupabase({
    capture: (payload) => {
      deletePayload = payload;
    },
  });
  const inherited = await saveWorkingHoursOverrideToSupabase(overrideDate, editedSchedule.Thu, editedSchedule);
  assert.equal(inherited.hasDateOverride, false, "redundant override equal to weekly is deleted/no-op");
  assert.deepEqual(deletePayload, { deleted: true }, "redundant override uses delete path");

  installFakeSupabase({ error: { code: "42501", message: "permission denied" } });
  await assert.rejects(
    () => saveWorkingHoursOverrideToSupabase(overrideDate, overrideSettings, editedSchedule),
    /Date override could not be saved: permission denied/,
    "failed override save is surfaced"
  );
  await assert.rejects(
    () => deleteWorkingHoursOverrideFromSupabase(overrideDate),
    /Date override could not be deleted: permission denied/,
    "failed override delete is surfaced"
  );

  installFakeSupabase();
  const deleted = await deleteWorkingHoursOverrideFromSupabase(overrideDate);
  assert.equal(deleted.hasDateOverride, false, "delete override returns inherited state");
  delete globalThis.window;
}

{
  const calls = installFakeSupabase({
    rows: [{ schedule: remoteSchedule, updated_at: "2026-09-01T10:00:00.000Z" }],
  });
  const result = await loadWeeklyWorkingScheduleFromSupabase();
  assert.equal(result.status, "found");
  assert.equal(result.schedule.Mon.workingStart, "11:00", "remote schedule wins over defaults");
  assert.equal(result.schedule.Wed.unavailable, true, "disabled remote weekday remains disabled");
  assert.deepEqual(calls, [BUSINESS_WORKING_HOURS_TABLE]);
}

{
  installFakeSupabase({ rows: [] });
  const result = await loadWeeklyWorkingScheduleFromSupabase();
  assert.equal(result.status, "missing", "missing remote setting is explicit");
  assert.equal(result.schedule, null, "missing remote setting does not fabricate a remote schedule");
}

{
  let savedPayload = null;
  installFakeSupabase({
    rows: [{ schedule: remoteSchedule, updated_at: "2026-09-01T10:01:00.000Z" }],
    capture: (payload) => {
      savedPayload = payload;
    },
  });
  const result = await saveWeeklyWorkingScheduleToSupabase(remoteSchedule);
  assert.equal(savedPayload.id, true, "save targets the single authoritative row");
  assert.equal(savedPayload.schedule.Mon.workingStart, "11:00", "save writes the normalized schedule");
  assert.equal(result.schedule.Mon.workingEnd, "17:00", "save returns the persisted schedule");
}

{
  installFakeSupabase({ error: { code: "42501", message: "permission denied" } });
  await assert.rejects(
    () => saveWeeklyWorkingScheduleToSupabase(remoteSchedule),
    /Working Hours could not be saved: permission denied/,
    "failed remote save surfaces an error"
  );
}

{
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table public.test_context (
        user_id uuid,
        is_admin boolean not null default false
      );
      insert into public.test_context (user_id, is_admin)
      values ('11111111-1111-4111-8111-111111111111', false);

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
      security definer
      set search_path = public
      stable
      as $admin_check$
        select coalesce(is_admin, false) from public.test_context limit 1
      $admin_check$;
    `);

    await db.exec(migrationSql);
    await db.exec(overridesMigrationSql);
    await db.exec(overridesMigrationSql);

    assert.equal(
      (await queryOne(db, "select to_regclass('public.business_working_hours') is not null as exists")).exists,
      true,
      "migration creates the business working hours table"
    );
    assert.equal(await canTablePrivilege(db, "anon", "SELECT"), true, "clients can read working hours");
    assert.equal(await canTablePrivilege(db, "anon", "UPDATE"), false, "anon cannot update working hours");
    assert.equal(await canTablePrivilege(db, "authenticated", "SELECT"), true, "authenticated users can read working hours");
    assert.equal(await canTablePrivilege(db, "authenticated", "UPDATE"), true, "authenticated admin policy can authorize updates");
    assert.equal(await canOverrideTablePrivilege(db, "anon", "SELECT"), true, "clients can read date overrides");
    assert.equal(await canOverrideTablePrivilege(db, "anon", "UPDATE"), false, "anon cannot update date overrides");
    assert.equal(await canOverrideTablePrivilege(db, "authenticated", "DELETE"), true, "authenticated admin policy can authorize override deletes");

    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query(
        "insert into public.business_working_hours (id, schedule) values (true, $1::jsonb)",
        [JSON.stringify(remoteSchedule)]
      ),
      /violates row-level security|new row violates row-level security|permission denied/,
      "non-admin authenticated users cannot create the authoritative schedule"
    );
    await db.exec("reset role");

    await db.exec("reset role; update public.test_context set is_admin = true");
    await db.exec("set role authenticated");
    await db.query(
      `insert into public.business_working_hours (id, schedule)
       values (true, $1::jsonb)
       on conflict (id) do update set schedule = excluded.schedule`,
      [JSON.stringify(remoteSchedule)]
    );
    await db.exec("reset role");

    const stored = await queryOne(db, "select schedule from public.business_working_hours where id = true");
    assert.equal(stored.schedule.Mon.workingStart, "11:00", "admin can persist custom working hours");

    await db.query(
      `insert into public.business_working_hours_overrides (override_date, settings)
       values ('2026-09-10'::date, $1::jsonb)
       on conflict (override_date) do update set settings = excluded.settings`,
      [JSON.stringify({ fixedStart: "12:00", mode: "flexible", startMode: "flexible", unavailable: false, workingEnd: "16:00", workingStart: "12:00" })]
    );
    await db.query(
      `insert into public.business_working_hours_overrides (override_date, settings)
       values ('2026-09-10'::date, $1::jsonb)
       on conflict (override_date) do update set settings = excluded.settings`,
      [JSON.stringify({ fixedStart: "13:00", mode: "flexible", startMode: "flexible", unavailable: false, workingEnd: "17:00", workingStart: "13:00" })]
    );
    const overrideCount = await queryOne(db, "select count(*)::integer as count from public.business_working_hours_overrides where override_date = '2026-09-10'::date");
    assert.equal(overrideCount.count, 1, "duplicate override saves do not create duplicate rows");
  } finally {
    await db.close();
  }
}

setSupabaseClientFactory(async () => {
  throw new Error("Supabase factory was not reset by the test.");
});

console.log("Working Hours Supabase persistence tests passed.");
