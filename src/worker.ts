import {Worker,NativeConnection} from '@temporalio/worker';
import {loadConfig,loadEnvironment} from './server/config';
import {providerActivities} from './activities/http';
async function main(){loadEnvironment();const config=loadConfig();const connection=await NativeConnection.connect({address:config.temporalAddress});try{const worker=await Worker.create({connection,namespace:config.namespace,taskQueue:config.taskQueue,workflowsPath:require.resolve('./workflows/onboarding'),activities:providerActivities(config.providerUrl,config.providerToken),maxConcurrentActivityTaskExecutions:8,maxConcurrentWorkflowTaskExecutions:8,shutdownGraceTime:'10 seconds'});await worker.run()}finally{await connection.close()}}
main().catch(()=>{console.error(JSON.stringify({event:'worker_failed'}));process.exit(1)});
