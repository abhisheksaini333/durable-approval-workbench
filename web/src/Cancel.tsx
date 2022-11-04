import React,{useState} from 'react';
import {Actor,Snapshot,api} from './api';
export function Cancel({snapshot:s,actor}:{snapshot:Snapshot;actor:Actor}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!['pending','provisioning','cancelling'].includes(s.status)||(actor.id!==s.request.requesterId&&!actor.roles.includes('operator')))return null;
 async function cancel(){setBusy(true);try{await api('/requests/'+s.request.requestId+'/cancel',{method:'POST',body:{}});setMessage('Cancellation submitted. Any completed provisioning steps will be cleaned up.');setConfirm(false)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="review" aria-label="Cancel request">{message&&<p role="status">{message}</p>}{s.status==='cancelling'?<p role="status">Cancellation is in progress. Waiting for cleanup confirmation.</p>:confirm?<><p>Cancel onboarding for <strong>{s.request.customer}</strong>?</p><div className="actions"><button className="danger" disabled={busy} onClick={cancel}>Confirm cancellation</button><button disabled={busy} onClick={()=>setConfirm(false)}>Keep request</button></div></>:<button className="text-button" onClick={()=>setConfirm(true)}>Cancel this request</button>}</section>
}
