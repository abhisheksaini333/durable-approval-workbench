import {strict as assert} from 'assert';
import fs from 'fs';import os from 'os';import path from 'path';
const valid={DATABASE_URL:'postgresql://user:password@127.0.0.1:4902/switchboard',PROVIDER_TOKEN:'a'.repeat(40),OIDC_ISSUER:'http://localhost:4901/realms/switchboard',PUBLIC_ORIGIN:'http://localhost:4900',PROVIDER_URL:'http://127.0.0.1:4903'};

it("maintenance DAW01",()=>{const {loadConfig}=require('../../src/server/config');for(const endpoint of ['localhost:00','localhost:99999','localhost:01'])assert.throws(()=>loadConfig({...valid,TEMPORAL_ADDRESS:endpoint}),/configuration/);assert.equal(loadConfig({...valid,TEMPORAL_ADDRESS:'localhost:1'}).temporalAddress,'localhost:1')});

it("maintenance DAW02",()=>{const {loadEnvironment}=require('../../src/server/config'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'daw-env-')),before=process.env.TASK_QUEUE;try{delete process.env.TASK_QUEUE;const file=path.join(dir,'.env');fs.writeFileSync(file,'  # local\r\nTASK_QUEUE=queue\r\n');loadEnvironment(file);assert.equal(process.env.TASK_QUEUE,'queue');process.env.TASK_QUEUE='';loadEnvironment(file);assert.equal(process.env.TASK_QUEUE,'')}finally{if(before===undefined)delete process.env.TASK_QUEUE;else process.env.TASK_QUEUE=before;fs.rmSync(dir,{recursive:true,force:true})}});
