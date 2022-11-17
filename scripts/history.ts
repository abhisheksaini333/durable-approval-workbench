import {Connection} from '@temporalio/client';
import {exportHistory,replayHistory} from '../src/operations/history';
import {loadConfig,loadEnvironment} from '../src/server/config';
async function main(){const [command,file,workflowId]=process.argv.slice(2);if(!file||!['export','replay'].includes(command))throw new Error('Usage: ts-node scripts/history.ts export|replay FILE [WORKFLOW_ID]');if(command==='replay'){await replayHistory(file);console.log('History replay passed');return}if(!workflowId)throw new Error('Workflow identity is required');loadEnvironment();const config=loadConfig(),connection=await Connection.connect({address:config.temporalAddress});try{console.log(await exportHistory(connection,config.namespace,workflowId,file))}finally{await connection.close()}}
main().catch(error=>{console.error(error.message);process.exit(1)});
