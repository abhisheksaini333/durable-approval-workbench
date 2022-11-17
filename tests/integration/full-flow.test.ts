import '../support/env';
import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {mkdirSync,readFileSync} from 'fs';
import {Server} from 'http';
import {Pool} from 'pg';
import request from 'supertest';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {Worker} from '@temporalio/worker';
import {Registry,migrate} from '../../src/server/registry';
import {EffectStore,migrateEffects} from '../../src/provisioner/store';
import {providerApp} from '../../src/provisioner/app';
import {providerActivities} from '../../src/activities/http';
import {TemporalWorkflows} from '../../src/server/temporal';
import {createApp} from '../../src/server/app';
import {authenticateToken} from '../../src/server/auth';
import {exportHistory,replayHistory} from '../../src/operations/history';
describe('signed API through real workflow and provider',function(){
 this.timeout(120000);let env:TestWorkflowEnvironment,worker:Worker,running:Promise<void>,provider:Server,app:any,privateKey:any,keys:any;
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),registry=new Registry(pool),store=new EffectStore(pool),tenant='tenant-'+randomUUID();
 const config={origin:'http://localhost:4900',issuer:'http://localhost:4901/realms/switchboard',audience:'switchboard-api',clientId:'switchboard',policy:{stages:['security','commercial'] as any,approvalTimeoutMs:60000,reminderAfterMs:30000}};
 const token='integration-provider-token-at-least-32-characters';
 before(async()=>{
  await migrate(pool);await migrateEffects(pool);const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;keys=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'integration',alg:'RS256'}]});
  provider=providerApp(store,token).listen(0,'127.0.0.1');await new Promise<void>(r=>provider.once('listening',r));
  env=await TestWorkflowEnvironment.create({testServer:{path:process.env.TEMPORAL_TEST_SERVER||process.cwd()+'/.tools/temporal-test-server-1.14.0'}});const taskQueue='full-'+randomUUID();
  worker=await Worker.create({connection:env.nativeConnection,taskQueue,workflowsPath:require.resolve('../../src/workflows/onboarding'),activities:providerActivities('http://127.0.0.1:'+(provider.address() as any).port,token),shutdownGraceTime:'3 seconds'});running=worker.run();
  app=createApp({registry,config,workflows:new TemporalWorkflows(env.connection,env.workflowClient,taskQueue,'default'),authenticate:header=>authenticateToken(header,keys,config)});
 });
 after(async()=>{if(worker){worker.shutdown();await running}if(env)await env.teardown();if(provider)await new Promise<void>(r=>provider.close(()=>r()));await pool.end()});
 async function identity(id:string,roles:string[],tenantId=tenant){return new SignJWT({tenant_id:tenantId,realm_access:{roles}}).setSubject(id).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('5m').setProtectedHeader({alg:'RS256',kid:'integration'}).sign(privateKey)}
 async function view(id:string,token:string){return (await request(app).get('/api/requests/'+id).set('Authorization','Bearer '+token).expect(200)).body}
 async function waitReceipt(id:string,token:string,decisionId:string){const deadline=Date.now()+10000;while(Date.now()<deadline){const state=await view(id,token);if(state.receipts.some((r:any)=>r.id===decisionId))return state;await new Promise(r=>setTimeout(r,50))}throw new Error('Receipt did not arrive')}
 it('completes approved onboarding with one logical effect per operation',async()=>{
  const owner=await identity('requester',['requester']),security=await identity('security',['security-reviewer']),commercial=await identity('commercial',['commercial-reviewer']),outsider=await identity('outsider',['operator'],'other');
  const body={customer:'Full flow customer',plan:'enterprise',seats:12},key=randomUUID();
  const submit=()=>request(app).post('/api/requests').set('Authorization','Bearer '+owner).set('Idempotency-Key',key).send(body);
  const first=await submit().expect(202),id=first.body.id;assert.equal((await submit().expect(202)).body.id,id);
  await request(app).get('/api/requests/'+id).set('Authorization','Bearer '+outsider).expect(404);
  const decision={id:randomUUID(),stage:'security',choice:'approve',note:'Evidence checked',revision:0};
  await request(app).post('/api/requests/'+id+'/decisions').set('Authorization','Bearer '+owner).send(decision).expect(403);
  const send=()=>request(app).post('/api/requests/'+id+'/decisions').set('Authorization','Bearer '+security).send(decision);
  await send().expect(202);let state=await waitReceipt(id,security,decision.id);assert.equal(state.receipts[0].outcome,'accepted');await send().expect(202);
  const second={id:randomUUID(),stage:'commercial',choice:'approve',note:'Terms verified',revision:state.revision};await request(app).post('/api/requests/'+id+'/decisions').set('Authorization','Bearer '+commercial).send(second).expect(202);
  const entry=await registry.get({id:'requester',tenantId:tenant,roles:['requester']},id);state=await env.workflowClient.getHandle(entry.workflowId).result();assert.equal(state.status,'approved');assert.equal(state.receipts.length,2);
  const resource=await store.inspect(id);assert.equal(resource.reserved,true);assert.equal(resource.activated,true);assert.equal((await pool.query('SELECT * FROM provider_receipts WHERE request_id=$1',[id])).rowCount,2);
  mkdirSync('.local/histories',{recursive:true});const file='.local/histories/'+id+'.json';const exported=await exportHistory(env.connection,'default',entry.workflowId,file);assert.ok(exported.events>15);await replayHistory(file);
  assert.ok(JSON.parse(readFileSync(file,'utf8')).events.length>15);
 });
});
