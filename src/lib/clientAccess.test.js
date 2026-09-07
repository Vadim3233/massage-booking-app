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

test('all client entry points are gated and persistence has no anonymous or direct-insert fallback', () => {
  const adminWorkspace = readFileSync(new URL('../components/Admin/LiveAdminWorkspace.jsx',import.meta.url),'utf8');
  for (const source of [app,adminWorkspace]) {
    assert.match(source,/async function createBookingHoldInSupabase\([^]*?const supabase = await getSupabaseClient\(\)/);
    assert.match(source,/async function releaseBookingHoldInSupabase\([^]*?const supabase = await getSupabaseClient\(\)/);
  }
  for (const name of ['continueToCheckoutDetails','selectTimeSlot','confirmPayment']) {
    const start = app.indexOf(`async function ${name}(`);
    assert.ok(start>=0,name);
    assert.match(app.slice(start,start+1800),/bookingAccess\.refresh\(\)/,name);
  }
  assert.match(app,/clientStep !== "my-bookings"[\s\S]{0,140}!bookingAccess.allowed/);
  const persistence = readFileSync(new URL('./bookingSupabase.js',import.meta.url),'utf8');
  const saving = persistence.slice(persistence.indexOf('export async function saveBookingToSupabase('),persistence.indexOf('export async function',persistence.indexOf('export async function saveBookingToSupabase(')+30));
  assert.match(saving,/await getSupabaseClient\(\)/);
  assert.doesNotMatch(saving,/getPublicSupabaseClient|\.insert\(/);
  assert.match(app.slice(app.indexOf('async function addBookingToDay('),app.indexOf('async function createAdminAppointment(')),/await saveBookingToSupabase\(/);
});

test('access notice renders sign-in, retry and My Bookings without production admin control', async () => {
  const account = readFileSync(new URL('../components/Client/ClientAccountPanel.jsx',import.meta.url),'utf8');
  const notice = readFileSync(new URL('../components/Client/ClientBookingAccessNotice.jsx',import.meta.url),'utf8');
  const source = [account,notice].map(value=>value.replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function').replaceAll('import.meta.env.DEV','false')).join('\n');
  const {code} = await transformWithOxc(source,'access-notice.jsx',{jsx:{runtime:'classic'}});
  const Notice = new Function('React','useState',`${code}; return ClientBookingAccessNotice;`)(React,React.useState);
  const signedOut = renderToStaticMarkup(React.createElement(Notice,{message:CLIENT_ACCESS_MESSAGES.CLIENT_AUTH_REQUIRED}));
  assert.match(signedOut,/Continue with Google/); assert.match(signedOut,/My Bookings/); assert.doesNotMatch(signedOut,/>Admin</);
  const blocked = renderToStaticMarkup(React.createElement(Notice,{message:CLIENT_ACCESS_MESSAGES.CLIENT_ACCESS_BLOCKED,session:{user:{email:'client@example.test'}}}));
  assert.match(blocked,/role="alert"/); assert.match(blocked,/Check access again/); assert.match(blocked,/My Bookings/); assert.match(blocked,/Sign out/);
});
