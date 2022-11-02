import React,{useEffect,useState} from 'react';
import {initializeIdentity,Session} from './auth';
import {Queue} from './Queue';
export function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[login,setLogin]=useState<(()=>Promise<void>)|null>(null);
 useEffect(()=>{initializeIdentity().then(value=>{setSession(value.session);setLogin(()=>value.login)},e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 if(!session)return <main className="welcome"><div className="wordmark">S<span>↗</span> SWITCHBOARD</div><p className="eyebrow">CUSTOMER ONBOARDING</p><h1>Every approval,<br/><em>accounted for.</em></h1><p className="lede">Review customer requests, follow every decision, and keep onboarding moving.</p>{error&&<p className="error" role="alert">{error} <button onClick={()=>window.location.reload()}>Retry</button></p>}<button className="primary" disabled={loading||!login} onClick={()=>login?.().catch(e=>setError(e.message))}>{loading?'Connecting workspace…':'Sign in to your workspace →'}</button><div className="welcome-line"><span>01 · REQUEST</span><span>02 · REVIEW</span><span>03 · ACTIVATE</span></div></main>;
 return <Workspace session={session}/>;
}
function Workspace({session}:{session:Session}){
 const [selected,setSelected]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 return <div className="shell"><a className="skip" href="#workspace">Skip to workspace</a><header className="topbar"><div className="wordmark">S<span>↗</span> SWITCHBOARD</div><div className="identity"><span>{session.actor.tenantId} · {session.actor.roles.join(', ')}</span><button onClick={()=>session.logout()}>Sign out</button></div></header><main id="workspace" className="workspace"><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Approval inbox</h1><p className="quiet">A clear next step for every customer request.</p></div><button onClick={()=>setRefresh(x=>x+1)}>Refresh</button></div><div className="columns"><Queue actor={session.actor} selected={selected} onSelect={setSelected} refresh={refresh}/><div className="detail empty"><h2>{selected?'Request selected':'Your next decision starts here'}</h2><p>{selected||'Choose a request to review its status and history.'}</p></div></div><footer className="footer"><span>Switchboard / Customer operations</span><span>Decisions stay attached to their requests.</span></footer></main></div>
}
