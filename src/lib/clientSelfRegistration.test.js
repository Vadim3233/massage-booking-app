import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { adminId, adminEmail, fixtureSql, migrationSql, validProfile } from "./testSupport/clientAccessFixture.js";

const activationSql = await readFile(new URL("../../supabase/migrations/20260908140000_enable_client_self_registration.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(fixtureSql());
await db.exec(migrationSql);
await db.exec(activationSql);
after(() => db.close());

async function user({ confirmed = true } = {}) {
  const actor = { id: randomUUID(), email: `${randomUUID()}@example.test` };
  await db.query("insert into auth.users values ($1,$2,$3)", [actor.id, actor.email, confirmed ? new Date().toISOString() : null]);
  return actor;
}
async function asActor(actor, sql, params = []) {
  return db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(actor ? { sub: actor.id, email: actor.email } : {})]);
    return tx.query(sql, params);
  });
}
async function activate(actor, profile = validProfile) {
  const result = await asActor(actor, "select public.activate_my_client_account($1) result", [profile]);
  return result.rows[0].result;
}

test("confirmed authenticated client self-activates with a complete profile", async () => {
  const actor = await user();
  assert.deepEqual(await activate(actor), { status: "ACTIVE", profile_complete: true, missing_fields: [] });
  const row = (await db.query("select status,admission_source,invitation_id from client_access_private.client_access where user_id=$1", [actor.id])).rows[0];
  assert.deepEqual(row, { status: "ACTIVE", admission_source: "SELF_REGISTRATION", invitation_id: null });
});

test("activation is idempotent and writes one activation event", async () => {
  const actor = await user();
  await activate(actor); await activate(actor);
  const result = await db.query("select count(*)::int n from client_access_private.client_access_events where user_id=$1 and event_type='ACCESS_ACTIVATED'", [actor.id]);
  assert.equal(result.rows[0].n, 1);
});

test("concurrent activation produces one ACTIVE account", async () => {
  const actor = await user();
  const results = await Promise.all([activate(actor), activate(actor)]);
  assert.ok(results.every(result => result.status === "ACTIVE"));
  const count = await db.query("select count(*)::int n from client_access_private.client_access where user_id=$1", [actor.id]);
  assert.equal(count.rows[0].n, 1);
});

test("BLOCKED account cannot self-unblock", async () => {
  const actor = await user(); await activate(actor);
  await asActor({ id: adminId, email: adminEmail }, "select public.admin_block_client($1,$2)", [actor.id, "test"]);
  await assert.rejects(activate(actor), /blocked/);
  assert.equal((await db.query("select status from client_access_private.client_access where user_id=$1", [actor.id])).rows[0].status, "BLOCKED");
});

test("unconfirmed authenticated client and Admin identity cannot activate", async () => {
  const unconfirmed = await user({ confirmed: false });
  await assert.rejects(activate(unconfirmed), /confirmed email/);
  await assert.rejects(activate({ id: adminId, email: adminEmail }), /Admin accounts/);
});

test("activation RPC is authenticated-only and legacy invitation records remain", async () => {
  const grants = await db.query(`select has_function_privilege('anon','public.activate_my_client_account(jsonb)','execute') anon_exec,
    has_function_privilege('authenticated','public.activate_my_client_account(jsonb)','execute') authenticated_exec`);
  assert.equal(grants.rows[0].anon_exec, false); assert.equal(grants.rows[0].authenticated_exec, true);
  const actor = await user(); const invitation = await asActor({ id: adminId, email: adminEmail }, "select public.admin_create_client_invitation(null,null,null) result");
  assert.ok(invitation.rows[0].result.token);
  await activate(actor);
});
