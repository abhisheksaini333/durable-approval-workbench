import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker} from '@temporalio/worker';
import {ApplicationFailure} from '@temporalio/common';
import {onboarding, snapshot, decide, cancel} from '../../src/workflows/onboarding';
const policy={stages:['security'],approvalTimeoutMs:20000,reminderAfterMs:10000};
const input={request:{customer:'Acme',plan:'standard',seats:3},metadata:{requestId:'req-1',tenantId:'acme',requesterId:'requester'},policy};
const reviewer={id:'reviewer',tenantId:'acme',roles:['security-reviewer']};
describe('real Temporal workflow',function(){
 this.timeout(90000);let env:TestWorkflowEnvironment;
 before(async()=>{env=await TestWorkflowEnvironment.create({testServer:{path:process.env.TEMPORAL_TEST_SERVER||process.cwd()+'/.tools/temporal-test-server-1.14.0'}})});
 after(async()=>{if(env)await env.teardown()});
 async function exercise(fn:(h:any)=>Promise<void>,override:any={},activities:any={}){
  const taskQueue='test-'+randomUUID();
  const worker=await Worker.create({connection:env.nativeConnection,taskQueue,workflowsPath:require.resolve('../../src/workflows/onboarding'),activities});
  const running=worker.run();let h:any;try{h=await env.workflowClient.start(onboarding,{workflowId:randomUUID(),taskQueue,args:[{...input,...override}]});await h.query(snapshot);await fn(h)}finally{if(h)try{await h.terminate()}catch{}worker.shutdown();await running}
 }
 it('queries pending state and records a durable rejection receipt',async()=>exercise(async h=>{
  assert.equal((await h.query(snapshot)).status,'pending');
  await h.signal(decide,{id:'decision-1',stage:'security',actor:reviewer,choice:'reject',note:'Missing review evidence',revision:0});
  const result=await h.result();assert.equal(result.status,'rejected');assert.equal(result.receipts[0].outcome,'accepted');
 }));
 it('expires on the durable deadline',async()=>exercise(async h=>{
  await env.sleep(21000);assert.equal((await h.query(snapshot)).status,'expired');
 }));
 it('records one reminder before approval expiry',async()=>exercise(async h=>{
  await env.sleep(11000);const s=await h.query(snapshot);assert.equal(s.status,'pending');assert.equal(s.reminded,true);
  assert.equal(s.audit.filter((x:any)=>x.event==='review_reminder').length,1);
 }));
 it('reserves then activates after the final approval',async()=>{
  const effects:string[]=[];
  await exercise(async h=>{await h.signal(decide,{id:'approve-1',stage:'security',actor:reviewer,choice:'approve',note:'Verified',revision:0});
   const s=await h.result();assert.equal(s.status,'approved');assert.equal(s.reserved,true);assert.equal(s.activated,true);assert.deepEqual(effects,['reserve','activate']);
  },{}, {reserve:async()=>{effects.push('reserve')},activate:async()=>{effects.push('activate')}});
 });
 it('compensates attempted effects in reverse order',async()=>{
  const effects:string[]=[];
  await exercise(async h=>{await h.signal(decide,{id:'approve-2',stage:'security',actor:reviewer,choice:'approve',note:'',revision:0});
   let failed=false,result:any;try{result=await h.result()}catch{failed=true}assert.equal(failed,false);assert.equal(result.status,'failed');assert.deepEqual(effects,['reserve','activate','deactivate','release']);
  },{}, {reserve:async()=>{effects.push('reserve')},activate:async()=>{effects.push('activate');throw ApplicationFailure.nonRetryable('declined','ProviderRejected')},deactivate:async()=>{effects.push('deactivate')},release:async()=>{effects.push('release')}});
 });
 it('cancels in-flight provisioning and compensates the reservation',async()=>{
  const effects:string[]=[];let entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r);let unblock:()=>void=()=>{};const gate=new Promise<void>(r=>unblock=r);
  await exercise(async h=>{await h.signal(decide,{id:'approve-3',stage:'security',actor:reviewer,choice:'approve',note:'',revision:0});await started;
   await h.signal(cancel,{id:'requester',tenantId:'acme',roles:['requester']});assert.equal((await h.query(snapshot)).status,'cancelling');unblock();
   const s=await h.result();assert.equal(s.status,'cancelled');assert.deepEqual(effects,['reserve','release']);
  },{}, {reserve:async()=>{effects.push('reserve');entered();await gate},activate:async()=>{effects.push('activate')},release:async()=>{effects.push('release')}});
 });
});
