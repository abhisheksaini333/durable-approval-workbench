import {Connection,WorkflowClient} from '@temporalio/client';
import {loadConfig,loadEnvironment} from '../src/server/config';
import {callProvider} from '../src/activities/http';
import {recoverResource} from '../src/operations/recover';
async function main(){const [workflowId,requestId]=process.argv.slice(2);if(!workflowId||!requestId)throw new Error('Usage: ts-node scripts/recover.ts WORKFLOW_ID EXPECTED_REQUEST_ID');loadEnvironment();const config=loadConfig(),connection=await Connection.connect({address:config.temporalAddress,connectTimeout:5000});try{const client=new WorkflowClient({connection,namespace:config.namespace});const snapshot=await connection.withDeadline(Date.now()+5000,()=>client.getHandle(workflowId).query('snapshot'));const result=await recoverResource(snapshot,requestId,(operation,input)=>callProvider(config.providerUrl,config.providerToken,operation,input));console.log(JSON.stringify({...result,note:'Provider cleanup completed; the immutable workflow result remains an incident record.'}))}finally{await connection.close()}}
main().catch(error=>{console.error(error.message);process.exit(1)});
