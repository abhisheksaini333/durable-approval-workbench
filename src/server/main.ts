import express from 'express';
import {existsSync} from 'fs';
import {resolve} from 'path';
import {Pool} from 'pg';
import {Connection,WorkflowClient} from '@temporalio/client';
import {loadConfig,loadEnvironment} from './config';
import {Registry,migrate} from './registry';
import {TemporalWorkflows} from './temporal';
import {remoteAuthenticator} from './auth';
import {createApp} from './app';
import {gracefulServer} from './lifecycle';
async function main(){
 loadEnvironment();const config=loadConfig();const pool=new Pool({connectionString:config.databaseUrl,max:10,connectionTimeoutMillis:3000,statement_timeout:3000});await migrate(pool);
 const connection=await Connection.connect({address:config.temporalAddress,connectTimeout:5000});const client=new WorkflowClient({connection,namespace:config.namespace});
 const app=createApp({config,registry:new Registry(pool),workflows:new TemporalWorkflows(connection,client,config.taskQueue,config.namespace),authenticate:remoteAuthenticator(config)});
 const server=app.listen(config.port,'127.0.0.1',()=>console.log(JSON.stringify({event:'gateway_ready',port:config.port})));
 const stop=gracefulServer(server,async()=>{await connection.close();await pool.end()});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop().then(()=>process.exit(0),()=>process.exit(1))});
}
main().catch(()=>{console.error(JSON.stringify({event:'gateway_start_failed'}));process.exit(1)});
