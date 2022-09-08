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
export class Registry {constructor(readonly pool:Pool){} }
