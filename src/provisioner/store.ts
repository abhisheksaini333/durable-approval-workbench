import {Pool} from 'pg';
import {EffectInput} from '../activities/contracts';
import {transaction} from '../server/registry';
import {DomainError,record,identifier,parseRequest} from '../domain';
export type Operation='reserve'|'activate'|'deactivate'|'release';
export const operations:Operation[]=['reserve','activate','deactivate','release'];
export function parseEffect(value:unknown):EffectInput{
 const r=record(value,['requestId','tenantId','requesterId','customer','plan','seats']);
 return {...parseRequest({customer:r.customer,plan:r.plan,seats:r.seats}),requestId:identifier(r.requestId,'request'),tenantId:identifier(r.tenantId,'tenant'),requesterId:identifier(r.requesterId,'requester')};
}
export async function migrateEffects(pool:Pool){await transaction(pool,async client=>{await client.query('SELECT pg_advisory_xact_lock(4932023)');await client.query(`
 CREATE TABLE IF NOT EXISTS provider_resources(request_id text PRIMARY KEY,input jsonb NOT NULL,reserved boolean NOT NULL DEFAULT false,activated boolean NOT NULL DEFAULT false,released boolean NOT NULL DEFAULT false,deactivated boolean NOT NULL DEFAULT false);
 CREATE TABLE IF NOT EXISTS provider_receipts(request_id text NOT NULL REFERENCES provider_resources(request_id),operation text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(request_id,operation));`)
})}
export class EffectStore {constructor(readonly pool:Pool){}
 async apply(operation:Operation,value:unknown):Promise<{operation:Operation;replayed:boolean}>{throw new Error('operation unavailable')}
 async inspect(requestId:string){const r=await this.pool.query('SELECT request_id,reserved,activated,released,deactivated FROM provider_resources WHERE request_id=$1',[requestId]);return r.rows[0]||null}
}
