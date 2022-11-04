import React,{useEffect,useState} from 'react';
import {Actor,Snapshot,api} from './api';
import {PendingIntent,intentKey,readIntent,saveIntent} from './intent';
export function Review({snapshot:s,actor}:{snapshot:Snapshot;actor:Actor}){
 const key=intentKey(actor.tenantId,actor.id),stored=readIntent(sessionStorage,key);
 const [intent,setIntent]=useState<PendingIntent|null>(stored?.kind==='decision'&&stored.requestId===s.request.requestId?stored:null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const allowed=s.status==='pending'&&actor.id!==s.request.requesterId&&actor.roles.includes(s.stage+'-reviewer');
 async function send(choice:'approve'|'reject'){
  setBusy(true);setError('');try{const pending=intent||{kind:'decision' as const,id:crypto.randomUUID(),requestId:s.request.requestId,payload:{stage:s.stage,choice,note,revision:s.revision}};saveIntent(sessionStorage,key,pending);setIntent(pending);await api('/requests/'+s.request.requestId+'/decisions',{method:'POST',body:{...(pending.payload as object),id:pending.id}});setMessage('Decision submitted. Waiting for the workflow receipt.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 if(!allowed&&!intent)return null;
 return <section className="review" aria-labelledby="review-title"><h3 id="review-title">{intent?'Decision awaiting confirmation':(s.stage==='security'?'Security':'Commercial')+' review'}</h3>{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}{!intent&&<label className="field">Decision note<textarea rows={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/><small>The note is retained in the request history.</small></label>}<div className="actions">{intent?<button disabled={busy} onClick={()=>send((intent.payload as any).choice)}>Retry this decision</button>:<><button className="primary" disabled={busy} onClick={()=>send('approve')}>Approve request</button><button className="danger" disabled={busy} onClick={()=>send('reject')}>Reject request</button></>}</div></section>
}
