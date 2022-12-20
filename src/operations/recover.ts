import {parseEffect,Operation} from '../provisioner/store';
export async function recoverResource(snapshot:any,expectedRequestId:string,execute:(operation:Operation,input:any)=>Promise<void>){
 if(snapshot?.status!=='compensation_failed'||snapshot.request?.requestId!==expectedRequestId)throw new Error('Recovery requires a matching request in compensation_failed state');
 const input=parseEffect(snapshot.request);await execute('deactivate',input);await execute('release',input);return {requestId:input.requestId,operations:['deactivate','release'],workflowStatus:snapshot.status};
}
