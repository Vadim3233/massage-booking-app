import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { adminId, adminEmail, validProfile, fixtureSql, migrationSql } from "./testSupport/clientAccessFixture.js";

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(fixtureSql());
await db.exec(migrationSql);
after(() => db.close());

async function user({ confirmed = true, email = `${randomUUID()}@example.test` } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1, $2, $3)", [id, email, confirmed ? new Date().toISOString() : null]);
  return { id, email };
}
const admin = { id: adminId, email: adminEmail };
function asRole(role, actor, sql, params = []) {
  assert.ok(["anon", "authenticated"].includes(role));
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(actor ? { sub: actor.id, email: actor.email } : {})]);
    return tx.query(sql, params);
  });
}
async function rpc(actor, name, params = [], role = "authenticated") {
  assert.match(name, /^[a-z_]+$/);
  const result = await asRole(role, actor, `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(",")}) as result`, params);
  return result.rows[0].result;
}
const invite = () => rpc(admin, "admin_create_client_invitation", ["Optional Name", "+447700900456", "WhatsApp referral"]);
const accept = (actor, invitation, profile = validProfile) => rpc(actor, "accept_client_invitation", [invitation.token, profile]);
async function count(table, condition = "true", params = []) {
  const result = await db.query(`select count(*)::int as n from client_access_private.${table} where ${condition}`, params);
  return result.rows[0].n;
}
async function admitted() {
  const actor = await user();
  const invitation = await invite();
  await accept(actor, invitation);
  return { actor, invitation };
}
async function expire(invitation) {
  await db.query("update client_access_private.client_invitations set created_at = now() - interval '40 days', expires_at = now() - interval '1 second' where id = $1", [invitation.id]);
}

test("migration compiles with pgcrypto in extensions and preserves anonymous booking grants", async () => {
  const r = await asRole("anon", null, "select public.create_secure_booking('{}'), public.create_secure_order('{}'), public.create_booking_hold(current_date, 600, 60, 60, 'key')");
  assert.equal(r.rows[0].create_secure_booking, true);
  assert.equal(r.rows[0].create_secure_order, true);
  assert.equal(r.rows[0].create_booking_hold, true);
});

test("migration also compiles and generates tokens with pgcrypto in public", async () => {
  const other = new PGlite({ extensions: { pgcrypto } });
  try {
    await other.exec(fixtureSql("public"));
    await other.exec(migrationSql);
    const r = await other.query("select client_access_private.new_invitation_token() as token");
    assert.match(r.rows[0].token, /^[0-9a-f]{64}$/);
  } finally { await other.close(); }
});

test("only verified admin creates invitation; store SHA-256 only and default 30-day expiry", async () => {
  const first = await invite();
  const second = await invite();
  assert.match(first.token, /^[0-9a-f]{64}$/);
  assert.notEqual(first.token, second.token);
  const { rows: [stored] } = await db.query("select encode(token_hash, 'hex') as hash, extract(epoch from expires_at-created_at) as lifetime, to_jsonb(i) as record from client_access_private.client_invitations i where id = $1", [first.id]);
  assert.equal(stored.hash, createHash("sha256").update(first.token).digest("hex"));
  assert.ok(Math.abs(Number(stored.lifetime) - 30 * 86400) < 2);
  assert.ok(!JSON.stringify(stored.record).includes(first.token));
  assert.equal(await count("client_access_events", "invitation_id=$1 and event_type='INVITATION_CREATED'", [first.id]), 1);
});

test("validation exposes only validity/expiry and never consumes or audits an opening", async () => {
  const invitation = await invite();
  const before = await count("client_access_events", "invitation_id=$1", [invitation.id]);
  for (let i = 0; i < 3; i++) {
    const result = await rpc(null, "validate_client_invitation", [invitation.token], "anon");
    assert.deepEqual(Object.keys(result).sort(), ["expires_at", "status", "valid"]);
    assert.equal(result.status, "UNUSED");
    assert.equal(result.valid, true);
  }
  assert.equal(await count("client_access_events", "invitation_id=$1", [invitation.id]), before);
});

test("invalid, null and malformed tokens reveal no record", async () => {
  const actor = await user();
  for (const token of [null, "", "not-a-token", "a".repeat(64), "a".repeat(1000)]) {
    assert.deepEqual(await rpc(null, "validate_client_invitation", [token], "anon"), { status: "INVALID", valid: false });
    await assert.rejects(rpc(actor, "accept_client_invitation", [token, validProfile]), /Invitation is invalid/);
  }
});

test("expired invitation is derived, not consumed; acceptance fails; revoke is a no-op", async () => {
  const invitation = await invite();
  await expire(invitation);
  assert.equal((await rpc(null, "validate_client_invitation", [invitation.token], "anon")).status, "EXPIRED");
  await assert.rejects(accept(await user(), invitation), /no longer available/);
  assert.equal((await rpc(admin, "admin_revoke_client_invitation", [invitation.id])).status, "EXPIRED");
  assert.equal(await count("client_invitations", "id=$1 and state='UNUSED'", [invitation.id]), 1);
});

test("revocation is admin-only, audited once and idempotent", async () => {
  const invitation = await invite();
  await assert.rejects(rpc(await user(), "admin_revoke_client_invitation", [invitation.id]), /admin access/);
  for (let i = 0; i < 2; i++) assert.equal((await rpc(admin, "admin_revoke_client_invitation", [invitation.id])).status, "REVOKED");
  assert.equal((await rpc(null, "validate_client_invitation", [invitation.token], "anon")).status, "REVOKED");
  await assert.rejects(accept(await user(), invitation), /no longer available/);
  assert.equal(await count("client_access_events", "invitation_id=$1 and event_type='INVITATION_REVOKED'", [invitation.id]), 1);
});

test("no access row stays unapproved even with an existing editable profile", async () => {
  const actor = await user();
  await asRole("authenticated", actor, "insert into public.client_profiles(user_id,full_name,email,phone) values ($1,'Old Name','edited@example.test','07700900123')", [actor.id]);
  const result = await rpc(actor, "get_my_client_access");
  assert.equal(result.status, null);
  assert.equal(result.profile_complete, false);
  assert.deepEqual(result.missing_fields, ["first_name", "last_name"]);
  await assert.rejects(rpc(actor, "complete_my_client_profile", [validProfile]), /admission is required/);
  await assert.rejects(rpc(admin, "admin_unblock_client", [actor.id]), /not been admitted/);
});

test("anonymous and missing-sub callers cannot redeem or read access", async () => {
  const invitation = await invite();
  await assert.rejects(rpc(null, "accept_client_invitation", [invitation.token, validProfile], "anon"), /permission denied/);
  await assert.rejects(rpc(null, "accept_client_invitation", [invitation.token, validProfile]), /signed-in/);
  await assert.rejects(rpc(null, "get_my_client_access"), /signed-in/);
  await assert.rejects(rpc(null, "admin_create_client_invitation"), /admin access/);
});

test("unconfirmed Auth email cannot admit, even when a profile/email is supplied", async () => {
  for (const options of [{ confirmed: false }, { email: "" }]) {
    const actor = await user(options);
    const invitation = await invite();
    await assert.rejects(accept(actor, invitation, { ...validProfile, email: "verified@example.test" }), /confirmed email/);
    assert.equal(await count("client_access", "user_id=$1", [actor.id]), 0);
  }
});

for (const [label, patch, pattern] of [
  ["missing first name", { first_name: undefined }, /First name/],
  ["blank first name", { first_name: " " }, /first name/],
  ["missing last name", { last_name: undefined }, /First name/],
  ["blank last name", { last_name: " " }, /last name/],
  ["missing mobile", { mobile: undefined }, /mobile/],
  ["invalid mobile", { mobile: "letters" }, /mobile/],
  ["long name", { first_name: "a".repeat(101) }, /first name/],
  ["control character", { last_name: "Name\nInjected" }, /last name/],
  ["numeric mobile", { mobile: 447700900123 }, /text/],
  ["forged access field", { status: "ACTIVE" }, /text/],
]) {
  test(`profile rejects ${label}; no partial admission or consumption`, async () => {
    const actor = await user();
    const invitation = await invite();
    await assert.rejects(accept(actor, invitation, { ...validProfile, ...patch }), pattern);
    assert.equal(await count("client_access", "user_id=$1", [actor.id]), 0);
    assert.equal((await db.query("select count(*)::int n from public.client_profiles where user_id=$1", [actor.id])).rows[0].n, 0);
    assert.equal((await rpc(null, "validate_client_invitation", [invitation.token], "anon")).status, "UNUSED");
  });
}

test("successful admission links identity/profile/access and ignores forged profile/JWT email", async () => {
  const actor = await user();
  const invitation = await invite();
  const result = await accept({ ...actor, email: "forged-jwt@example.test" }, invitation, { ...validProfile, email: "forged@example.test" });
  assert.deepEqual(result, { status: "ACTIVE", profile_complete: true, missing_fields: [] });
  const { rows: [profile] } = await db.query("select * from public.client_profiles where user_id=$1", [actor.id]);
  assert.equal(profile.email, actor.email);
  assert.equal(profile.full_name, "Jo Client");
  assert.equal(profile.phone, "+447700900123");
  assert.equal(await count("client_invitations", "id=$1 and linked_user_id=$2 and state='LINKED'", [invitation.id, actor.id]), 1);
  assert.equal(await count("client_access_events", "user_id=$1", [actor.id]), 2);
  await assert.rejects(rpc(admin, "admin_revoke_client_invitation", [invitation.id]), /linked invitation/);
});

test("successful retry is read-only even after expiry; second user cannot redeem", async () => {
  const { actor, invitation } = await admitted();
  await expire(invitation);
  assert.equal((await accept(actor, invitation, null)).status, "ACTIVE");
  assert.equal(await count("client_access_events", "user_id=$1", [actor.id]), 2);
  await assert.rejects(accept(await user(), invitation), /already been linked/);
});

test("ACTIVE client cannot consume an unrelated invitation", async () => {
  const { actor } = await admitted();
  const invitation = await invite();
  await assert.rejects(accept(actor, invitation), /already admitted/);
  assert.equal((await rpc(null, "validate_client_invitation", [invitation.token], "anon")).status, "UNUSED");
});

test("admin block/unblock is audited, idempotent, UUID-based and never creates access", async () => {
  const { actor, invitation } = await admitted();
  await rpc(admin, "admin_block_client", [actor.id, "Review requested"]);
  const { rows: [before] } = await db.query("select * from client_access_private.client_access where user_id=$1", [actor.id]);
  await rpc(admin, "admin_block_client", [actor.id, "Duplicate call"]);
  assert.equal((await rpc(actor, "get_my_client_access")).status, "BLOCKED");
  await assert.rejects(accept(actor, invitation), /blocked/);
  await assert.rejects(accept(actor, await invite()), /blocked/);
  await asRole("authenticated", actor, "update public.client_profiles set email='new@example.test', full_name='Changed' where user_id=$1", [actor.id]);
  await db.query("update auth.users set email='changed-auth@example.test' where id=$1", [actor.id]);
  assert.equal((await rpc(actor, "get_my_client_access")).status, "BLOCKED");
  await rpc(actor, "complete_my_client_profile", [validProfile]);
  const projection = await rpc(actor, "get_my_client_access");
  assert.equal(projection.status, "BLOCKED");
  assert.ok(!JSON.stringify(projection).includes("Review requested"));
  const { rows: [blocked] } = await db.query("select * from client_access_private.client_access where user_id=$1", [actor.id]);
  assert.deepEqual(blocked.status_changed_at, before.status_changed_at);
  assert.equal(blocked.status_changed_by, adminId);
  assert.deepEqual(blocked.admitted_at, before.admitted_at);
  await rpc(admin, "admin_unblock_client", [actor.id, "Approved again"]);
  assert.equal((await rpc(actor, "get_my_client_access")).status, "ACTIVE");
  assert.equal(await count("client_access_events", "user_id=$1 and event_type='CLIENT_BLOCKED'", [actor.id]), 1);
  assert.equal(await count("client_access_events", "user_id=$1 and event_type='CLIENT_UNBLOCKED'", [actor.id]), 1);
});

test("ordinary caller cannot administer invitations or block/unblock including self", async () => {
  const { actor } = await admitted();
  const invitation = await invite();
  for (const [name, args] of [["admin_create_client_invitation", []], ["admin_revoke_client_invitation", [invitation.id]], ["admin_block_client", [actor.id]], ["admin_unblock_client", [actor.id]]]) {
    await assert.rejects(rpc(actor, name, args), /admin access/);
    await assert.rejects(rpc(null, name, args, "anon"), /permission denied/);
  }
});

test("private tables/helpers are denied to both browser roles, including direct mutation", async () => {
  const actor = await user();
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["client_access", "client_invitations", "client_access_events"]) {
      for (const sql of [`select * from client_access_private.${table}`, `delete from client_access_private.${table}`, `insert into client_access_private.${table} default values`]) {
        await assert.rejects(asRole(role, actor, sql), /permission denied/);
      }
    }
    await assert.rejects(asRole(role, actor, "update client_access_private.client_access set status='ACTIVE'"), /permission denied/);
    await assert.rejects(asRole(role, actor, "select client_access_private.set_access_status($1,'ACTIVE',null)", [actor.id]), /permission denied/);
  }
  const { rows } = await db.query("select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='client_access_private' and c.relkind='r'");
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.relrowsecurity));
});

test("bounded admin details/reasons fail without partial writes", async () => {
  const before = await count("client_invitations");
  await assert.rejects(rpc(admin, "admin_create_client_invitation", ["a".repeat(201)]), /too long/);
  assert.equal(await count("client_invitations"), before);
  const { actor } = await admitted();
  await assert.rejects(rpc(admin, "admin_block_client", [actor.id, "r".repeat(501)]), /Invalid client access/);
  assert.equal((await rpc(actor, "get_my_client_access")).status, "ACTIVE");
});

test("failure after profile/access/link writes rolls back everything, including existing profile", async () => {
  const actor = await user();
  const invitation = await invite();
  await db.query("insert into public.client_profiles(user_id,full_name,phone) values ($1,'Preserve Me','07700900123')", [actor.id]);
  await db.exec(`create function public.test_reject_admission_event() returns trigger language plpgsql as $$ begin
    if new.event_type='ACCESS_ACTIVATED' then raise exception 'injected audit failure'; end if; return new; end $$;
    create trigger test_reject_admission_event before insert on client_access_private.client_access_events
    for each row execute function public.test_reject_admission_event();`);
  try {
    await assert.rejects(accept(actor, invitation), /injected audit failure/);
    assert.equal(await count("client_access", "user_id=$1", [actor.id]), 0);
    assert.equal(await count("client_access_events", "user_id=$1", [actor.id]), 0);
    assert.equal((await rpc(null, "validate_client_invitation", [invitation.token], "anon")).status, "UNUSED");
    assert.equal((await db.query("select full_name from public.client_profiles where user_id=$1", [actor.id])).rows[0].full_name, "Preserve Me");
  } finally {
    await db.exec("drop trigger test_reject_admission_event on client_access_private.client_access_events; drop function public.test_reject_admission_event()");
  }
});

test("all new functions have fixed search paths and explicit safe privileges; no token retrieval RPC", async () => {
  const { rows } = await db.query(`select n.nspname, p.proname, p.proconfig, p.oid,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='client_access_private' or (n.nspname='public' and p.proname in
      ('admin_create_client_invitation','admin_revoke_client_invitation','validate_client_invitation',
       'accept_client_invitation','get_my_client_access','complete_my_client_profile','admin_block_client','admin_unblock_client'))`);
  for (const fn of rows) {
    assert.deepEqual(fn.proconfig, ["search_path=pg_catalog"]);
    assert.equal(fn.anon_exec, fn.proname === "validate_client_invitation");
    assert.equal(fn.auth_exec, fn.nspname === "public");
  }
  assert.equal(rows.filter((fn) => fn.nspname === "public").length, 8);
  const { actor, invitation } = await admitted();
  const { rows: events } = await db.query("select to_jsonb(e) as event from client_access_private.client_access_events e where user_id=$1 or invitation_id=$2", [actor.id, invitation.id]);
  assert.ok(!JSON.stringify(events).includes(invitation.token));
  assert.ok(!JSON.stringify(events).includes(createHash("sha256").update(invitation.token).digest("hex")));
});
