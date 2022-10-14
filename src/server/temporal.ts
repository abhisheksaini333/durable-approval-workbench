import {Connection,WorkflowClient,WorkflowIdReusePolicy,WorkflowExecutionAlreadyStartedError,WorkflowNotFoundError} from '@temporalio/client';
import {Actor,Decision,Policy,DomainError} from '../domain';
import {RequestRecord} from './registry';
import {Workflows} from './app';
export class TemporalWorkflows implements Workflows {
 constructor(readonly connection:Connection,readonly client:WorkflowClient,readonly taskQueue:string,readonly namespace:string){}
 async bounded<T>(fn:()=>Promise<T>):Promise<T>{try{return await this.connection.withDeadline(Date.now()+3000,fn)}catch(error){if(error instanceof DomainError)throw error;if(error instanceof WorkflowNotFoundError)throw new DomainError('workflow_unavailable','Workflow state is unavailable; retry or contact an operator',503);throw new DomainError('workflow_unavailable','The workflow service is temporarily unavailable',503)}}
 async ready(){await this.bounded(()=>this.connection.workflowService.describeNamespace({namespace:this.namespace}));}
 async start(entry:RequestRecord,policy:Policy){
  if(entry.startedAt)return;
  await this.bounded(async()=>{try{await this.client.start('onboarding',{workflowId:entry.workflowId,taskQueue:this.taskQueue,workflowIdReusePolicy:WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,args:[{request:entry.input,metadata:{requestId:entry.id,tenantId:entry.tenantId,requesterId:entry.requesterId},policy}]})}catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error}});
 }
 query(entry:RequestRecord){return this.bounded(()=>this.client.getHandle(entry.workflowId).query<any>('snapshot'));}
 async decide(entry:RequestRecord,command:Decision){await this.bounded(()=>this.client.getHandle(entry.workflowId).signal('decision',command));}
 async cancel(entry:RequestRecord,actor:Actor){await this.bounded(()=>this.client.getHandle(entry.workflowId).signal('cancel',actor));}
}
