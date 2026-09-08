// Uses only a fresh disposable local PostgreSQL cluster.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { adminId, adminEmail, fixtureSql } from "../src/lib/testSupport/clientAccessFixture.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portable = join(root, ".tools", "postgresql-18.6", "pgsql", "bin");
const system = process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "";
const suffix = process.platform === "win32" ? ".exe" : "";
const complete = (dir) => dir && ["initdb","pg_ctl","psql"].every((name) => existsSync(join(dir, name + suffix)));
const bin = [portable, system].find(complete);
if (!bin) throw new Error("No complete local PostgreSQL runtime is available.");
const executable = (name) => join(bin, name + suffix);
function command(name, args, input = "") {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable(name), args, { windowsHide: true, stdio: ["pipe","pipe","pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on(name === "pg_ctl" && args.includes("start") && process.platform === "win32" ? "exit" : "close",
      (code) => code === 0 ? resolveResult(stdout.trim()) : reject(new Error(name + " exited " + code + ": " + stderr.trim())));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const scratch = await mkdtemp(join(tmpdir(), "client-telegram-pg-"));
const scratchReal = await realpath(scratch);
const data = join(scratch, "data");
let started = false;
async function cleanup() {
  if (started) { await command("pg_ctl", ["-D",data,"-m","immediate","-w","stop"]); started = false; }
  const actual = await realpath(scratch);
  assert.equal(actual, scratchReal);
  assert.ok(resolve(actual).startsWith(resolve(tmpdir()) + sep));
  await rm(actual, { recursive: true });
}
const socket = createServer();
await new Promise((done, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", done); });
const port = socket.address().port;
await new Promise((done) => socket.close(done));
const psqlArgs = ["-X","-qAt","-h","127.0.0.1","-p",String(port),"-U","telegram_test","-d","postgres","-v","ON_ERROR_STOP=1"];
const sql = (text) => command("psql", psqlArgs, text);
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const context = (actor, role = "authenticated") => "set local role " + role + "; select set_config('request.jwt.claims'," + literal(JSON.stringify(actor ? { sub: actor.id, email: actor.email } : {})) + ",true);";
const rpcSql = (name, values = []) => "select public." + name + "(" + values.map(literal).join(",") + ");";
async function rpc(actor, name, values = [], role = "authenticated") {
  const output = await sql("begin;" + context(actor, role) + rpcSql(name, values) + "commit;");
  return JSON.parse(output.split("\n").filter(Boolean).at(-1));
}
async function user() {
  const actor = { id: randomUUID(), email: randomUUID() + "@example.test" };
  await sql("insert into auth.users values(" + literal(actor.id) + "," + literal(actor.email) + ",now()); insert into public.client_profiles(user_id,full_name,email,phone) values(" + literal(actor.id) + ",'Telegram Client'," + literal(actor.email) + ",'07700900123');");
  return actor;
}
async function waitForLock(label) {
  for (let i=0;i<100;i++) {
    if (await sql("select exists(select 1 from pg_stat_activity where application_name=" + literal(label) + " and wait_event='PgSleep');") === "t") return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error("Leader did not reach its lock-holding phase.");
}
async function race(leader, follower) {
  const label = "ct_" + randomUUID();
  const first = sql("set application_name=" + literal(label) + ";begin;" + leader + "select pg_sleep(1.2);commit;").then((value) => ({value}), (error) => ({error}));
  await waitForLock(label);
  const second = sql("begin;" + follower + "commit;").then((value) => ({value}), (error) => ({error}));
  return Promise.all([first, second]);
}

try {
  await command("initdb", ["-D",data,"-U","telegram_test","--auth=trust","--encoding=UTF8","--no-locale"]);
  await command("pg_ctl", ["-D",data,"-l",join(scratch,"postgres.log"),"-o","-h 127.0.0.1 -p " + port,"-w","start"]);
  started = true;
  await sql(fixtureSql());
  await sql([
    "create table public.bookings(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),booking_reference text,payment_reference text,notes text,client_email text,client_phone text,created_at timestamptz default now());",
    "create function public.booking_reference_from_notes(text) returns text language sql immutable as $$ select null::text $$;",
    await readFile(new URL("../supabase/migrations/20260731120000_link_telegram_chats_to_bookings.sql", import.meta.url), "utf8"),
    await readFile(new URL("../supabase/migrations/20260908130000_secure_client_telegram_activation.sql", import.meta.url), "utf8"),
  ].join("\n"));
  const admin = { id: adminId, email: adminEmail };
  const client = await user();
  const invitation = await rpc(admin, "admin_create_client_telegram_invitation", [client.id]);
  const consume = (chat) => context(null, "anon") + rpcSql("consume_client_telegram_activation", [JSON.stringify({token:invitation.token,chat_id:chat})]);
  const double = await race(consume("native-a"), consume("native-b"));
  assert.ok(!double[0].error);
  assert.equal(await sql("select count(*) from public.client_telegram_links where user_id=" + literal(client.id) + " and is_active;"), "1");
  assert.equal(await sql("select state from telegram_private.client_telegram_invitations where id=" + literal(invitation.id) + ";"), "LINKED");

  const client2 = await user();
  const invitation2 = await rpc(admin, "admin_create_client_telegram_invitation", [client2.id]);
  const revoke = context(admin) + rpcSql("admin_revoke_client_telegram_invitation", [invitation2.id]);
  const consume2 = context(null, "anon") + rpcSql("consume_client_telegram_activation", [JSON.stringify({token:invitation2.token,chat_id:"native-revoke"})]);
  await race(revoke, consume2);
  assert.equal(await sql("select state from telegram_private.client_telegram_invitations where id=" + literal(invitation2.id) + ";"), "REVOKED");
  assert.equal(await sql("select count(*) from public.client_telegram_links where user_id=" + literal(client2.id) + " and is_active;"), "0");
  console.log("Native PostgreSQL Telegram concurrency tests passed.");
} finally {
  await cleanup();
}
