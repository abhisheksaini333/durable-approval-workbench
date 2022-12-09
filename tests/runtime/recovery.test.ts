import {strict as assert} from 'assert';
import {mkdirSync,writeFileSync} from 'fs';
import {Runtime,pause} from './harness';
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
 /* CASES */
});
