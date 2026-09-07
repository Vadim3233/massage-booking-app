// Uses only a freshly initialized, disposable local PostgreSQL cluster.
// Never reads a database URL or connects to an existing application database.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { adminId, adminEmail, validProfile, fixtureSql, migrationSql } from "../src/lib/testSupport/clientAccessFixture.js";
import { bookingFixtureSql, stage2Sql } from "../src/lib/testSupport/clientBookingAccessFixture.js";

const withBookingAccess = process.argv.includes("--booking-access");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portableBin = join(repositoryRoot, ".tools", "postgresql-18.6", "pgsql", "bin");
const systemBin = process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "";
const requiredExecutables = ["initdb", "pg_ctl", "psql"];
function completeRuntime(binDirectory) {
  if (!binDirectory) return false;
  const suffix = process.platform === "win32" ? ".exe" : "";
  return requiredExecutables.every((name) => existsSync(join(binDirectory, `${name}${suffix}`)))
    && existsSync(join(resolve(binDirectory, ".."), "share", "postgres.bki"));
}
function selectPostgresBin() {
  if (process.env.CLIENT_ACCESS_TEST_PG_BIN) {
    const requestedBin = resolve(process.env.CLIENT_ACCESS_TEST_PG_BIN);
    if (!completeRuntime(requestedBin)) {
      throw new Error(`CLIENT_ACCESS_TEST_PG_BIN does not point to a complete PostgreSQL runtime: ${requestedBin}`);
    }
    return requestedBin;
  }
  for (const candidate of [portableBin, systemBin]) {
    if (completeRuntime(candidate)) return candidate;
  }
  throw new Error(`No complete PostgreSQL runtime is available. Expected ${portableBin} or set CLIENT_ACCESS_TEST_PG_BIN explicitly.`);
}
const bin = process.platform === "win32" || process.env.CLIENT_ACCESS_TEST_PG_BIN ? selectPostgresBin() : "";
const executable = (name) => bin ? join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
function command(name, args, input = "") {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable(name), args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    const completionEvent = name === "pg_ctl" && args.includes("start") && process.platform === "win32" ? "exit" : "close";
    child.on(completionEvent, (code) => code === 0 ? resolveResult(stdout.trim()) : reject(new Error(`${name} exited ${code}: ${stderr.trim()}`)));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const scratch = await mkdtemp(join(tmpdir(), "client-access-pg-"));
const scratchReal = await realpath(scratch);
const data = join(scratch, "data");
let started = false;
async function cleanup() {
  if (started) {
    await command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    started = false;
  }
  // Only remove the exact temporary directory created by this process.
  const actual = await realpath(scratch);
  assert.equal(actual, scratchReal);
  assert.ok(resolve(actual).startsWith(resolve(tmpdir()) + sep));
  assert.ok(actual.includes("client-access-pg-"));
  await rm(actual, { recursive: true });
}
const server = createServer();
await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const port = server.address().port;
await new Promise((done) => server.close(done));
const args = ["-X", "-qAt", "-h", "127.0.0.1", "-p", String(port), "-U", "client_access_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const sql = (text) => command("psql", args, text);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const admin = { id: adminId, email: adminEmail };
function context(actor) {
  return `set local role authenticated; select set_config('request.jwt.claims', ${literal(JSON.stringify({ sub: actor.id, email: actor.email }))}, true);`;
}
function rpcText(name, values = []) { return `select public.${name}(${values.map(literal).join(",")});`; }
async function rpc(actor, name, values) {
  const output = await sql(`begin; ${context(actor)} ${rpcText(name, values)} commit;`);
  return JSON.parse(output.split("\n").filter(Boolean).at(-1));
}
async function user() {
  const actor = { id: randomUUID(), email: `${randomUUID()}@example.test` };
  await sql(`insert into auth.users values (${literal(actor.id)},${literal(actor.email)},now());`);
  return actor;
}
const invite = () => rpc(admin, "admin_create_client_invitation", []);
const acceptance = (invitation) => rpcText("accept_client_invitation", [invitation.token, JSON.stringify(validProfile)]);
async function admitted() {
  const actor = await user(), invitation = await invite();
  await rpc(actor, "accept_client_invitation", [invitation.token, JSON.stringify(validProfile)]);
  return { actor, invitation };
}
async function waitUntilSleeping(label) {
  for (let i = 0; i < 100; i++) {
    if (await sql(`select exists(select 1 from pg_stat_activity where application_name=${literal(label)} and wait_event='PgSleep');`) === "t") return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Leader did not reach the lock-holding phase");
}
async function race(leaderActor, leaderSql, followerActor, followerSql) {
  // Keep both this label and its `_follower` suffix below PostgreSQL's
  // 63-byte application_name limit so the lock observer can match exactly.
  const label = `car_${randomUUID()}`;
  const leader = sql(`set application_name=${literal(label)}; begin; ${leaderActor ? context(leaderActor) : ""}
    ${leaderSql} select pg_sleep(1.5); commit;`);
  // Attach rejection handlers immediately so failed setup cannot leave an unhandled promise.
  const leaderResult = leader.then(value => ({ value }), error => ({ error }));
  await waitUntilSleeping(label);
  const followerLabel = `${label}_follower`;
  const followerResult = sql(`set application_name=${literal(followerLabel)}; begin; ${context(followerActor)} ${followerSql} commit;`)
    .then(value => ({ value }), error => ({ error }));
  let observedLock = false;
  for (let i = 0; i < 60; i++) {
    if (await sql(`select exists(select 1 from pg_stat_activity where application_name=${literal(followerLabel)} and wait_event_type='Lock');`) === "t") {
      observedLock = true;
      break;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  const [first, second] = await Promise.all([leaderResult, followerResult]);
  if (first.error) throw first.error;
  assert.ok(observedLock, "Follower must actually wait on a database lock; serialized single-session calls are not a concurrency test");
  return second;
}
function rejected(result, pattern) { assert.ok(result.error); assert.match(result.error.message, pattern); }

try {
  await command("initdb", ["-D", data, "-U", "client_access_test", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  await command("pg_ctl", ["-D", data, "-l", join(scratch, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  assert.equal(resolve(await sql("show data_directory;")), resolve(data));
  if (withBookingAccess) {
    await sql(bookingFixtureSql);
    await sql(stage2Sql);
  } else {
    await sql(fixtureSql());
    await sql(migrationSql);
  }
} catch (error) {
  await cleanup();
  throw error;
}
after(cleanup);

test("two accounts racing one invitation: exactly one is admitted", async () => {
  const first = await user(), second = await user(), invitation = await invite();
  rejected(await race(first, acceptance(invitation), second, acceptance(invitation)), /already been linked/);
  assert.equal(await sql(`select count(*) from client_access_private.client_access where invitation_id=${literal(invitation.id)};`), "1");
  assert.equal(await sql(`select count(*) from public.client_profiles where user_id=${literal(second.id)};`), "0");
});

test("same account racing different invitations: second invitation remains unused", async () => {
  const actor = await user(), first = await invite(), second = await invite();
  rejected(await race(actor, acceptance(first), actor, acceptance(second)), /already admitted/);
  assert.equal(await sql(`select state from client_access_private.client_invitations where id=${literal(second.id)};`), "UNUSED");
});

test("same-account concurrent retry succeeds without duplicate admission events", async () => {
  const actor = await user(), invitation = await invite();
  assert.ok(!(await race(actor, acceptance(invitation), actor, acceptance(invitation))).error);
  assert.equal(await sql(`select count(*) from client_access_private.client_access_events where user_id=${literal(actor.id)};`), "2");
});

test("revocation winning the lock prevents pending admission", async () => {
  const actor = await user(), invitation = await invite();
  rejected(await race(admin, rpcText("admin_revoke_client_invitation", [invitation.id]), actor, acceptance(invitation)), /no longer available/);
  assert.equal((await rpc(actor, "get_my_client_access", [])).status, null);
});

test("admission winning the lock makes concurrent revocation refuse the linked invitation", async () => {
  const actor = await user(), invitation = await invite();
  rejected(await race(actor, acceptance(invitation), admin, rpcText("admin_revoke_client_invitation", [invitation.id])), /linked invitation/);
  assert.equal((await rpc(actor, "get_my_client_access", [])).status, "ACTIVE");
});

test("blocking and fresh invitation redemption serialize on the same user", async () => {
  const { actor } = await admitted(), invitation = await invite();
  rejected(await race(admin, rpcText("admin_block_client", [actor.id]), actor, acceptance(invitation)), /blocked/);
  assert.equal((await rpc(actor, "get_my_client_access", [])).status, "BLOCKED");
});

test("block waiting for first admission sees the new access row and leaves it BLOCKED", async () => {
  const actor = await user(), invitation = await invite();
  assert.ok(!(await race(actor, acceptance(invitation), admin, rpcText("admin_block_client", [actor.id]))).error);
  assert.equal((await rpc(actor, "get_my_client_access", [])).status, "BLOCKED");
});

test("expiry is rechecked after a lock wait, not using transaction-start time", async () => {
  const actor = await user(), invitation = await invite();
  rejected(await race(null, `update client_access_private.client_invitations set expires_at=clock_timestamp()+interval '1 second' where id=${literal(invitation.id)};`, actor, acceptance(invitation)), /no longer available/);
  assert.equal((await rpc(actor, "get_my_client_access", [])).status, null);
});

// Same observed multi-session lock test, now through the real final mutation RPCs.
// Run in a separate fresh cluster with --booking-access; retain all eight Stage 1 tests.
if (withBookingAccess) {
  let day = 2;
  for (const operation of ['order', 'hold', 'booking']) {
    for (const blockFirst of [true, false]) test(`${operation} and block serialize: ${blockFirst ? 'block' : 'creation'} wins`, async () => {
      const { actor } = await admitted();
      const date = await sql(`select (current_date+${day++})::text;`);
      const key = randomUUID();
      const holdSql = `select to_jsonb(h) from public.create_booking_hold(${literal(date)}::date,600,60,60,${literal(key)}::text) h;`;
      let mutation;
      if (operation === 'hold') mutation = holdSql;
      if (operation === 'order') mutation = `select public.create_secure_order(${literal(JSON.stringify({id:randomUUID(),client_email:actor.email,client_name:'Jo Client',payment_status:'pending'}))}::jsonb);`;
      if (operation === 'booking') {
        const result = await sql(`begin; ${context(actor)} ${holdSql} commit;`);
        const held = JSON.parse(result.split('\n').filter(Boolean).at(-1));
        const payload = {id:randomUUID(),date,start_minutes:600,duration_minutes:60,client_name:'Jo Client',client_email:actor.email,
          client_phone:'+447700900123',service_name:'Massage',service:'Massage',status:'pending_payment_verification',payment_status:'awaiting_verification',
          hold_id:held.hold_id,hold_token:held.hold_token,hold_client_key:key};
        mutation = `select public.create_secure_booking(${literal(JSON.stringify(payload))}::jsonb);`;
      }
      const blocking = rpcText('admin_block_client',[actor.id]);
      if (blockFirst) rejected(await race(admin,blocking,actor,mutation),/CLIENT_ACCESS_BLOCKED/);
      else assert.ok(!(await race(actor,mutation,admin,blocking)).error);
      assert.equal((await rpc(actor,'get_my_client_access',[])).status,'BLOCKED');
      await assert.rejects(sql(`begin; ${context(actor)} ${mutation} commit;`),/CLIENT_ACCESS_BLOCKED/);
    });
  }
}
