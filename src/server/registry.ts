import {Pool,PoolClient} from 'pg';
import {randomUUID} from 'crypto';
import {Actor,RequestInput,DomainError,parseActor,parseRequest,identifier} from '../domain';
import {workflowIdentity} from './identity';
export async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();let broken:Error|undefined;try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value}catch(error){try{await client.query('ROLLBACK')}catch(rollbackError){broken=rollbackError instanceof Error?rollbackError:new Error('Rollback failed')}throw error}finally{client.release(broken)}
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
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const actor=parseActor(value);identifier(id,'request');if(!uuidPattern.test(id))throw new DomainError('invalid_request_id','Invalid request identifier');const all=actor.roles.some(r=>r==='operator'||r.endsWith('-reviewer'));
  const result=await this.pool.query('SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2 AND ($3::boolean OR requester_id=$4)',[id,actor.tenantId,all,actor.id]);
  if(!result.rowCount)throw new DomainError('not_found','Request not found',404);return mapRow(result.rows[0]);
 }
 async list(value:Actor,limit=20,cursor?:string):Promise<{items:RequestRecord[];nextCursor:string|null}>{
  const actor=parseActor(value);if(!Number.isInteger(limit)||limit<1||limit>50)throw new DomainError('invalid_limit','Page size must be between 1 and 50');
  let before:string|null=null,id:string|null=null;
  if(cursor){try{if(cursor.length>300||! /^[A-Za-z0-9_-]+$/.test(cursor)||Buffer.from(cursor,'base64url').toString('base64url')!==cursor)throw new Error();const c=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(c)||c.length!==2||typeof c[0]!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(c[0])||!Number.isFinite(Date.parse(c[0]))||new Date(c[0]).toISOString().slice(0,19)!==c[0].slice(0,19)||typeof c[1]!=='string'||!uuidPattern.test(c[1]))throw new Error();before=c[0];id=c[1]}catch{throw new DomainError('invalid_cursor','Invalid page cursor')}}
  const all=actor.roles.some(r=>r==='operator'||r.endsWith('-reviewer'));
  const result=await this.pool.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM approval_requests WHERE tenant_id=$1 AND ($2::boolean OR requester_id=$3) AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6`,[actor.tenantId,all,actor.id,before,id,limit+1]);
  const rows=result.rows.slice(0,limit),last=rows[rows.length-1];return {items:rows.map(mapRow),nextCursor:result.rows.length>limit?Buffer.from(JSON.stringify([last.cursor_time,last.id])).toString('base64url'):null};
 }
 async markStarted(id:string):Promise<void>{await this.pool.query('UPDATE approval_requests SET started_at=COALESCE(started_at,clock_timestamp()) WHERE id=$1',[id])}
}
