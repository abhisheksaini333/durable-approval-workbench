import {strict as assert} from 'assert';
import {mkdirSync,writeFileSync} from 'fs';
import {Runtime,pause} from './harness';
import {recoverResource} from '../../src/operations/recover';
import {callProvider} from '../../src/activities/http';
import {exportHistory,replayHistory} from '../../src/operations/history';
describe('Temporal server and PostgreSQL recovery acceptance',function(){
 this.timeout(90000);const runtime=new Runtime();
 before(()=>runtime.open());after(()=>runtime.close());
 it('records a signal while the worker is stopped and completes the same execution after restart',async()=>{
  const {h}=await runtime.start(),run=h.firstExecutionRunId;await runtime.stopWorker();const command=runtime.command(undefined,{choice:'reject'});await runtime.approve(h,command);await runtime.startWorker();const result=await h.result();assert.equal(result.status,'rejected');assert.equal(h.firstExecutionRunId,run);assert.equal(result.receipts[0].id,command.id);
  mkdirSync('.local/histories',{recursive:true});const file='.local/histories/'+h.workflowId+'.json';await exportHistory(runtime.connection,'default',h.workflowId,file);await replayHistory(file);
 });
 it('retries a provider outage and a lost acknowledgement without duplicate logical effects',async()=>{
  const {h,id}=await runtime.start();runtime.store.faults.set(id+':reserve',{lost:true});await runtime.stopProvider();await runtime.approve(h);await pause(1800);await runtime.startProvider();const result=await h.result();assert.equal(result.status,'approved');assert.ok(runtime.store.calls.filter(x=>x.requestId===id&&x.operation==='reserve').length>=2);assert.equal((await runtime.pool.query('SELECT * FROM provider_receipts WHERE request_id=$1',[id])).rowCount,2);await runtime.stopProvider();await runtime.startProvider();assert.equal((await runtime.store.inspect(id)).activated,true);
 });
 it('cancels an in-flight real provider request and reverses the persisted reservation',async()=>{
  const {h,id}=await runtime.start();let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),block=new Promise<void>(r=>release=r);runtime.store.faults.set(id+':reserve',{block,entered:enter});await runtime.approve(h);await entered;await h.signal('cancel',{id:'requester',tenantId:'runtime',roles:['requester']});assert.equal((await h.query('snapshot')).status,'cancelling');release();const result=await h.result();assert.equal(result.status,'cancelled');assert.deepEqual(runtime.store.calls.filter(x=>x.requestId===id).map(x=>x.operation),['reserve','release']);const resource=await runtime.store.inspect(id);assert.equal(resource.reserved,false);assert.equal(resource.activated,false);assert.equal(resource.released,true);
 });
 it('exposes incomplete compensation and permits idempotent operator cleanup',async()=>{
  const {h,id}=await runtime.start();runtime.store.faults.set(id+':activate',{refuse:true});runtime.store.faults.set(id+':release',{refuse:true});await runtime.approve(h);const result=await h.result();assert.equal(result.status,'compensation_failed');assert.equal(result.errorCode,'manual_recovery_required');assert.equal((await runtime.store.inspect(id)).reserved,true);runtime.store.faults.delete(id+':release');const cleanup=()=>recoverResource(result,id,(operation,input)=>callProvider('http://127.0.0.1:'+runtime.port,runtime.token,operation,input));await cleanup();await cleanup();assert.equal((await runtime.store.inspect(id)).reserved,false);
 });
 it('rejects unauthorized decisions and expires while its worker is offline',async()=>{
  const first=await runtime.start();for(const actor of [{id:'requester',tenantId:'runtime',roles:['security-reviewer']},{id:'intruder',tenantId:'other',roles:['security-reviewer']},{id:'viewer',tenantId:'runtime',roles:['requester']}]){const command=runtime.command(undefined,{actor});await runtime.approve(first.h,command);assert.equal((await runtime.receipt(first.h,command.id)).outcome,'rejected')}await first.h.signal('cancel',{id:'requester',tenantId:'runtime',roles:['requester']});assert.equal((await first.h.result()).status,'cancelled');
  const {h,id}=await runtime.start(2000);await runtime.stopWorker();await pause(2200);await runtime.approve(h);await runtime.startWorker();const result=await h.result();assert.equal(result.status,'expired');assert.equal(await runtime.store.inspect(id),null);
 });
 it('measures twelve concurrent complete workflows with bounded worker capacity',async()=>{
  const start=Date.now();const handles=await Promise.all(Array.from({length:12},()=>runtime.start()));await Promise.all(handles.map(({h})=>runtime.approve(h)));const results=await Promise.all(handles.map(({h})=>h.result()));assert.ok(results.every(x=>x.status==='approved'));const resources=await runtime.pool.query('SELECT * FROM provider_receipts WHERE request_id=ANY($1::text[])',[handles.map(x=>x.id)]);assert.equal(resources.rowCount,24);const measurement={workflows:12,workerActivityConcurrency:4,workerWorkflowConcurrency:4,elapsedMilliseconds:Date.now()-start,logicalEffects:resources.rowCount,scope:'Local Temporal 1.17.1 and PostgreSQL 13; this is a bounded smoke measurement, not a capacity forecast'};mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/runtime-load.json',JSON.stringify(measurement,null,2)+'\n');
 });
 /* CASES */
});
