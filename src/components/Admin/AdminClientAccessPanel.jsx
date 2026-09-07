import React, { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/bookingSupabase.js';
import '../../styles/clientAccess.css';

export function AdminClientAccessPanel({ mode = 'invitations', client: suppliedClient }) {
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [draft, setDraft] = useState({intended_name:'',mobile:'',source_note:''});
  const [confirmation, setConfirmation] = useState(null);
  const [reason, setReason] = useState('');
  const generation = useRef(0);
  const getClient = () => suppliedClient ? Promise.resolve(suppliedClient) : getSupabaseClient();
  async function rpc(name, args = {}) {
    const client = await getClient();
    const {data:allowed,error:adminError} = await client.rpc('current_user_is_booking_admin');
    if (adminError || allowed !== true) throw new Error('denied');
    const {data,error} = await client.rpc(name,args);
    if (error) throw new Error('failed');
    return data;
  }
  async function load() {
    const version=++generation.current;
    setReady(false); setLink('');
    try {
      const data=await rpc(mode === 'invitations' ? 'admin_list_client_invitations' : 'admin_list_client_access',{page_offset:offset});
      if (version!==generation.current) return;
      setRows(data || []); setReady(true);
    } catch { if(version===generation.current) {setRows([]);setMessage('This view requires verified admin access and an available connection. Please try again.');} }
  }
  useEffect(()=>{setMessage('');setConfirmation(null);void load();return ()=>{generation.current++;};},[mode,offset,suppliedClient]);
  useEffect(()=>{if(!link)return;const timer=setTimeout(()=>setLink(''),5*60*1000);return ()=>clearTimeout(timer);},[link]);
  useEffect(()=>{
    const clear=()=>setLink('');
    const hidden=()=>{if(document.hidden)clear();};
    window.addEventListener('pagehide',clear);document.addEventListener('visibilitychange',hidden);
    return ()=>{window.removeEventListener('pagehide',clear);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  async function create(event) {
    event.preventDefault();if(busy)return;
    setBusy(true);setLink('');setMessage('');
    try {
      const data=await rpc('admin_create_client_invitation',draft);
      await load();
      if(!/^[0-9a-f]{64}$/.test(data?.token))throw new Error('invalid response');
      setLink(`https://booking.vadmassage.com/invite/${data.token}`);
      setDraft({intended_name:'',mobile:'',source_note:''});
      setMessage('Invitation created. Copy the link now; it cannot be recovered later.');
    } catch {setMessage('The invitation could not be created or verified. Refresh the list before trying again.');}
    finally {setBusy(false);}
  }
  async function copy() {
    try {await navigator.clipboard.writeText(link);setLink('');setMessage('Invitation link copied. It is now cleared from this view.');}
    catch {setMessage('Copy is unavailable. Select and copy the displayed link, then dismiss it.');}
  }
  async function change() {
    if(busy || !confirmation)return;setBusy(true);setMessage('');setLink('');
    try {
      const action=confirmation.action;
      await rpc(action==='revoke'?'admin_revoke_client_invitation':action==='block'?'admin_block_client':'admin_unblock_client',
        action==='revoke'?{invitation_id:confirmation.id}:{target_user_id:confirmation.id,reason:reason.trim() || null});
      setConfirmation(null);setReason('');await load();setMessage('Saved.');
    } catch {setMessage('The change could not be confirmed. Refresh the list to check its current status.');}
    finally {setBusy(false);}
  }
  const date=value=>value?new Date(value).toLocaleString(): '—';
  return <section className="client-access-page client-access-admin" aria-label={mode==='invitations'?'Invitations':'Client Access'}>
    <h2>{mode==='invitations'?'Invitations':'Client Access'}</h2>
    <p>{mode==='invitations'?'Create a private invitation for a new client. Links are available only when created.':'Authoritative account access. Hiding or deleting a customer in booking history does not block their account.'}</p>
    <button disabled={busy} onClick={()=>{setMessage('');void load();}}>Refresh list</button>
    {!ready && <p role="status">Checking admin access and loading records...</p>}
    {message && <p role="status">{message}</p>}
    {ready && mode==='invitations' && <form onSubmit={create}>
      <label>Intended client name (optional)<input maxLength={200} value={draft.intended_name} onChange={e=>setDraft({...draft,intended_name:e.target.value})} /></label>
      <label>Mobile number (optional)<input type="tel" maxLength={40} value={draft.mobile} onChange={e=>setDraft({...draft,mobile:e.target.value})} /></label>
      <label>Source or referral note (optional)<textarea maxLength={500} value={draft.source_note} onChange={e=>setDraft({...draft,source_note:e.target.value})} /></label>
      <button disabled={busy}>Generate invitation</button>
    </form>}
    {link && <div><label>Copy now — this link cannot be recovered later<input aria-label="New invitation link" readOnly value={link} onFocus={e=>e.target.select()} /></label><button onClick={copy}>Copy invitation link</button><button onClick={()=>setLink('')}>Dismiss link</button></div>}
    {confirmation && <section className="client-access-confirm" role="group" aria-label="Confirm access change">
      <h3>{confirmation.action==='block'?'Block new booking access?':confirmation.action==='unblock'?'Restore booking access?':'Revoke this invitation?'}</h3>
      <p>{confirmation.name}</p>
      {confirmation.action==='block' && <p>Existing appointments remain available to view, cancel and reschedule under the current rules.</p>}
      {confirmation.action!=='revoke' && <label>Private reason (optional)<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></label>}
      <button disabled={busy} onClick={change}>Confirm {confirmation.action}</button><button disabled={busy} onClick={()=>{setConfirmation(null);setReason('');}}>Cancel</button>
    </section>}
    {ready && rows.length===0 && <p>No records on this page.</p>}
    {ready && rows.map(row=><article key={row.id || row.user_id} className="client-access-record">
      <h3>{row.intended_name || row.full_name || row.email || 'Client invitation'}</h3><strong>{row.status}</strong>
      <dl>{(mode==='invitations' ? [['Created',date(row.created_at)],['Expires',date(row.expires_at)],['Linked client',row.linked_client_name || row.linked_user_id],['Mobile',row.mobile],['Source',row.source_note]]
        : [['Account ID',row.user_id],['Email',row.email],['Mobile',row.mobile],['Admission source',row.admission_source],['Admitted',date(row.admitted_at)],['Invitation',row.invitation_id]]).filter(([,value])=>value).map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
      {mode==='invitations' ? <>
        {row.status==='UNUSED' && <button disabled={busy} onClick={()=>setConfirmation({action:'revoke',id:row.id,name:row.intended_name || row.id})}>Revoke invitation</button>}
        {['EXPIRED','REVOKED'].includes(row.status) && <button disabled={busy} onClick={()=>{setDraft({intended_name:row.intended_name || '',mobile:row.mobile || '',source_note:row.source_note || ''});setMessage('Replacement details prepared. Use Generate invitation to create a new link.');window.scrollTo(0,0);}}>Prepare replacement</button>}
      </> : <button disabled={busy} onClick={()=>{setReason('');setConfirmation({action:row.status==='ACTIVE'?'block':'unblock',id:row.user_id,name:row.full_name || row.email});}}>{row.status==='ACTIVE'?'Block booking access':'Unblock booking access'}</button>}
    </article>)}
    <div className="client-access-actions"><button disabled={busy || offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous page</button><button disabled={busy || !ready || rows.length<50} onClick={()=>setOffset(offset+50)}>Next page</button></div>
  </section>;
}
