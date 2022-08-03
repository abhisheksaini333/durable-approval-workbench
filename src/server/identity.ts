import {createHash} from 'crypto';
import {identifier} from '../domain';
export function workflowIdentity(tenantId:unknown,actorId:unknown,key:unknown):string {
 const canonical=JSON.stringify([identifier(tenantId,'tenant'),identifier(actorId,'actor'),identifier(key,'idempotency key')]);
 return 'onboarding-'+createHash('sha256').update(canonical).digest('hex');
}
