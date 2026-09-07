import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import * as context from './invitationContext.js';

const token='c'.repeat(64);
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function environment(invited=true,path='/onboarding'){
  const s=storage();if(invited)s.setItem('vad-invitation-context',JSON.stringify({token,capturedAt:Date.now()}));
  global.window={sessionStorage:s,location:{pathname:path,origin:'http://localhost:5179',search:'',hash:'',assign:()=>{}},history:{replaceState:()=>{}},addEventListener:()=>{},removeEventListener:()=>{},scrollTo:()=>{}};
  global.sessionStorage=s;global.document={addEventListener:()=>{},removeEventListener:()=>{},hidden:false};
}
async function mount(component,props){
  const values=[],refs=[],effects=[];let cursor=0,refCursor=0,initial=true,tree;
  const source=readFileSync(new URL(`../components/${component}.jsx`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function').replaceAll('import.meta.env.DEV','false');
  const name=component.split('/').at(-1);
  const {code}=await transformWithOxc(source,`${name}.jsx`,{jsx:{runtime:'classic'}});
  const hooks={React,useState:(initialValue)=>{const i=cursor++;if(!(i in values))values[i]=initialValue;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useRef:value=>{const i=refCursor++;return refs[i] ||= {current:value};},useEffect:fn=>{if(initial)effects.push(fn);},getSupabaseClient:async()=>{throw new Error('Unexpected real client');},...context};
  const Component=new Function(...Object.keys(hooks),`${code};return ${name};`)(...Object.values(hooks));
  const render=()=>{cursor=0;refCursor=0;tree=Component(props);initial=false;};render();const cleanup=effects.map(fn=>fn());
  const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));render();};
  const nodes=()=>{const out=[];const visit=node=>{if(!node)return;if(Array.isArray(node)){node.forEach(visit);return;}if(typeof node==='object'){out.push(node);visit(node.props?.children);}};visit(tree);return out;};
  const text=node=>{if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node);};
  return {flush,text:()=>text(tree),nodes,async click(label){const node=nodes().find(node=>node.type==='button'&&text(node)===label);assert.ok(node,`Missing button ${label}`);await node.props.onClick?.({preventDefault(){}});await flush();},async submit(){const form=nodes().find(node=>node.type==='form');assert.ok(form);await form.props.onSubmit({preventDefault(){}});await flush();},async fill(label,value){const node=nodes().find(node=>node.type==='label'&&text(node).startsWith(label));assert.ok(node,label);const input=React.Children.toArray(node.props.children).find(child=>child?.type==='input'||child?.type==='textarea');input.props.onChange({target:{value}});await flush();},close(){cleanup.forEach(fn=>fn?.());}};
}
function mock({status=null,complete=false,signedIn=false,invitation='UNUSED',admin=true,network=false}={}){
  const calls=[];let currentStatus=status,currentComplete=complete;
  const user=signedIn?{id:'id',email:'verified@example.test',email_confirmed_at:'2026-09-07',user_metadata:{full_name:'Full Display Name'}}:null;
  return {calls,auth:{getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithOAuth:async args=>{calls.push(['google',args]);return {};},signInWithOtp:async args=>{calls.push(['email',args]);return {};},signOut:async()=>({})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),rpc:async(name,args)=>{
    calls.push([name,args]);if(network)return {error:{message:'private error'}};
    if(name==='current_user_is_booking_admin')return {data:admin};
    if(name==='get_my_client_access')return {data:{status:currentStatus,profile_complete:currentComplete}};
    if(name==='validate_client_invitation')return {data:{status:invitation,valid:invitation==='UNUSED'}};
    if(name==='accept_client_invitation'||name==='complete_my_client_profile'){currentStatus='ACTIVE';currentComplete=true;return {data:{}};}
    if(name==='admin_list_client_invitations')return {data:[{id:'invite',status:'UNUSED',intended_name:'Client'}]};
    if(name==='admin_list_client_access')return {data:[{user_id:'client',full_name:'Client',status:'ACTIVE'}]};
    if(name==='admin_create_client_invitation')return {data:{token}};
    return {data:{}};
  }};
}
test('initial render is loading without booking controls',async()=>{
  environment();const ui=await mount('Client/ClientOnboarding',{client:mock()});assert.match(ui.text(),/Checking your booking access/);assert.doesNotMatch(ui.text(),/Continue to booking/);ui.close();
});
for(const state of ['INVALID','EXPIRED','REVOKED','LINKED'])test(`terminal ${state} clears invitation context without redemption`,async()=>{
  environment();const client=mock({invitation:state}),ui=await mount('Client/ClientOnboarding',{client});await ui.flush();assert.ok(ui.text().includes(context.invitationMessages[state]));assert.equal(context.readInvitationContext(),null);assert.ok(!client.calls.some(([name])=>name==='accept_client_invitation'));ui.close();
});
test('lost OAuth context fails safely without admission',async()=>{
  environment(false);const client=mock({signedIn:true}),ui=await mount('Client/ClientOnboarding',{client});await ui.flush();assert.match(ui.text(),/reopen your original invitation/);assert.ok(!client.calls.some(([name])=>name==='accept_client_invitation'));ui.close();
});
test('invited Google and email authenticate with token-free redirect and no redemption',async()=>{
  environment();const client=mock(),ui=await mount('Client/ClientOnboarding',{client});await ui.flush();await ui.click('Continue with Google');await ui.click('Continue with email');await ui.fill('Email address','entered@example.test');await ui.submit();
  assert.equal(client.calls.find(([name])=>name==='google')[1].options.redirectTo,'http://localhost:5179/onboarding');
  assert.equal(client.calls.find(([name])=>name==='email')[1].options.shouldCreateUser,true);
  assert.equal(context.readInvitationContext(),token);assert.ok(!client.calls.some(([name])=>name==='accept_client_invitation'));ui.close();
});
test('returning email login does not create an account or grant access',async()=>{
  environment(false,'/');const client=mock(),ui=await mount('Client/ClientOnboarding',{client});await ui.flush();await ui.click('Continue with email');await ui.fill('Email address','returning@example.test');await ui.submit();assert.equal(client.calls.find(([name])=>name==='email')[1].options.shouldCreateUser,false);assert.ok(!client.calls.some(([name])=>name==='accept_client_invitation'));ui.close();
});
test('editable name prefill, required mobile, verified email and atomic redemption',async()=>{
  environment();const client=mock({signedIn:true}),ui=await mount('Client/ClientOnboarding',{client});await ui.flush();assert.match(ui.text(),/verified@example.test/);
  assert.ok(ui.nodes().some(node=>node.type==='input'&&node.props.value==='Full Display Name'));
  await ui.fill('First name','Jo');await ui.fill('Last name','Client');await ui.submit();assert.match(ui.text(),/valid mobile/);assert.ok(!client.calls.some(([name])=>name==='accept_client_invitation'));
  await ui.fill('Mobile number','+447700900123');await ui.submit();const accepted=client.calls.find(([name])=>name==='accept_client_invitation')[1];assert.equal(accepted.token,token);assert.deepEqual(Object.keys(accepted.profile_fields).sort(),['first_name','last_name','mobile']);assert.match(ui.text(),/Continue to booking/);assert.equal(context.readInvitationContext(),null);ui.close();
});
for(const [status,complete,label] of [['ACTIVE',true,'Continue to booking'],['ACTIVE',false,'Complete your booking account'],['BLOCKED',true,'Online booking is not currently available'],[null,false,'Online booking is available by invitation']])test(`returning state ${status}/${complete}`,async()=>{
  environment(false,'/');const ui=await mount('Client/ClientOnboarding',{client:mock({status,complete,signedIn:true})});await ui.flush();assert.ok(ui.text().includes(label));if(status!=='ACTIVE'||!complete)assert.doesNotMatch(ui.text(),/Continue to booking/);assert.match(ui.text(),/My Bookings/);ui.close();
});
test('backend failure is controlled and never exposes raw error',async()=>{
  environment();const ui=await mount('Client/ClientOnboarding',{client:mock({network:true})});await ui.flush();assert.match(ui.text(),/couldn't check/);assert.doesNotMatch(ui.text(),/private error/);ui.close();
});
test('non-admin UI never exposes creation or access actions',async()=>{
  environment(false,'/');const client=mock({admin:false}),ui=await mount('Admin/AdminClientAccessPanel',{client});await ui.flush();assert.doesNotMatch(ui.text(),/Generate invitation|Block booking access/);assert.ok(!client.calls.some(([name])=>name==='admin_list_client_invitations'));ui.close();
});
test('admin create link is transient and list refresh clears it',async()=>{
  environment(false,'/');const client=mock(),ui=await mount('Admin/AdminClientAccessPanel',{client});await ui.flush();await ui.submit();assert.ok(ui.nodes().some(node=>node.type==='input'&&String(node.props.value).includes('/invite/')));await ui.click('Refresh list');assert.ok(!ui.nodes().some(node=>node.type==='input'&&String(node.props.value).includes('/invite/')));ui.close();
});
test('admin blocking requires explicit confirmation and uses account UUID',async()=>{
  environment(false,'/');const client=mock(),ui=await mount('Admin/AdminClientAccessPanel',{client,mode:'access'});await ui.flush();await ui.click('Block booking access');assert.ok(!client.calls.some(([name])=>name==='admin_block_client'));await ui.click('Confirm block');assert.equal(client.calls.find(([name])=>name==='admin_block_client')[1].target_user_id,'client');ui.close();
});
test('privacy notice is routed and linked from onboarding',()=>{
  const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
  const onboarding=readFileSync(new URL('../components/Client/ClientOnboarding.jsx',import.meta.url),'utf8');
  const notice=readFileSync(new URL('../components/Client/PrivacyNotice.jsx',import.meta.url),'utf8');
  assert.match(main,/route === ["']\/privacy["']/);
  assert.match(onboarding,/href=["']\/privacy["']/);
  assert.match(notice,/bookings@vadmassage\.com/);
  for (const provider of ['Supabase','Vercel','Resend','Google','Telegram']) assert.match(notice,new RegExp(provider));
  assert.match(notice,/special-category data/);
  assert.match(notice,/Information Commissioner/);
});
test('terms are public, routed and linked without breaking the privacy route',async()=>{
  environment(false,'/terms');
  const ui=await mount('Client/TermsOfService',{});
  await ui.flush();
  const copy=ui.text();
  assert.match(copy,/Terms of Service/);
  assert.match(copy,/short grace period may also apply immediately after a booking is made/);
  assert.match(copy,/awaiting verification/);
  assert.match(copy,/Privacy Notice/);
  assert.doesNotMatch(copy,/Checking your booking access/);
  ui.close();

  const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8');
  const onboarding=readFileSync(new URL('../components/Client/ClientOnboarding.jsx',import.meta.url),'utf8');
  const privacy=readFileSync(new URL('../components/Client/PrivacyNotice.jsx',import.meta.url),'utf8');
  const vercel=readFileSync(new URL('../../vercel.json',import.meta.url),'utf8');
  assert.match(main,/route === ["']\/terms["']/);
  assert.match(main,/route === ["']\/privacy["']/);
  assert.match(onboarding,/href=["']\/terms["']/);
  assert.match(privacy,/href=["']\/terms["']/);
  assert.match(vercel,/"source": "\/terms"/);
});
