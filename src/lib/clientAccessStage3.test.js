import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {bookingFixtureSql,stage2Sql} from './testSupport/clientBookingAccessFixture.js';
import {adminId,adminEmail,validProfile} from './testSupport/clientAccessFixture.js';
import {readInvitationContext,clearInvitationContext,onboardingRedirect,validateOnboardingProfile,invitationMessages} from './invitationContext.js';
const migration=readFileSync(new URL('../../supabase/migrations/20260907140000_client_access_admin_directory.sql',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../public/invitation-bootstrap.js',import.meta.url),'utf8');
const token='a'.repeat(64);
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('invitation bootstrap captures only in session storage and removes token/query/hash from visible URL',()=>{
  const sessionStorage=storage();let clean;
  vm.runInNewContext(bootstrap,{window:{location:{pathname:`/invite/${token}`},history:{replaceState:(_,__,url)=>{clean=url;}}},sessionStorage,Date,localStorage:{setItem(){assert.fail('localStorage used');}}});
  assert.equal(clean,'/onboarding');assert.equal(readInvitationContext(sessionStorage),token);
  clearInvitationContext(sessionStorage);assert.equal(sessionStorage.getItem('vad-invitation-context'),null);
});
test('malformed invitation paths fail closed and are cleaned',()=>{
  for(const value of ['%2Fbad','short',`${token}/more`]){
    const sessionStorage=storage();let clean;
    vm.runInNewContext(bootstrap,{window:{location:{pathname:`/invite/${value}`},history:{replaceState:(_,__,url)=>{clean=url;}}},sessionStorage,Date});
    assert.equal(clean,'/onboarding');assert.equal(readInvitationContext(sessionStorage),null);
  }
});
test('temporary context survives same-tab callback but is absent in another tab or after TTL',()=>{
  const s=storage();s.setItem('vad-invitation-context',JSON.stringify({token,capturedAt:1000}));
  assert.equal(readInvitationContext(s,2000),token);assert.equal(readInvitationContext(storage(),2000),null);
  assert.equal(readInvitationContext(s,86401001),null);
});
test('OAuth redirect is fixed and token-free even from invitation path or stale origin',()=>{
  assert.equal(onboardingRedirect({production:true,origin:'https://old.vercel.app/invite/'+token}),'https://booking.vadmassage.com/onboarding');
  assert.equal(onboardingRedirect({production:false,origin:'http://localhost:5173'}),'http://localhost:5173/onboarding');
});
test('required fields validate without email/address and combined name must be confirmed',()=>{
  assert.ok(validateOnboardingProfile({first_name:'Full Display Name',last_name:'',mobile:'+447700900123'}));
  assert.ok(validateOnboardingProfile({...validProfile,mobile:''}));
  assert.equal(validateOnboardingProfile(validProfile),'');
  for(const state of ['INVALID','EXPIRED','REVOKED','LINKED','LOST'])assert.ok(invitationMessages[state]);
});
test('token handling has no localStorage, logging, analytics or profile email override',()=>{
  const context=readFileSync(new URL('./invitationContext.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/Client/ClientOnboarding.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(bootstrap+context+ui,/localStorage|console\.|analytics|captureException/);
  assert.match(ui,/email_confirmed_at/);assert.match(ui,/profile_fields:fields/);
  assert.doesNotMatch(ui,/setFields\(\{[^}]*email:/);
  assert.match(ui,/shouldCreateUser:state.invited === true/);
  assert.match(ui,/get_my_client_access/);
});

const db=new PGlite({extensions:{pgcrypto}});await db.exec(bookingFixtureSql);await db.exec(stage2Sql);await db.exec(migration);after(()=>db.close());
async function call(name,args={},admin=true){return db.transaction(async tx=>{
  await tx.exec('set local role authenticated');
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin?adminId:'00000000-0000-4000-8000-000000000002',email:admin?adminEmail:'client@example.test'})]);
  const entries=Object.entries(args);const r=await tx.query(`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) as result`,entries.map(([,value])=>value));return r.rows[0].result;
});}
let invitation;
test('admin creates invitation and list exposes safe projection, never token/hash',async()=>{
  invitation=await call('admin_create_client_invitation',{intended_name:'New client'});
  const rows=await call('admin_list_client_invitations');assert.equal(rows[0].id,invitation.id);assert.equal(rows[0].status,'UNUSED');
  assert.ok(!JSON.stringify(rows).includes(invitation.token));assert.ok(!JSON.stringify(rows).includes('token'));
});
test('non-admin and anonymous cannot use admin list API or mutation APIs',async()=>{
  for(const name of ['admin_list_client_invitations','admin_list_client_access']){
    await assert.rejects(call(name,{},false),/admin access/);
    assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') as allowed",[`public.${name}(integer)`])).rows[0].allowed,false);
  }
  await assert.rejects(call('admin_create_client_invitation',{},false),/admin access/);
  await assert.rejects(call('admin_revoke_client_invitation',{invitation_id:invitation.id},false),/admin access/);
});
test('validation repeats without consumption; revoked and expired statuses derive correctly',async()=>{
  for(let i=0;i<2;i++)assert.equal((await call('validate_client_invitation',{token:invitation.token},false)).status,'UNUSED');
  await call('admin_revoke_client_invitation',{invitation_id:invitation.id});
  assert.equal((await call('admin_list_client_invitations'))[0].status,'REVOKED');
  const expired=await call('admin_create_client_invitation');
  await db.query("update client_access_private.client_invitations set created_at=now()-interval '31 days',expires_at=now()-interval '1 day' where id=$1",[expired.id]);
  assert.equal((await call('validate_client_invitation',{token:expired.token},false)).status,'EXPIRED');
  assert.ok((await call('admin_list_client_invitations')).some(row=>row.id===expired.id&&row.status==='EXPIRED'));
});
test('onboarding validation failure leaves invitation UNUSED; confirmed identity admits atomically',async()=>{
  await db.query("insert into auth.users values('00000000-0000-4000-8000-000000000002','client@example.test',now())");
  const created=await call('admin_create_client_invitation');
  await assert.rejects(call('accept_client_invitation',{token:created.token,profile_fields:{...validProfile,mobile:''}},false));
  assert.equal((await call('validate_client_invitation',{token:created.token},false)).status,'UNUSED');
  await call('accept_client_invitation',{token:created.token,profile_fields:validProfile},false);
  const rows=await call('admin_list_client_access');assert.equal(rows[0].email,'client@example.test');assert.equal(rows[0].status,'ACTIVE');
  assert.ok((await call('admin_list_client_invitations')).some(row=>row.id===created.id&&row.status==='LINKED'));
});
test('block/unblock is durable and private reason is absent from client/admin list projections',async()=>{
  const id='00000000-0000-4000-8000-000000000002';
  await call('admin_block_client',{target_user_id:id,reason:'Private reason'});
  assert.equal((await call('admin_list_client_access'))[0].status,'BLOCKED');
  assert.ok(!JSON.stringify(await call('admin_list_client_access')).includes('Private reason'));
  assert.ok(!JSON.stringify(await call('get_my_client_access',{},false)).includes('Private reason'));
  await assert.rejects(call('admin_unblock_client',{target_user_id:id},false),/admin access/);
  await call('admin_unblock_client',{target_user_id:id});assert.equal((await call('get_my_client_access',{},false)).status,'ACTIVE');
});
test('directories are bounded, reject invalid pages and have fixed search paths',async()=>{
  await assert.rejects(call('admin_list_client_access',{page_offset:-1}),/Invalid page/);
  assert.deepEqual(await call('admin_list_client_access',{page_offset:50}),[]);
  for(const name of ['admin_list_client_access','admin_list_client_invitations']){
    const {rows:[fn]}=await db.query('select prosecdef,proconfig from pg_proc where proname=$1',[name]);assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog']);
  }
});
