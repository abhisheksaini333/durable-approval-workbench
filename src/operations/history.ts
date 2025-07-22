import {Connection} from '@temporalio/client';
import {temporal} from '@temporalio/proto';
import {Worker} from '@temporalio/worker';
import {readFileSync,writeFileSync} from 'fs';
export async function exportHistory(connection:Connection,namespace:string,workflowId:string,file:string){
 const events:any[]=[],seen=new Set<string>();let nextPageToken:Uint8Array|undefined,pages=0;
 do{if(++pages>1000)throw new Error('History export page limit exceeded');const response=await connection.withDeadline(Date.now()+5000,()=>connection.workflowService.getWorkflowExecutionHistory({namespace,execution:{workflowId},nextPageToken}));events.push(...response.history?.events||[]);if(events.length>100000)throw new Error('History exceeds export limit');nextPageToken=response.nextPageToken?.length?response.nextPageToken:undefined;if(nextPageToken){const key=Buffer.from(nextPageToken).toString('base64');if(seen.has(key))throw new Error('Repeated history continuation token');seen.add(key)}}while(nextPageToken);
 const history=temporal.api.history.v1.History.create({events});const text=JSON.stringify(history.toJSON(),null,2)+'\n';if(Buffer.byteLength(text)>20_000_000)throw new Error('History exceeds export size');writeFileSync(file,text,{flag:'wx',mode:0o600});return {events:events.length,bytes:Buffer.byteLength(text)};
}
export async function replayHistory(file:string){const text=readFileSync(file,'utf8');if(Buffer.byteLength(text)>20_000_000)throw new Error('History exceeds replay size');await Worker.runReplayHistory({workflowsPath:require.resolve('../workflows/onboarding')},temporal.api.history.v1.History.fromObject(JSON.parse(text)));}
