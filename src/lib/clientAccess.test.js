import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { requireClientBookingAccess, clientAccessErrorMessage, CLIENT_ACCESS_MESSAGES } from './clientAccess.js';
import { bookingHoldErrorMessage } from './bookingHoldErrors.js';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
function client(status = 'ACTIVE', profile_complete = true, options = {}) {
  return { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: 'actor' } } }) },
    rpc: async (name) => ({ data: name === 'current_user_is_booking_admin' ? options.admin === true : { status, profile_complete }, error: options.error }) };
}
for (const [status, complete, options, code] of [
  ['ACTIVE',true,{signedOut:true},'CLIENT_AUTH_REQUIRED'],
  [null,true,{},'CLIENT_ACCESS_REQUIRED'],
  ['BLOCKED',true,{},'CLIENT_ACCESS_BLOCKED'],
  ['ACTIVE',false,{},'CLIENT_PROFILE_INCOMPLETE'],
  ['ACTIVE',true,{error:{message:'internal database error'}},'CLIENT_ACCESS_UNAVAILABLE'],
]) test(`frontend preflight fails closed: ${code}`, async () => {
  await assert.rejects(requireClientBookingAccess(client(status,complete,options)), (error) => error.code === code && error.message === CLIENT_ACCESS_MESSAGES[code]);
});
test('ACTIVE complete and server-verified admin pass frontend preflight', async () => {
  assert.equal((await requireClientBookingAccess(client())).status,'ACTIVE');
  assert.equal((await requireClientBookingAccess(client('BLOCKED',false,{admin:true}))).admin,true);
});
test('RPC access errors become controlled client wording', () => {
  for (const [code,message] of Object.entries(CLIENT_ACCESS_MESSAGES)) {
    assert.equal(clientAccessErrorMessage({message:code}),message);
    assert.equal(bookingHoldErrorMessage({message:code}),message);
  }
});

const offerFunction = app.slice(app.indexOf('  async function acceptWaitlistOffer('),app.indexOf('  async function updateBooking(id, patch)'));
for (const status of [null,'BLOCKED','ACTIVE']) test(`actual waitlist handler with manipulated local offer: ${status}`, async () => {
  const calls = []; let message = '';
  const slot = {start:600,end:660,bufferEnd:720};
  const entry = {id:'offer',status:'offered',offeredSlot:slot,offeredDayIndex:0,duration:60,offeredServiceId:'massage',clientName:'Spoofed name'};
  const dependencies = {
    waitlistEntries:[entry],getEffectiveWaitlistStatus: (value) => value.status,
    days:[{dateValue:'2026-09-10',settings:{},bookings:[]}],activeBookingsForDay:value=>value,
    getSchedulingPreview:()=>({slots:[slot]}),DEFAULT_TRAVEL_BUFFER:60,
    requireClientBookingAccess,getSupabaseClient:async()=>client(status),
    createBookingHoldInSupabase:async()=>{calls.push('hold');return {id:'hold',token:'token'};},
    releaseBookingHoldInSupabase:async()=>{calls.push('release');},
    addBookingToDay:async(_,booking)=>{calls.push('booking');assert.equal(booking.hold.id,'hold');assert.equal(booking.userId,'actor');return {id:'booking'};},
    authSession:{user:{id:'actor',email:'actor@example.test'}},clientProfile:{fullName:'Actual client',phone:'+447700900123'},
    setWaitlistEntries:()=>calls.push('accepted'),setSelectedDayIndex:()=>{},
    setClientBookingMessage:value=>{message=value;},clientAccessErrorMessage,console:{error:()=>{}},
  };
  const handler = new Function(...Object.keys(dependencies),`${offerFunction}; return acceptWaitlistOffer;`)(...Object.values(dependencies));
  await handler('offer');
  assert.deepEqual(calls,status==='ACTIVE'?['hold','booking','accepted']:[]);
  if (status!=='ACTIVE') assert.ok(message);
});

test('one client shell gates booking and preserves blocked owned-data access', () => {
  const portal = readFileSync(new URL('../components/Client/ClientPortal.jsx',import.meta.url),'utf8');
  assert.match(portal,/SIGN(?:ED_OUT|ED_OUT)/);
  assert.match(portal,/PROFILE_REQUIRED/);
  assert.match(portal,/data\?\.status === "BLOCKED"/);
  assert.match(portal,/access\.kind === "ACTIVE" && <button[^]*Book appointment/);
  assert.match(portal,/My Bookings/);
  assert.match(portal,/Online booking is currently unavailable for this account\. Please contact me\./);
  assert.doesNotMatch(app,/ClientOnboarding|ClientBookingAccessNotice/);
});

test('booking creation remains protected at each side-effect entry point', () => {
  for (const name of ['continueToCheckoutDetails','selectTimeSlot','confirmPayment']) {
    const start=app.indexOf(`async function ${name}(`); assert.ok(start>=0,name);
    assert.match(app.slice(start,start+1800),/bookingAccess\.refresh\(\)/,name);
  }
  const persistence=readFileSync(new URL('./bookingSupabase.js',import.meta.url),'utf8');
  const saving=persistence.slice(persistence.indexOf('export async function saveBookingToSupabase('),persistence.indexOf('export async function',persistence.indexOf('export async function saveBookingToSupabase(')+30));
  assert.match(saving,/await getSupabaseClient\(\)/); assert.doesNotMatch(saving,/getPublicSupabaseClient|\.insert\(/);
});
