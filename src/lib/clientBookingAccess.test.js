import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { bookingFixtureSql, stage2Sql } from "./testSupport/clientBookingAccessFixture.js";
import { adminId, adminEmail, validProfile } from "./testSupport/clientAccessFixture.js";

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(bookingFixtureSql);
const originalBodies = (await db.query("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname in ('create_secure_booking','create_secure_order','create_booking_hold','release_booking_hold','cancel_recent_booking_request','cancel_client_booking','reschedule_client_booking','link_recent_guest_booking_to_client','update_secure_booking','create_admin_personal_event') and prolang=(select oid from pg_language where lanname='plpgsql')")).rows;
await db.exec(stage2Sql);
after(() => db.close());
const admin = { id: adminId, email: adminEmail };
function asRole(role, actor, sql, params = []) {
  return db.transaction(async (tx) => {
    assert.ok(['anon', 'authenticated'].includes(role));
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(actor ? { sub: actor.id, email: actor.email } : {})]);
    return tx.query(sql, params);
  });
}
async function rpc(actor, name, params = [], casts = [], role = 'authenticated') {
  assert.match(name, /^[a-z_]+$/);
  const result = await asRole(role, actor, `select to_jsonb(public.${name}(${params.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ''}`).join(',')})) as result`, params);
  return result.rows[0].result;
}
async function user(active = false) {
  const actor = { id: randomUUID(), email: `${randomUUID()}@example.test` };
  await db.query('insert into auth.users values ($1,$2,now())', [actor.id, actor.email]);
  if (active) {
    const invitation = await rpc(admin, 'admin_create_client_invitation', [null, null, null]);
    await rpc(actor, 'accept_client_invitation', [invitation.token, validProfile]);
  }
  return actor;
}
let day = 1;
async function nextDate() { return (await db.query("select ((now() at time zone 'Europe/London')::date + $1::int)::text as d", [++day])).rows[0].d; }
async function hold(actor, date, key = randomUUID(), role = 'authenticated') {
  const result = await asRole(role, actor, 'select * from public.create_booking_hold($1::date,600,60,60,$2::text)', [date, key]);
  return { ...result.rows[0], key, date };
}
const order = (actor, extra = {}) => rpc(actor, 'create_secure_order', [{ id: randomUUID(), client_name: 'Jo Client', client_email: actor?.email, payment_provider: 'manual', payment_status: 'pending', total_amount: 100, ...extra }], ['jsonb']);
function payload(actor, held, extra = {}) {
  return { id: randomUUID(), date: held.date, start_minutes: 600, duration_minutes: 60,
    client_name: 'Jo Client', client_email: actor.email, client_phone: '+447700900123',
    service_name: 'Massage', service: 'Massage', address: '10 Test Street', price: 100,
    payment_status: 'awaiting_verification', status: 'pending_payment_verification',
    notes: JSON.stringify({ appBooking: { bookingReference: randomUUID(), travelBuffer: 60 } }),
    hold_id: held.hold_id, hold_token: held.hold_token, hold_client_key: held.key, ...extra };
}
const book = (actor, data) => rpc(actor, 'create_secure_booking', [data], ['jsonb']);
const block = (actor) => rpc(admin, 'admin_block_client', [actor.id, 'Test restriction']);
const release = (actor, held) => rpc(actor, 'release_booking_hold', [held.hold_id, held.hold_token, held.key]);
async function creationDenied(actor, message) {
  await assert.rejects(book(actor, {}), message);
  await assert.rejects(order(actor), message);
  const date = await nextDate();
  await assert.rejects(hold(actor, date), message);
  await assert.rejects(hold(actor, date), message);
}

test('business-rule bodies and existing management functions remain byte-for-byte unchanged', async () => {
  for (const original of originalBodies) {
    const moved = ['create_secure_booking','create_secure_order','create_booking_hold','release_booking_hold','cancel_recent_booking_request'].includes(original.proname);
    const { rows } = await db.query('select prosrc from pg_proc where pronamespace=$1::regnamespace and proname=$2', [moved ? 'client_access_private' : 'public', original.proname + (moved ? '_rules' : '')]);
    assert.equal(rows[0].prosrc, original.prosrc, original.proname);
  }
});

test('anonymous creation, refresh, release, cleanup and all obsolete overloads are revoked', async () => {
  const signatures = ['create_secure_booking(jsonb)','create_secure_order(jsonb)','create_booking_hold(date,integer,integer,integer,text)','release_booking_hold(uuid,uuid,text)','cleanup_expired_booking_holds()'];
  const obsolete = ['create_secure_booking(text)','create_secure_order(text)','create_booking_hold(date,integer,integer,integer)','release_booking_hold(uuid,uuid)'];
  for (const signature of [...signatures, ...obsolete]) {
    const { rows: [r] } = await db.query("select has_function_privilege('anon',$1,'execute') as anon, has_function_privilege('authenticated',$1,'execute') as authenticated", [`public.${signature}`]);
    assert.equal(r.anon, false, signature);
    assert.equal(r.authenticated, signatures.includes(signature) && !signature.startsWith('cleanup'), signature);
  }
  await assert.rejects(rpc(null,'create_secure_booking',[{}],['jsonb'],'anon'), /permission denied/);
  await assert.rejects(rpc(null,'create_secure_order',[{}],['jsonb'],'anon'), /permission denied/);
  const date = await nextDate();
  await assert.rejects(hold(null,date,randomUUID(),'anon'), /permission denied/);
  await assert.rejects(hold(null,date,randomUUID(),'anon'), /permission denied/);
  await assert.rejects(rpc(await user(),'create_secure_booking',['{}'],['text']), /permission denied/);
});

test('browser roles cannot insert directly or call private rule helpers', async () => {
  for (const role of ['anon','authenticated']) {
    for (const table of ['bookings','orders','booking_holds']) {
      const { rows: [r] } = await db.query("select has_table_privilege($1,$2,'insert') or has_any_column_privilege($1,$2,'insert') as can_insert", [role, `public.${table}`]);
      assert.equal(r.can_insert, false);
      await assert.rejects(asRole(role,admin,`insert into public.${table} default values`), /permission denied/);
    }
    await assert.rejects(asRole(role,admin,"select client_access_private.assert_creation_access()"), /permission denied/);
    await assert.rejects(asRole(role,admin,"select client_access_private.create_secure_booking_rules('{}')"), /permission denied/);
  }
});

test('authenticated role without uid fails closed', () => creationDenied(null,/CLIENT_AUTH_REQUIRED/));
test('Auth account with no admission cannot create or refresh', async () => creationDenied(await user(),/CLIENT_ACCESS_REQUIRED/));
test('ACTIVE but incomplete profile cannot create via direct RPC', async () => {
  const actor = await user(true);
  await db.query('update public.client_profiles set first_name=null where user_id=$1',[actor.id]);
  await creationDenied(actor,/CLIENT_PROFILE_INCOMPLETE/);
});
test('BLOCKED with same still-valid JWT cannot create or refresh', async () => {
  const actor = await user(true); await block(actor);
  await creationDenied(actor,/CLIENT_ACCESS_BLOCKED/);
});

test('ACTIVE complete client creates owner-bound hold, order and booking', async () => {
  const actor = await user(true); const held = await hold(actor,await nextDate());
  const refreshed = await hold(actor,held.date,held.key);
  assert.equal(refreshed.hold_id,held.hold_id);
  const createdOrder = await order(actor);
  assert.equal(createdOrder.user_id,actor.id);
  const booking = await book(actor,payload(actor,refreshed,{ order_id: createdOrder.id }));
  assert.equal(booking.user_id,actor.id);
  assert.equal(booking.order_id,createdOrder.id);
  const { rows: [stored] } = await db.query('select * from booking_holds where id=$1',[held.hold_id]);
  assert.equal(stored.user_id,actor.id); assert.ok(stored.released_at);
});

test('forged ownership, foreign holds/orders and fake admin fields cannot bypass', async () => {
  const actor = await user(true), other = await user(true);
  const held = await hold(actor,await nextDate());
  await assert.rejects(order(actor,{user_id: other.id}),/another client/);
  await assert.rejects(book(actor,payload(actor,held,{user_id:other.id})),/another client/);
  await assert.rejects(book(other,payload(other,held)),/hold does not belong/);
  const foreignOrder = await order(other);
  await assert.rejects(book(actor,payload(actor,held,{order_id:foreignOrder.id})),/Order is not available/);
  for (const field of ['isAdmin','overrideBlocked']) {
    await assert.rejects(book(actor,payload(actor,held,{[field]:true})),/unsupported fields/);
    await assert.rejects(order(actor,{[field]:true}),/unsupported fields/);
  }
  await assert.rejects(order(actor,{payment_status:'paid'}),/payment status/);
  await assert.rejects(rpc(actor,'create_admin_personal_event',[{}]),/Only booking admins/);
  await assert.rejects(rpc(actor,'update_secure_booking',[{}]),/Only booking admins/);
});

test('old hold and order never grandfather permission after blocking; owner may release', async () => {
  const actor = await user(true), other = await user(true);
  const held = await hold(actor,await nextDate()), createdOrder = await order(actor);
  await block(actor);
  await assert.rejects(book(actor,payload(actor,held,{order_id:createdOrder.id})),/CLIENT_ACCESS_BLOCKED/);
  await assert.rejects(hold(actor,held.date,held.key),/CLIENT_ACCESS_BLOCKED/);
  await assert.rejects(release(other,held),/does not belong/);
  assert.equal((await release(actor,held)).released,true);
});

test('same browser key cannot refresh or replace a different authenticated owner hold', async () => {
  const first = await user(true), second = await user(true), key = randomUUID();
  const held = await hold(first,await nextDate(),key);
  await assert.rejects(hold(second,held.date,key),/no longer available/);
  const other = await hold(second,await nextDate(),key);
  assert.notEqual(other.hold_id,held.hold_id);
  const { rows } = await db.query('select user_id,released_at from booking_holds where id=$1',[held.hold_id]);
  assert.equal(rows[0].user_id,first.id); assert.equal(rows[0].released_at,null);
});

test('existing conflict, duration, hold token and new-client booking limit rules still execute', async () => {
  const actor = await user(true), other = await user(true), date = await nextDate();
  const held = await hold(actor,date);
  await assert.rejects(book(actor,payload(actor,held,{duration_minutes:61})),/duration/);
  await assert.rejects(book(actor,payload(actor,held,{hold_token:randomUUID()})),/no longer available/);
  await book(actor,payload(actor,held));
  await assert.rejects(hold(other,date),/no longer available/);
  const next = await hold(actor,await nextDate());
  await assert.rejects(book(actor,payload(actor,next)),/first appointment|one.*appointment|first booking/i);
});

test('BLOCKED owner retains SELECT, reschedule and cancellation; no new row and other users denied', async () => {
  const actor = await user(true), other = await user(true);
  const held = await hold(actor,await nextDate()); const booking = await book(actor,payload(actor,held));
  await db.query("update bookings set status='confirmed',payment_status='paid' where id=$1",[booking.id]);
  await block(actor);
  assert.equal((await asRole('authenticated',actor,'select id from bookings where id=$1',[booking.id])).rows.length,1);
  assert.equal((await asRole('authenticated',other,'select id from bookings where id=$1',[booking.id])).rows.length,0);
  const date = await nextDate();
  await assert.rejects(rpc(other,'reschedule_client_booking',[booking.id,date,600]),/does not belong/);
  await assert.rejects(rpc(other,'cancel_client_booking',[booking.id]),/does not belong/);
  const before = (await db.query('select count(*)::int as n from bookings')).rows[0].n;
  assert.equal((await rpc(actor,'reschedule_client_booking',[booking.id,date,600])).id,booking.id);
  assert.equal((await db.query('select count(*)::int as n from bookings')).rows[0].n,before);
  assert.equal((await rpc(actor,'cancel_client_booking',[booking.id])).status,'cancelled');
});

test('public recent cancellation cannot bearer-modify an account-owned booking', async () => {
  const actor = await user(true), other = await user(true), held = await hold(actor,await nextDate());
  const booking = await book(actor,payload(actor,held)), reference = randomUUID();
  await db.query('update bookings set booking_reference=$2 where id=$1',[booking.id,reference]);
  await assert.rejects(rpc(null,'cancel_recent_booking_request',[booking.id,reference],[],'anon'),/signed-in owner/);
  await assert.rejects(rpc(other,'cancel_recent_booking_request',[booking.id,reference]),/signed-in owner/);
  await block(actor);
  assert.equal((await rpc(actor,'cancel_recent_booking_request',[booking.id,reference])).status,'cancelled');
});

test('historical guest cancellation keeps reference/window rules and never admits or creates', async () => {
  const id = randomUUID(), reference = randomUUID(), date = await nextDate();
  await db.query("insert into bookings(id,client_name,client_email,date,start_minutes,duration_minutes,status,payment_status,booking_reference) values($1,'Guest','guest@example.test',$2,600,60,'pending_payment_verification','awaiting_verification',$3)",[id,date,reference]);
  await assert.rejects(rpc(null,'cancel_recent_booking_request',[id,'wrong'],[],'anon'),/reference/i);
  const before = (await db.query('select count(*)::int as n from client_access_private.client_access')).rows[0].n;
  const cancelled = await rpc(null,'cancel_recent_booking_request',[id,reference],[],'anon');
  assert.equal(cancelled.user_id,null); assert.equal(cancelled.status,'cancelled');
  assert.equal((await db.query('select count(*)::int as n from client_access_private.client_access')).rows[0].n,before);
});

test('verified admin retains deliberate manual booking for blocked and guest clients', async () => {
  const actor = await user(true); await block(actor);
  for (const target of [actor.id,null]) {
    const date = await nextDate(); const data = payload(actor,{date},{user_id:target});
    delete data.hold_id; delete data.hold_token; delete data.hold_client_key;
    const result = await book(admin,data);
    assert.equal(result.user_id,target);
  }
  assert.equal((await order(admin,{user_id:actor.id,payment_status:'paid'})).user_id,actor.id);
});

test('public availability stays readable without hold tokens or account identity', async () => {
  const result = await asRole('anon',null,'select * from public.get_public_booking_blocks(current_date,current_date+40)');
  assert.ok(result.rows.length>0);
  for (const row of result.rows) for (const field of ['user_id','client_email','client_phone','hold_token','client_key']) assert.equal(field in row,false);
});

test('recent guest linking still needs reference, matching identity and recency, and does not admit', async () => {
  const actor = await user(), other = await user(), id = randomUUID(), reference = randomUUID();
  await db.query("insert into bookings(id,client_name,client_email,date,start_minutes,duration_minutes,notes) values($1,'Guest',$2,current_date+30,600,60,$3)",[id,actor.email,JSON.stringify({appBooking:{bookingReference:reference}})]);
  const request = {bookings:[{id,booking_reference:reference}]};
  await assert.rejects(rpc(other,'link_recent_guest_booking_to_client',[request]),/not available to link/);
  await assert.rejects(rpc(actor,'link_recent_guest_booking_to_client',[{bookings:[{id,booking_reference:'wrong'}]}]),/not available to link/);
  assert.deepEqual(await rpc(actor,'link_recent_guest_booking_to_client',[request]),[id]);
  assert.equal((await rpc(actor,'get_my_client_access')).status,null);
  await db.query("update bookings set created_at=now()-interval '25 hours' where id=$1",[id]);
  await assert.rejects(rpc(actor,'link_recent_guest_booking_to_client',[request]),/not available to link/);
});

test('BLOCKED cannot revive or reassign an existing booking by direct UPDATE', async () => {
  const actor = await user(true), other = await user(), id = randomUUID();
  await db.query("insert into bookings(id,user_id,client_name,client_email,date,start_minutes,duration_minutes,status) values($1,$2,'Client',$3,current_date+30,600,60,'cancelled')",[id,actor.id,actor.email]);
  await block(actor);
  const result = await asRole('authenticated',actor,"update bookings set status='confirmed',user_id=$2 where id=$1 returning id",[id,other.id]);
  assert.equal(result.rows.length,0);
  await assert.rejects(rpc(actor,'reschedule_client_booking',[id,await nextDate(),600]),/cannot be rescheduled/);
});
