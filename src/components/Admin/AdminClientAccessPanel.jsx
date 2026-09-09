import React, { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/bookingSupabase.js";
import "../../styles/clientAccess.css";

export function AdminClientAccessPanel({ client: suppliedClient }) {
  const [rows,setRows]=useState([]), [offset,setOffset]=useState(0), [ready,setReady]=useState(false), [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(""), [confirmation,setConfirmation]=useState(null), [reason,setReason]=useState("");
  const generation=useRef(0);
  async function rpc(name,args={}) {
    const client=suppliedClient || await getSupabaseClient();
    const {data:allowed,error:adminError}=await client.rpc("current_user_is_booking_admin");
    if(adminError || allowed!==true) throw new Error("denied");
    const {data,error}=await client.rpc(name,args); if(error) throw new Error("failed"); return data;
  }
  async function load() {
    const version=++generation.current; setReady(false);
    try { const data=await rpc("admin_list_client_access",{page_offset:offset}); if(version===generation.current){setRows(data||[]);setReady(true);} }
    catch { if(version===generation.current){setRows([]);setMessage("This view requires verified admin access and an available connection. Please try again.");} }
  }
  useEffect(()=>{setMessage("");setConfirmation(null);void load();return()=>{generation.current++;};},[offset,suppliedClient]);
  async function change() {
    if(busy||!confirmation)return; setBusy(true);setMessage("");
    try { await rpc(confirmation.action==="block"?"admin_block_client":"admin_unblock_client",{target_user_id:confirmation.id,reason:reason.trim()||null});setConfirmation(null);setReason("");await load();setMessage("Saved."); }
    catch { setMessage("The change could not be confirmed. Refresh the list to check its current status."); } finally { setBusy(false); }
  }
  const date=value=>value?new Date(value).toLocaleString():"—";
  return <section className="client-access-page client-access-admin" aria-label="Client Access">
    <h2>Client Access</h2><p>Manage whether client accounts can create new bookings.</p>
    <button disabled={busy} onClick={()=>{setMessage("");void load();}}>Refresh list</button>
    {!ready&&<p role="status">Checking admin access and loading records...</p>}{message&&<p role="status">{message}</p>}
    {confirmation&&<section className="client-access-confirm" role="group" aria-label="Confirm access change">
      <h3>{confirmation.action==="block"?"Block new booking access?":"Restore booking access?"}</h3><p>{confirmation.name}</p>
      {confirmation.action==="block"&&<p>Existing appointments remain available under the current rules.</p>}
      <label>Private reason (optional)<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button disabled={busy} onClick={change}>Confirm {confirmation.action}</button><button disabled={busy} onClick={()=>{setConfirmation(null);setReason("");}}>Cancel</button>
    </section>}
    {ready&&rows.length===0&&<p>No records on this page.</p>}
    {ready&&rows.map(row=><article key={row.user_id} className="client-access-record">
      <h3>{row.full_name||row.email||"Client account"}</h3><strong>{row.status}</strong>
      <dl>{[["Account ID",row.user_id],["Email",row.email],["Mobile",row.mobile],["Admission source",row.admission_source],["Admitted",date(row.admitted_at)]].filter(([,v])=>v).map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
      <button disabled={busy} onClick={()=>{setReason("");setConfirmation({action:row.status==="ACTIVE"?"block":"unblock",id:row.user_id,name:row.full_name||row.email});}}>{row.status==="ACTIVE"?"Block booking access":"Unblock booking access"}</button>
    </article>)}
    <div className="client-access-actions"><button disabled={busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous page</button><button disabled={busy||!ready||rows.length<50} onClick={()=>setOffset(offset+50)}>Next page</button></div>
  </section>;
}
