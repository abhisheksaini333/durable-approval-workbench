import '../support/env';
import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {Pool} from 'pg';
import {Registry,migrate,transaction} from '../../src/server/registry';
const owner=(tenantId='tenant-'+randomUUID())=>({id:'owner',tenantId,roles:['requester'] as any});
const input={customer:'Acme',plan:'standard' as const,seats:3};
describe('PostgreSQL registry',function(){
 this.timeout(10000);const pool=new Pool({connectionString:process.env.DATABASE_URL});const registry=new Registry(pool);
 before(async()=>{await migrate(pool)});after(async()=>{await pool.end()});
 it('migrates repeatably with constraints',async()=>{await migrate(pool);const r=await pool.query("SELECT to_regclass('approval_requests') AS name");assert.equal(r.rows[0].name,'approval_requests')});
 it('admits concurrent retries as one stable workflow',async()=>{const actor=owner(),key='key-1';const results=await Promise.all(Array.from({length:8},()=>registry.admit(actor,key,input)));assert.equal(new Set(results.map(r=>r.id)).size,1);assert.equal(results[0].input.customer,'Acme')});
 it('rejects changed payloads under an existing key',async()=>{const actor=owner();await registry.admit(actor,'key-2',input);await assert.rejects(()=>registry.admit(actor,'key-2',{...input,seats:4}),(e:any)=>e.code==='idempotency_conflict')});
 it('isolates tenant and requester reads',async()=>{const actor=owner(),r=await registry.admit(actor,'read-key',input);assert.equal((await registry.get(actor,r.id)).id,r.id);await assert.rejects(()=>registry.get(owner(),r.id),(e:any)=>e.status===404);await assert.rejects(()=>registry.get({...actor,id:'someone-else'},r.id),(e:any)=>e.status===404);assert.equal((await registry.get({...actor,id:'reviewer',roles:['security-reviewer']},r.id)).id,r.id)});
 it('paginates without crossing tenants or duplicating rows',async()=>{const actor=owner();for(let i=0;i<5;i++)await registry.admit(actor,'page-'+i,input);await registry.admit(owner(),'outsider',input);const a=await registry.list(actor,2);const b=await registry.list(actor,2,a.nextCursor!);const c=await registry.list(actor,2,b.nextCursor!);assert.equal(new Set([...a.items,...b.items,...c.items].map(x=>x.id)).size,5);assert.equal(c.nextCursor,null);await assert.rejects(()=>registry.list(actor,100),(e:any)=>e.status===400);await assert.rejects(()=>registry.list(actor,2,'broken'),(e:any)=>e.status===400)});
});
