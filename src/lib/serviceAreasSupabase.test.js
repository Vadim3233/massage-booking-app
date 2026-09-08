import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { setSupabaseClientFactory } from "./bookingSupabase.js";
import { loadServiceAreasFromSupabase, saveServiceAreasToSupabase } from "./serviceAreasSupabase.js";
import { createAreaSettingsState, areaSettingsReducer, areaSettingsDirty } from "./serviceAreaSettingsState.js";

const initial = [{ id: "mayfair", name: "Mayfair", active: true, custom: false, travelSurcharge: 15, congestionFee: 20 },
 { id: "chelsea", name: "Chelsea", active: true, custom: false, travelSurcharge: 0, congestionFee: 0 },
 { id: "custom", name: "Custom", active: false, custom: true, travelSurcharge: 5, congestionFee: 0 }];
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    create table public.test_admin(value boolean); insert into public.test_admin values(false);
    create function public.current_user_is_booking_admin() returns boolean language sql security definer
    set search_path = public as 'select value from public.test_admin limit 1';`);
  await db.exec(readFileSync(new URL("../../supabase/migrations/20260908120000_create_business_service_areas.sql", import.meta.url), "utf8"));
  // Exercise helpers against the actual migration and PostgreSQL policies.
  let failure = false;
  setSupabaseClientFactory(async () => ({
    from(table) {
      assert.ok(["business_service_areas", "business_service_area_catalogue"].includes(table));
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        async maybeSingle() { const result = await db.query(`select * from public.${table}`); return { data: result.rows[0] || null }; },
        then(resolve, reject) { return db.query(`select * from public.${table} order by display_order`).then((result) => ({ data: result.rows })).then(resolve, reject); },
      }; return query;
    },
    async rpc(name, args) {
      assert.equal(name, "replace_business_service_areas");
      if (failure) return { error: { message: "Network failed" } };
      try { return { data: (await db.query("select * from public.replace_business_service_areas($1::jsonb)", [JSON.stringify(args.areas_payload)])).rows }; }
      catch (error) { return { error }; }
    },
  }));
  assert.deepEqual(await loadServiceAreasFromSupabase(), { initialized: false, areas: [] });
  await db.exec("set role anon");
  await assert.rejects(() => db.query("select * from public.replace_business_service_areas($1::jsonb)", [JSON.stringify(initial)]), /permission denied/);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(() => saveServiceAreasToSupabase(initial), /could not be saved/);
  await assert.rejects(() => db.exec("delete from public.business_service_areas where true"), /permission denied/);
  await db.exec("reset role; update public.test_admin set value = true; set role authenticated");
  const saved = await saveServiceAreasToSupabase(initial);
  assert.deepEqual(saved, initial);
  assert.deepEqual((await loadServiceAreasFromSupabase({ includeHidden: true })).areas, initial);
  const edited = initial.map((area) => area.id === "mayfair" ? { ...area, name: "Mayfair central", travelSurcharge: 17.50, congestionFee: 22 } : area);
  assert.deepEqual(await saveServiceAreasToSupabase(edited), edited);
  assert.deepEqual((await loadServiceAreasFromSupabase({ includeHidden: true })).areas, edited);
  failure = true;
  await assert.rejects(() => saveServiceAreasToSupabase(initial), /could not be saved/);
  assert.deepEqual((await loadServiceAreasFromSupabase({ includeHidden: true })).areas, edited);
  failure = false;
  await assert.rejects(() => db.query("select * from public.replace_business_service_areas($1::jsonb)", [JSON.stringify([{ ...initial[0], congestionFee: -1 }])]), /check constraint/);
  assert.deepEqual((await loadServiceAreasFromSupabase({ includeHidden: true })).areas, edited, "invalid replacement rolls back deletion and writes");
  await db.exec("reset role; set role anon");
  assert.deepEqual((await loadServiceAreasFromSupabase()).areas, edited.filter((a) => a.active));
  await db.exec("reset role; set role authenticated");
  await saveServiceAreasToSupabase([]);
  assert.deepEqual(await loadServiceAreasFromSupabase(), { initialized: true, areas: [] });
} finally { setSupabaseClientFactory(null); await db.close(); }

let state = createAreaSettingsState(initial);
assert.deepEqual(state.areas, [], "browser cache is not authoritative");
state = areaSettingsReducer(state, { type: "loaded", areas: initial, initialized: true });
assert.equal(areaSettingsDirty(state), false);
const refreshing = areaSettingsReducer(state, { type: "loading" });
assert.equal(refreshing.ready, true, "background refresh must not remove areas and reset an in-progress booking");
assert.deepEqual(refreshing.areas, initial);
const draft = initial.map((a) => ({ ...a, congestionFee: 42 }));
state = areaSettingsReducer(state, { type: "edit", update: draft });
assert.equal(areaSettingsDirty(state), true);
assert.deepEqual(state.areas, initial, "unsaved edits cannot alter client prices");
state = areaSettingsReducer(state, { type: "loaded", areas: initial, initialized: true });
assert.deepEqual(state.draft, initial, "refresh before save discards the unsaved draft");
assert.equal(areaSettingsDirty(state), false);
state = areaSettingsReducer(state, { type: "edit", update: draft });
state = areaSettingsReducer(state, { type: "saving" });
assert.equal(state.saving, true);
assert.notEqual(state.type, "success");
state = areaSettingsReducer(state, { type: "failed", message: "Save failed" });
assert.equal(state.type, "error");
assert.deepEqual(state.areas, initial);
assert.deepEqual(state.draft, draft);
state = areaSettingsReducer(state, { type: "saved", areas: draft });
assert.equal(state.type, "success");
assert.equal(areaSettingsDirty(state), false);
assert.deepEqual(state.areas, draft);
console.log("Service area persistence, RLS and draft-state tests passed.");
