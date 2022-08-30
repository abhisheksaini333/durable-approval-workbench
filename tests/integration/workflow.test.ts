import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker} from '@temporalio/worker';
import {onboarding, snapshot, decide, cancel} from '../../src/workflows/onboarding';
const policy={stages:['security'],approvalTimeoutMs:20000,reminderAfterMs:10000};
const input={request:{customer:'Acme',plan:'standard',seats:3},metadata:{requestId:'req-1',tenantId:'acme',requesterId:'requester'},policy};
const reviewer={id:'reviewer',tenantId:'acme',roles:['security-reviewer']};
describe('real Temporal workflow',function(){
 this.timeout(90000);let env:TestWorkflowEnvironment;
 before(async()=>{env=await TestWorkflowEnvironment.create({testServer:{path:process.env.TEMPORAL_TEST_SERVER||process.cwd()+'/.tools/temporal-test-server-1.14.0'}})});
 after(async()=>{if(env)await env.teardown()});
 async function exercise(fn:(h:any)=>Promise<void>,override:any={}){
  const taskQueue='test-'+randomUUID();
  const worker=await Worker.create({connection:env.nativeConnection,taskQueue,workflowsPath:require.resolve('../../src/workflows/onboarding'),activities:{}});
  await worker.runUntil(async()=>{const h=await env.workflowClient.start(onboarding,{workflowId:randomUUID(),taskQueue,args:[{...input,...override}]});try{await fn(h)}finally{try{await h.terminate()}catch{}}});
 }
 it('queries pending state and records a durable rejection receipt',async()=>exercise(async h=>{
  assert.equal((await h.query(snapshot)).status,'pending');
  await h.signal(decide,{id:'decision-1',stage:'security',actor:reviewer,choice:'reject',note:'Missing review evidence',revision:0});
  const result=await h.result();assert.equal(result.status,'rejected');assert.equal(result.receipts[0].outcome,'accepted');
 }));
});
