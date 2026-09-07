import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setSupabaseClientFactory } from "./bookingSupabase.js";
import { ENHANCEMENTS_STORAGE_KEY, STORAGE_VERSION } from "../config/storageKeys.js";
import {
  BUSINESS_ENHANCEMENT_CATALOGUE_TABLE,
  BUSINESS_ENHANCEMENTS_TABLE,
  cacheEnhancements,
  enhancementSeedForUninitializedSupabase,
  loadAndCacheEnhancementsFromSupabase,
  loadEnhancementsFromSupabase,
  readCachedEnhancements,
  saveEnhancementsToSupabase,
} from "./enhancementSupabase.js";
import { DEFAULT_ENHANCEMENTS } from "./enhancementSettings.js";

const migrationSql = await readFile(
  new URL("../../supabase/migrations/20260902130000_create_business_enhancements.sql", import.meta.url),
  "utf8"
);
const replacementDeleteRepairSql = await readFile(
  new URL("../../supabase/migrations/20260903120000_fix_business_enhancements_replace_delete.sql", import.meta.url),
  "utf8"
);

function installLocalStorage(initialEntries = []) {
  const storage = new Map(initialEntries);
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  return storage;
}

function storagePayload(data) {
  return JSON.stringify({ version: STORAGE_VERSION, data });
}

function rowFromEnhancement(enhancement, index = 0) {
  return {
    active: enhancement.active !== false,
    description: enhancement.description,
    display_order: index,
    duration_minutes: enhancement.durationMinutes,
    id: enhancement.id,
    name: enhancement.name,
    price: enhancement.price,
    updated_at: "2026-09-02T10:00:00.000Z",
  };
}

function createTableBuilder({ rows = [], error = null } = {}) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    async maybeSingle() {
      return error ? { data: null, error } : { data: rows[0] || null, error: null };
    },
    then(resolve) {
      return Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(resolve);
    },
  };
  return builder;
}

function installFakeSupabase({ catalogueRows = [], enhancementRows = [], rpcRows = [], error = null, captureRpc = null } = {}) {
  const calls = [];
  setSupabaseClientFactory(async () => ({
    from(tableName) {
      calls.push(["from", tableName]);
      assert([BUSINESS_ENHANCEMENT_CATALOGUE_TABLE, BUSINESS_ENHANCEMENTS_TABLE].includes(tableName));
      return createTableBuilder({
        error,
        rows: tableName === BUSINESS_ENHANCEMENT_CATALOGUE_TABLE ? catalogueRows : enhancementRows,
      });
    },
    async rpc(functionName, payload) {
      calls.push(["rpc", functionName]);
      assert.equal(functionName, "replace_business_enhancements");
      captureRpc?.(payload);
      return error ? { data: null, error } : { data: rpcRows, error: null };
    },
  }));
  return calls;
}

async function queryOne(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ?? null;
}

async function canTablePrivilege(db, roleName, tableName, privilege) {
  const row = await queryOne(
    db,
    "select has_table_privilege($1::text, $2::text, $3::text) as allowed",
    [roleName, tableName, privilege]
  );
  return row.allowed;
}

async function canFunctionPrivilege(db, roleName, signature, privilege = "EXECUTE") {
  const row = await queryOne(
    db,
    "select has_function_privilege($1::text, $2::regprocedure, $3::text) as allowed",
    [roleName, signature, privilege]
  );
  return row.allowed;
}

{
  const localCatalogue = [
    { ...DEFAULT_ENHANCEMENTS[0], active: false, name: "Local hidden head massage", price: 22 },
  ];
  installLocalStorage([[ENHANCEMENTS_STORAGE_KEY, storagePayload(localCatalogue)]]);
  const remoteCatalogue = [
    { ...DEFAULT_ENHANCEMENTS[1], active: true, name: "Remote hot stones", price: 30 },
  ];
  installFakeSupabase({
    catalogueRows: [{ id: true, initialized_at: "2026-09-02T09:00:00.000Z", updated_at: "2026-09-02T09:00:00.000Z" }],
    enhancementRows: remoteCatalogue.map(rowFromEnhancement),
  });

  const result = await loadAndCacheEnhancementsFromSupabase({ includeHidden: true });
  assert.equal(result.status, "found", "server catalogue is found");
  assert.equal(result.enhancements[0].name, "Remote hot stones", "server catalogue wins over localStorage");
  assert.equal(readCachedEnhancements().enhancements[0].name, "Remote hot stones", "cache is refreshed from server");
}

{
  installLocalStorage([[ENHANCEMENTS_STORAGE_KEY, storagePayload([])]]);
  installFakeSupabase({ catalogueRows: [] });
  const result = await loadEnhancementsFromSupabase({ includeHidden: true });
  assert.equal(result.status, "missing", "uninitialized server is explicit");
  assert.equal(result.enhancements, null, "missing server does not fabricate defaults");
  assert.deepEqual(enhancementSeedForUninitializedSupabase().enhancements, [], "empty localStorage catalogue is a valid migration seed");
}

{
  const hiddenCatalogue = [
    { ...DEFAULT_ENHANCEMENTS[0], active: false, name: "Hidden head massage", price: 22 },
    { ...DEFAULT_ENHANCEMENTS[1], active: true, name: "Custom hot stones", description: "Warm stones.", price: 28 },
  ];
  let capturedPayload = null;
  installFakeSupabase({
    captureRpc: (payload) => {
      capturedPayload = payload;
    },
    rpcRows: hiddenCatalogue.map(rowFromEnhancement),
  });

  const result = await saveEnhancementsToSupabase(hiddenCatalogue);
  assert.equal(capturedPayload.enhancements_payload[0].active, false, "active false is sent to Supabase");
  assert.equal(capturedPayload.enhancements_payload[1].name, "Custom hot stones", "custom name is sent to Supabase");
  assert.equal(result.enhancements[0].active, false, "active false survives database round-trip");
  assert.equal(result.enhancements[1].price, 28, "custom price survives database round-trip");
}

{
  installFakeSupabase({ error: { code: "42501", message: "permission denied" } });
  await assert.rejects(
    () => saveEnhancementsToSupabase(DEFAULT_ENHANCEMENTS),
    /Enhancements could not be saved: permission denied/,
    "admin persistence failure is surfaced"
  );
}

{
  installLocalStorage();
  const seed = enhancementSeedForUninitializedSupabase();
  assert.equal(seed.source, "defaults", "defaults are only used when no cached catalogue exists");
  assert.deepEqual(seed.enhancements, DEFAULT_ENHANCEMENTS);
  cacheEnhancements([]);
  assert.deepEqual(readCachedEnhancements().enhancements, [], "cached empty catalogue remains empty");
}

delete globalThis.window;

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
    await db.exec(migrationSql);
    await db.exec(replacementDeleteRepairSql);
    await db.exec(replacementDeleteRepairSql);

    assert.equal(
      (await queryOne(db, "select to_regclass('public.business_enhancements') is not null as exists")).exists,
      true,
      "migration creates the enhancement table"
    );
    assert.equal(
      (await queryOne(db, "select to_regclass('public.business_enhancement_catalogue') is not null as exists")).exists,
      true,
      "migration creates the catalogue metadata table"
    );
    assert.equal(await canTablePrivilege(db, "anon", "public.business_enhancements", "SELECT"), true, "public clients can read enhancement rows");
    assert.equal(await canTablePrivilege(db, "anon", "public.business_enhancements", "UPDATE"), false, "public clients cannot update enhancement rows");
    assert.equal(await canTablePrivilege(db, "authenticated", "public.business_enhancements", "UPDATE"), false, "authenticated users do not get direct table updates");
    assert.equal(await canFunctionPrivilege(db, "public", "public.replace_business_enhancements(jsonb)"), false, "PUBLIC cannot execute replacement RPC");
    assert.equal(await canFunctionPrivilege(db, "anon", "public.replace_business_enhancements(jsonb)"), false, "anon cannot execute replacement RPC");
    assert.equal(await canFunctionPrivilege(db, "authenticated", "public.replace_business_enhancements(jsonb)"), true, "authenticated can call admin-authorized RPC");
    assert.equal(await canFunctionPrivilege(db, "public", "public.set_business_enhancements_updated_at()"), false, "trigger helper is not publicly executable");
    assert.doesNotMatch(
      replacementDeleteRepairSql.toLowerCase(),
      /delete\s+from\s+public\.business_enhancements\s*;/,
      "repair migration must not use the unqualified DELETE rejected by production"
    );
    assert.match(
      replacementDeleteRepairSql.toLowerCase(),
      /delete\s+from\s+public\.business_enhancements\s+as\s+existing[\s\S]*where\s+not\s+exists/,
      "repair migration scopes replacement deletion to rows absent from the replacement payload"
    );

    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select * from public.replace_business_enhancements($1::jsonb)", [JSON.stringify(DEFAULT_ENHANCEMENTS)]),
      /Only booking admins can update enhancements|permission denied/,
      "non-admin authenticated users cannot update enhancement configuration"
    );
    await db.exec("reset role");

    await db.exec("update public.test_context set is_admin = true");
    await db.exec("set role authenticated");
    const saved = await db.query("select * from public.replace_business_enhancements($1::jsonb)", [
      JSON.stringify([
        { ...DEFAULT_ENHANCEMENTS[0], active: false, name: "Hidden head massage", price: 25 },
        { ...DEFAULT_ENHANCEMENTS[1], active: true, name: "Server hot stones", description: "Durable warm stones.", price: 31 },
      ]),
    ]);
    assert.equal(saved.rows.length, 2, "admin replacement returns saved rows");
    await db.exec("reset role");

    const storedHidden = await queryOne(
      db,
      "select active, name, price::text as price from public.business_enhancements where id = 'head-massage'"
    );
    assert.equal(storedHidden.active, false, "active false is stored durably");
    assert.equal(storedHidden.name, "Hidden head massage", "custom name is stored durably");
    assert.equal(storedHidden.price, "25.00", "custom price is stored durably");

    await db.exec("set role authenticated");
    const replaced = await db.query("select * from public.replace_business_enhancements($1::jsonb)", [
      JSON.stringify([
        { ...DEFAULT_ENHANCEMENTS[0], active: true, name: "Updated head massage", price: 19 },
      ]),
    ]);
    assert.equal(replaced.rows.length, 1, "replacement returns the new catalogue only");
    await db.exec("reset role");

    const replacedRows = await db.query(
      "select id, name, display_order from public.business_enhancements order by display_order, name"
    );
    assert.deepEqual(
      replacedRows.rows,
      [{ id: DEFAULT_ENHANCEMENTS[0].id, name: "Updated head massage", display_order: 0 }],
      "replacement updates payload rows and removes rows omitted from the payload"
    );

    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select * from public.replace_business_enhancements($1::jsonb)", [
        JSON.stringify([
          { ...DEFAULT_ENHANCEMENTS[0], name: "Duplicate first" },
          { ...DEFAULT_ENHANCEMENTS[0], name: "Duplicate second" },
        ]),
      ]),
      /Enhancement ids must be unique/,
      "duplicate enhancement ids are rejected before replacement"
    );
    await db.exec("reset role");

    const publicReadPolicy = await queryOne(
      db,
      `select qual
       from pg_policies
       where schemaname = 'public'
         and tablename = 'business_enhancements'
         and policyname = 'Clients can read active enhancements'`
    );
    assert.match(
      publicReadPolicy.qual,
      /active = true|active\)/i,
      "public read policy limits client enhancement rows to active entries"
    );
    const adminReadPolicy = await queryOne(
      db,
      `select qual
       from pg_policies
       where schemaname = 'public'
         and tablename = 'business_enhancements'
         and policyname = 'Booking admins can read all enhancements'`
    );
    assert.match(
      adminReadPolicy.qual,
      /current_user_is_booking_admin/i,
      "separate authenticated admin policy can read hidden enhancements"
    );

    await db.exec("set role anon");
    await assert.rejects(
      () => db.query(
        "insert into public.business_enhancements (id, name) values ('public-edit', 'Public edit')"
      ),
      /permission denied|violates row-level security/,
      "public clients cannot modify enhancement configuration"
    );
    await db.exec("reset role");

    await db.exec("set role authenticated");
    await db.query("select * from public.replace_business_enhancements('[]'::jsonb)");
    await db.exec("reset role");
    assert.equal(
      (await queryOne(db, "select count(*)::integer as count from public.business_enhancements")).count,
      0,
      "empty persisted catalogue remains empty"
    );
    assert.equal(
      (await queryOne(db, "select count(*)::integer as count from public.business_enhancement_catalogue")).count,
      1,
      "empty catalogue is still marked initialized"
    );
  } finally {
    await db.close();
  }
}

setSupabaseClientFactory(async () => {
  throw new Error("Supabase factory was not reset by the test.");
});
delete globalThis.window;

console.log("Enhancement Supabase persistence tests passed.");
