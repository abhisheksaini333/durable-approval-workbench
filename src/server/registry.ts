import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'crypto';
import {Actor,RequestInput,DomainError,parseActor,parseRequest,identifier} from '../domain';
import {workflowIdentity} from './identity';
export async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export async function migrate(pool:Pool){await transaction(pool,async client=>{
 await client.query('SELECT pg_advisory_xact_lock(4932022)');
 await client.query(`CREATE TABLE IF NOT EXISTS approval_requests (
 id uuid PRIMARY KEY, workflow_id text NOT NULL UNIQUE, tenant_id text NOT NULL, requester_id text NOT NULL,
 idempotency_key text NOT NULL, input jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_at timestamptz,
 UNIQUE(tenant_id,requester_id,idempotency_key));
 CREATE INDEX IF NOT EXISTS approval_requests_tenant_cursor ON approval_requests(tenant_id,created_at DESC,id DESC)`);
})}
export interface RequestRecord {id:string;workflowId:string;tenantId:string;requesterId:string;input:RequestInput;createdAt:string;startedAt:string|null;}
function mapRow(r:any):RequestRecord{return {id:r.id,workflowId:r.workflow_id,tenantId:r.tenant_id,requesterId:r.requester_id,input:r.input,createdAt:r.created_at.toISOString(),startedAt:r.started_at?.toISOString()||null}}
export class Registry {constructor(readonly pool:Pool){}
 async admit(value:Actor,key:string,payload:unknown):Promise<RequestRecord>{
  const actor=parseActor(value),input=parseRequest(payload),workflowId=workflowIdentity(actor.tenantId,actor.id,key);
  return transaction(this.pool,async client=>{
   await client.query('INSERT INTO approval_requests(id,workflow_id,tenant_id,requester_id,idempotency_key,input) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[randomUUID(),workflowId,actor.tenantId,actor.id,key,input]);
   const r=await client.query('SELECT * FROM approval_requests WHERE workflow_id=$1',[workflowId]);
   const existing=mapRow(r.rows[0]);if(existing.input.customer!==input.customer||existing.input.plan!==input.plan||existing.input.seats!==input.seats)throw new DomainError('idempotency_conflict','This request key already belongs to different input',409);
   return existing;
  });
 }
 async get(value:Actor,id:string):Promise<RequestRecord>{
  const actor=parseActor(value);identifier(id,'request');const all=actor.roles.some(r=>r==='operator'||r.endsWith('-reviewer'));
  const result=await this.pool.query('SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2 AND ($3::boolean OR requester_id=$4)',[id,actor.tenantId,all,actor.id]);
  if(!result.rowCount)throw new DomainError('not_found','Request not found',404);return mapRow(result.rows[0]);
 }
}
