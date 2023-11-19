import {strict as assert} from 'assert';
import fs from 'fs';import os from 'os';import path from 'path';
const valid={DATABASE_URL:'postgresql://user:password@127.0.0.1:4902/switchboard',PROVIDER_TOKEN:'a'.repeat(40),OIDC_ISSUER:'http://localhost:4901/realms/switchboard',PUBLIC_ORIGIN:'http://localhost:4900',PROVIDER_URL:'http://127.0.0.1:4903'};

it("maintenance DAW01",()=>{const {loadConfig}=require('../../src/server/config');for(const endpoint of ['localhost:00','localhost:99999','localhost:01'])assert.throws(()=>loadConfig({...valid,TEMPORAL_ADDRESS:endpoint}),/configuration/);assert.equal(loadConfig({...valid,TEMPORAL_ADDRESS:'localhost:1'}).temporalAddress,'localhost:1')});

it("maintenance DAW02",()=>{const {loadEnvironment}=require('../../src/server/config'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'daw-env-')),before=process.env.TASK_QUEUE;try{delete process.env.TASK_QUEUE;const file=path.join(dir,'.env');fs.writeFileSync(file,'  # local\r\nTASK_QUEUE=queue\r\n');loadEnvironment(file);assert.equal(process.env.TASK_QUEUE,'queue');process.env.TASK_QUEUE='';loadEnvironment(file);assert.equal(process.env.TASK_QUEUE,'')}finally{if(before===undefined)delete process.env.TASK_QUEUE;else process.env.TASK_QUEUE=before;fs.rmSync(dir,{recursive:true,force:true})}});

it("maintenance DAW03",()=>{const {loadConfig}=require('../../src/server/config'),{providerApp}=require('../../src/provisioner/app');for(const token of [' '.repeat(40),'a'.repeat(40)+'\n','x'.repeat(513)]){assert.throws(()=>loadConfig({...valid,PROVIDER_TOKEN:token}),/configuration/);assert.throws(()=>providerApp({} as any,token),/credential/)}assert(providerApp({} as any,'a'.repeat(40)))});

it("maintenance DAW04",async()=>{const {transaction}=require('../../src/server/registry'),original=Error('original'),rollback=Error('rollback');const releases:any[]=[];const client={query:async(sql:string)=>{if(sql==='ROLLBACK')throw rollback},release:(error:any)=>releases.push(error)};await assert.rejects(transaction({connect:async()=>client},async()=>{throw original}),(e:any)=>e===original);assert.deepEqual(releases,[rollback])});
