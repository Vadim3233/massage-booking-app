import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { adminId, adminEmail, fixtureSql } from "./testSupport/clientAccessFixture.js";

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(fixtureSql());
await db.exec([
  "create table public.bookings(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),",
  "booking_reference text, payment_reference text, notes text, client_email text, client_phone text, created_at timestamptz default now());",
  "create function public.booking_reference_from_notes(text) returns text language sql immutable as $$ select null::text $$;",
].join("\n"));
await db.exec(await readFile(new URL("../../supabase/migrations/20260731120000_link_telegram_chats_to_bookings.sql", import.meta.url), "utf8"));
await db.exec(await readFile(new URL("../../supabase/migrations/20260908130000_secure_client_telegram_activation.sql", import.meta.url), "utf8"));
after(() => db.close());

const admin = { id: adminId, email: adminEmail };
async function actor() {
  const id = randomUUID(), email = id + "@example.test";
  await db.query("insert into auth.users values ($1,$2,now())", [id, email]);
  await db.query("insert into public.client_profiles(user_id,full_name,email,phone) values($1,'Telegram Client',$2,'07700900123')", [id, email]);
  return { id, email };
}
function asRole(role, user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role " + role);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(user ? { sub: user.id, email: user.email } : {})]);
    return tx.query(sql, params);
  });
}
async function rpc(role, user, name, params = []) {
  const placeholders = params.map((_, index) => "$" + (index + 1)).join(",");
  return (await asRole(role, user, "select public." + name + "(" + placeholders + ") result", params)).rows[0].result;
}
const create = (userId) => rpc("authenticated", admin, "admin_create_client_telegram_invitation", [userId]);
const consume = (token, chat = "1001") => rpc("anon", null, "consume_client_telegram_activation", [{ token, chat_id: chat, username: "safe_name" }]);

test("admin creates one-time hashed invitation and projections expose no secret", async () => {
  const client = await actor();
  const invitation = await create(client.id);
  assert.match(invitation.token, /^acct_[A-Za-z0-9_-]{43}$/);
  const raw = invitation.token.slice(5);
  const stored = (await db.query("select encode(token_hash,'hex') hash,to_jsonb(i) record from telegram_private.client_telegram_invitations i where id=$1", [invitation.id])).rows[0];
  assert.equal(stored.hash, createHash("sha256").update(raw).digest("hex"));
  assert.ok(!JSON.stringify(stored.record).includes(raw));
  const status = await rpc("authenticated", admin, "admin_get_client_telegram_status", [client.id]);
  assert.equal(status.state, "PENDING");
  assert.ok(!JSON.stringify(status).includes("token"));
});

test("non-admin cannot create, disconnect or read status", async () => {
  const client = await actor();
  for (const [name, params] of [["admin_create_client_telegram_invitation", [client.id]], ["admin_get_client_telegram_status", [client.id]], ["admin_disconnect_client_telegram", [client.id]]])
    await assert.rejects(rpc("authenticated", client, name, params), /Booking admin access/);
});

test("invitation secrets and audit events stay inaccessible to API roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(asRole(role, role === "authenticated" ? await actor() : null,
      "select * from telegram_private.client_telegram_invitations"), /permission denied/);
    await assert.rejects(asRole(role, role === "authenticated" ? await actor() : null,
      "select * from telegram_private.client_telegram_events"), /permission denied/);
  }
});

test("valid token links only its intended account and is replay safe", async () => {
  const intended = await actor(), other = await actor();
  const invitation = await create(intended.id);
  assert.deepEqual(await consume(invitation.token), { linked: true, status: "CONNECTED" });
  assert.deepEqual(await consume(invitation.token), { linked: true, status: "CONNECTED" });
  assert.deepEqual(await consume(invitation.token, "different-chat"), { linked: false, status: "INVALID" });
  const link = (await db.query("select user_id,telegram_username from public.client_telegram_links where chat_id='1001'")).rows[0];
  assert.equal(link.user_id, intended.id);
  assert.notEqual(link.user_id, other.id);
});

test("an active Telegram chat cannot be reassigned to another client", async () => {
  const firstClient = await actor(), secondClient = await actor();
  const first = await create(firstClient.id), second = await create(secondClient.id);
  assert.equal((await consume(first.token, "shared-chat")).linked, true);
  assert.equal((await consume(second.token, "shared-chat")).linked, false);
  assert.equal((await db.query("select user_id from public.client_telegram_links where chat_id='shared-chat'")).rows[0].user_id, firstClient.id);
});

test("expired and revoked tokens fail and replacements work", async () => {
  const client = await actor();
  const expired = await create(client.id);
  await db.query("update telegram_private.client_telegram_invitations set created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 second' where id=$1", [expired.id]);
  assert.equal((await consume(expired.token)).linked, false);
  const revoked = await create(client.id);
  await rpc("authenticated", admin, "admin_revoke_client_telegram_invitation", [revoked.id]);
  assert.equal((await consume(revoked.token)).linked, false);
  const replacement = await create(client.id);
  assert.equal((await consume(replacement.token, "replacement-chat")).linked, true);
});

test("double redemption and redemption/revocation races leave one safe terminal state", async () => {
  const firstClient = await actor();
  const first = await create(firstClient.id);
  const results = await Promise.all([consume(first.token, "race-a"), consume(first.token, "race-b")]);
  assert.equal(results.filter((result) => result.linked).length, 1);
  assert.equal((await db.query("select count(*)::int n from public.client_telegram_links where user_id=$1 and is_active", [firstClient.id])).rows[0].n, 1);
  const secondClient = await actor();
  const second = await create(secondClient.id);
  await Promise.allSettled([consume(second.token, "race-revoke"), rpc("authenticated", admin, "admin_revoke_client_telegram_invitation", [second.id])]);
  const row = (await db.query("select state from telegram_private.client_telegram_invitations where id=$1", [second.id])).rows[0];
  assert.ok(["LINKED", "REVOKED"].includes(row.state));
});

test("disconnect preserves account and bookings and stops active routing", async () => {
  const client = await actor();
  await db.query("insert into public.bookings(user_id,booking_reference) values($1,'KEEP-ME')", [client.id]);
  const invitation = await create(client.id);
  await consume(invitation.token, "disconnect-chat");
  await rpc("authenticated", admin, "admin_disconnect_client_telegram", [client.id]);
  assert.equal((await rpc("authenticated", admin, "admin_get_client_telegram_status", [client.id])).state, "NOT_CONNECTED");
  assert.equal((await db.query("select count(*)::int n from auth.users where id=$1", [client.id])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.bookings where user_id=$1", [client.id])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.client_telegram_links where user_id=$1 and is_active", [client.id])).rows[0].n, 0);
});
