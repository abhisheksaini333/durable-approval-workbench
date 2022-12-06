import '../support/env';
import {randomUUID} from 'crypto';
import {Server} from 'http';
import {Pool} from 'pg';
import {Connection,WorkflowClient} from '@temporalio/client';
import {Worker,NativeConnection} from '@temporalio/worker';
import {EffectStore,migrateEffects,Operation} from '../../src/provisioner/store';
import {providerApp} from '../../src/provisioner/app';
import {providerActivities} from '../../src/activities/http';
import {DomainError} from '../../src/domain';
export const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export class FixtureStore extends EffectStore {
 calls:{requestId:string;operation:string}[]=[];
 faults=new Map<string,{block?:Promise<void>;entered?:()=>void;lost?:boolean;refuse?:boolean}>();
 async apply(operation:Operation,value:any){this.calls.push({requestId:value.requestId,operation});const fault=this.faults.get(value.requestId+':'+operation);if(fault){fault.entered?.();if(fault.block)await fault.block;if(fault.refuse)throw new DomainError('fixture_failure','Injected provider rejection',409)}const result=await super.apply(operation,value);if(fault?.lost){fault.lost=false;throw new Error('Injected lost acknowledgement after durable write')}return result}
}
export class Runtime {
 pool=new Pool({connectionString:process.env.DATABASE_URL});store=new FixtureStore(this.pool);server?:Server;port=0;
 connection!:Connection;native!:NativeConnection;client!:WorkflowClient;worker?:Worker;running?:Promise<void>;
 queue='acceptance-'+randomUUID();token='runtime-fixture-provider-token-at-least-32-characters';handles:any[]=[];
 async open(){await migrateEffects(this.pool);await this.startProvider();const address=process.env.TEMPORAL_ADDRESS||'127.0.0.1:4904';this.connection=await Connection.connect({address,connectTimeout:5000});this.native=await NativeConnection.connect({address});this.client=new WorkflowClient({connection:this.connection,namespace:'default'});await this.startWorker()}
 async startProvider(){this.server=providerApp(this.store,this.token).listen(this.port,'127.0.0.1');await new Promise<void>((r,j)=>{this.server!.once('listening',r);this.server!.once('error',j)});this.port=(this.server.address() as any).port}
 async stopProvider(){if(this.server){await new Promise<void>(r=>this.server!.close(()=>r()));this.server=undefined}}
 async startWorker(){this.worker=await Worker.create({connection:this.native,namespace:'default',taskQueue:this.queue,workflowsPath:require.resolve('../../src/workflows/onboarding'),activities:providerActivities('http://127.0.0.1:'+this.port,this.token),maxConcurrentActivityTaskExecutions:4,maxConcurrentWorkflowTaskExecutions:4,shutdownGraceTime:'3 seconds'});this.running=this.worker.run()}
 async stopWorker(){if(this.worker){this.worker.shutdown();await this.running;this.worker=undefined}}
 async start(timeout=60000){const id=randomUUID(),h=await this.client.start('onboarding',{workflowId:'runtime-'+id,taskQueue:this.queue,args:[{request:{customer:'Runtime customer',plan:'standard',seats:5},metadata:{requestId:id,tenantId:'runtime',requesterId:'requester'},policy:{stages:['security'],approvalTimeoutMs:timeout,reminderAfterMs:Math.floor(timeout/2)}}]});this.handles.push(h);await h.query('snapshot');return {h,id}}
 command(id=randomUUID(),patch:any={}){return {id,stage:'security',choice:'approve',note:'Runtime verification',revision:0,actor:{id:'reviewer',tenantId:'runtime',roles:['security-reviewer']},...patch}}
 async approve(h:any,command=this.command()){await h.signal('decision',command);return command}
 async receipt(h:any,id:string){for(let i=0;i<100;i++){const state=await h.query('snapshot');const result=state.receipts.find((x:any)=>x.id===id);if(result)return result;await pause(30)}throw new Error('Receipt timeout')}
 async close(){for(const h of this.handles)try{await h.terminate()}catch{}await this.stopWorker();await this.stopProvider();await this.native?.close();await this.connection?.close();await this.pool.end()}
}
