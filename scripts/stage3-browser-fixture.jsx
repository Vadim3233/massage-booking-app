// Isolated browser QA entry. Only the dedicated local fixture server imports it.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ClientOnboarding} from '../src/components/Client/ClientOnboarding.jsx';
import {AdminClientAccessPanel} from '../src/components/Admin/AdminClientAccessPanel.jsx';
import {validateOnboardingProfile} from '../src/lib/invitationContext.js';
const params=new URLSearchParams(location.search);
const scenario=params.get('fixture') || 'signed-out';
let status=scenario==='blocked'?'BLOCKED':['active','incomplete'].includes(scenario)?'ACTIVE':null;
let complete=scenario==='active';
let user=['profile','active','incomplete','blocked','no-access'].includes(scenario)?{id:'local-client',email:'client@example.test',email_confirmed_at:'2026-09-07',user_metadata:{full_name:'Jo Client'}}:null;
let invitationState=['expired','revoked','linked','invalid'].includes(scenario)?scenario.toUpperCase():'UNUSED';
const listeners=new Set();
let rows=[{id:'one',intended_name:'Invited client',status:'UNUSED',created_at:'2026-09-07',expires_at:'2026-10-07'}, {id:'two',intended_name:'Expired invitation',status:'EXPIRED',created_at:'2026-07-01',expires_at:'2026-08-01'},{id:'three',status:'LINKED',linked_client_name:'Jo Client',created_at:'2026-09-01',expires_at:'2026-10-01'}];
let clients=[{user_id:'local-client',full_name:'Jo Client',email:'client@example.test',mobile:'+447700900123',status:'ACTIVE',admission_source:'INVITATION',admitted_at:'2026-09-07',invitation_id:'three'}];
const mock={
  auth:{getUser:async()=>({data:{user}}),onAuthStateChange:callback=>{listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}};},
    signInWithOAuth:async({options})=>{if(options.redirectTo.includes('/invite/'))throw new Error('Unsafe redirect');location.assign('/onboarding?fixture=profile');return {};},
    signInWithOtp:async()=>({}),signOut:async()=>{user=null;listeners.forEach(fn=>fn());return {}; }},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})}),
  rpc:async(name,args={})=>{
    if(scenario==='network')return {error:{message:'synthetic failure'}};
    if(name==='current_user_is_booking_admin')return {data:scenario!=='non-admin'};
    if(name==='get_my_client_access')return {data:{status,profile_complete:complete}};
    if(name==='validate_client_invitation')return {data:{status:invitationState,valid:invitationState==='UNUSED'}};
    if(name==='accept_client_invitation'||name==='complete_my_client_profile'){
      if(validateOnboardingProfile(args.profile_fields))return {error:{message:'validation'}};
      status='ACTIVE';complete=true;invitationState='LINKED';return {data:{status}};
    }
    if(name==='admin_list_client_invitations')return {data:rows};
    if(name==='admin_list_client_access')return {data:clients};
    if(name==='admin_create_client_invitation'){rows=[{id:'new',...args,status:'UNUSED',created_at:'2026-09-07',expires_at:'2026-10-07'},...rows];return {data:{id:'new',token:'b'.repeat(64)}};}
    if(name==='admin_revoke_client_invitation'){rows=rows.map(row=>row.id===args.invitation_id?{...row,status:'REVOKED'}:row);return {data:{}};}
    if(name==='admin_block_client'||name==='admin_unblock_client'){clients=clients.map(row=>row.user_id===args.target_user_id?{...row,status:name==='admin_block_client'?'BLOCKED':'ACTIVE'}:row);return {data:{}};}
    return {error:{message:'Unknown fixture RPC'}};
  }
};
createRoot(document.getElementById('root')).render(<>
  <aside style={{padding:12,background:'#eee'}}>Isolated local UI fixture — no Supabase connection. <a href="/?fixture=admin-invitations">Invitations</a> · <a href="/?fixture=admin-access">Client Access</a> · <a href="/?fixture=blocked">Blocked client</a></aside>
  {scenario.startsWith('admin-')||scenario==='non-admin'?<AdminClientAccessPanel client={mock} mode={scenario==='admin-access'?'access':'invitations'}/>:<ClientOnboarding client={mock} onMyBookings={()=>{document.getElementById('fixture-management').hidden=false;}}/>}
  <section id="fixture-management" hidden>My Bookings opened. Existing booking management is covered by the Stage 2 database tests.</section>
</>);
