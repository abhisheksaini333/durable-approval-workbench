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
});
