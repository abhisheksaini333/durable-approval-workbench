import {strict as assert} from 'assert';
import {TemporalWorkflows} from '../../src/server/temporal';
import {WorkflowExecutionAlreadyStartedError} from '@temporalio/client';
const record:any={id:'request-1',workflowId:'workflow-1',tenantId:'acme',requesterId:'owner',input:{customer:'Acme',plan:'standard',seats:3},startedAt:null};
const policy:any={stages:['security'],approvalTimeoutMs:60000,reminderAfterMs:30000};
describe('Temporal gateway',()=>{
 it('starts once with duplicate rejection and bounded RPC time',async()=>{const calls:any[]=[];const connection:any={withDeadline:async(d:number,fn:()=>any)=>{assert.ok(d>Date.now());assert.ok(d<Date.now()+4000);return fn()}};const client:any={start:async(t:any,o:any)=>calls.push([t,o]),getHandle:()=>({})};const adapter=new TemporalWorkflows(connection,client,'switchboard','default');await adapter.start(record,policy);assert.equal(calls[0][1].workflowIdReusePolicy,3);assert.equal(calls[0][1].args[0].metadata.tenantId,'acme');await adapter.start({...record,startedAt:'already-started'},policy);assert.equal(calls.length,1)});
 it('redacts service failures and tolerates already-started admissions',async()=>{const connection:any={withDeadline:async(_d:any,fn:any)=>fn()};const client:any={start:async()=>{throw new WorkflowExecutionAlreadyStartedError('exists','workflow-1','onboarding')},getHandle:()=>({query:async()=>{throw new Error('internal-service-password')}})};const adapter=new TemporalWorkflows(connection,client,'switchboard','default');await adapter.start(record,policy);await assert.rejects(()=>adapter.query(record),(e:any)=>e.status===503&&!e.message.includes('password'))});
});
