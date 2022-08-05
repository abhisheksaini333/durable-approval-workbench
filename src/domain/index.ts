export {};

export class DomainError extends Error {
 constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'DomainError'; }
}
export function identifier(value: unknown, field: string): string {
 if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value))
  throw new DomainError('invalid_identifier', `${field} must be a canonical identifier`);
 return value;
}

export interface RequestInput { customer: string; plan: 'standard' | 'enterprise'; seats: number; }
export function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)))
  throw new DomainError('invalid_object', 'Request contains unsupported fields');
 return value as Record<string, unknown>;
}
export function boundedText(value: unknown, field: string, maximum: number, allowEmpty = false): string {
 if(typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) || value.length > maximum || (!allowEmpty && !value.trim()))
  throw new DomainError('invalid_text', `${field} is invalid`);
 return value.trim();
}
export function parseRequest(value: unknown): RequestInput {
 const r = record(value, ['customer', 'plan', 'seats']);
 const customer = boundedText(r.customer, 'customer', 120);
 if(r.plan !== 'standard' && r.plan !== 'enterprise') throw new DomainError('invalid_plan', 'Select a supported plan');
 if(typeof r.seats !== 'number' || !Number.isSafeInteger(r.seats) || r.seats < 1 || r.seats > 1000) throw new DomainError('invalid_seats', 'Seats must be between 1 and 1000');
 return {customer, plan:r.plan, seats:r.seats};
}

export type Stage = 'security' | 'commercial';
export interface Policy { stages: Stage[]; approvalTimeoutMs: number; reminderAfterMs: number; }
export function parsePolicy(value: unknown): Policy {
 const r = record(value,['stages','approvalTimeoutMs','reminderAfterMs']);
 if(!Array.isArray(r.stages) || r.stages.length<1 || r.stages.length>2 || new Set(r.stages).size!==r.stages.length || r.stages.some(s=>s!=='security'&&s!=='commercial')) throw new DomainError('invalid_stages','Select distinct supported review stages');
 if(typeof r.approvalTimeoutMs!=='number' || !Number.isSafeInteger(r.approvalTimeoutMs) || r.approvalTimeoutMs<2000 || r.approvalTimeoutMs>86400000) throw new DomainError('invalid_deadline','Approval deadline is outside configured limits');
 if(typeof r.reminderAfterMs!=='number' || !Number.isSafeInteger(r.reminderAfterMs) || r.reminderAfterMs<1 || r.reminderAfterMs>=r.approvalTimeoutMs) throw new DomainError('invalid_reminder','Reminder must precede expiry');
 return {stages:r.stages.slice(),approvalTimeoutMs:r.approvalTimeoutMs,reminderAfterMs:r.reminderAfterMs};
}

export type Role = 'requester' | 'security-reviewer' | 'commercial-reviewer' | 'operator';
export interface Actor { id: string; tenantId: string; roles: Role[]; }
const knownRoles: Role[] = ['requester','security-reviewer','commercial-reviewer','operator'];
export function parseActor(value: unknown): Actor {
 const r=record(value,['id','tenantId','roles']);
 const id=identifier(r.id,'actor'),tenantId=identifier(r.tenantId,'tenant');
 if(!Array.isArray(r.roles)||r.roles.length>32||r.roles.some(x=>typeof x!=='string'||x.length>80)) throw new DomainError('invalid_roles','Identity roles are invalid',401);
 return {id,tenantId,roles:[...new Set(r.roles.filter((x):x is Role=>knownRoles.includes(x as Role)))]};
}

export type Status='pending'|'provisioning'|'cancelling'|'approved'|'rejected'|'expired'|'cancelled'|'failed'|'compensation_failed';
export interface Metadata {requestId:string;tenantId:string;requesterId:string;}
export interface Audit {sequence:number;at:number;event:string;actorId?:string;stage?:Stage;detail?:string;}
export interface Receipt {id:string;fingerprint:string;outcome:'accepted'|'rejected';reason?:string;revision:number;at:number;}
export interface State {schemaVersion:1;request:RequestInput&Metadata;policy:Policy;status:Status;stageIndex:number;revision:number;createdAt:number;deadline:number;reminded:boolean;receipts:Record<string,Receipt>;audit:Audit[];auditSequence:number;cancellationRequested:boolean;reserved:boolean;activated:boolean;errorCode?:string;}
export function clock(value:number):number {if(!Number.isSafeInteger(value)||value<0)throw new DomainError('invalid_clock','Invalid workflow time');return value;}
export function copy<T>(value:T):T {return JSON.parse(JSON.stringify(value)) as T;}
export function createState(input:unknown,metadata:Metadata,policy:unknown,now:number):State {
 const request={...parseRequest(input),requestId:identifier(metadata.requestId,'request'),tenantId:identifier(metadata.tenantId,'tenant'),requesterId:identifier(metadata.requesterId,'requester')};
 const p=parsePolicy(policy);clock(now);clock(now+p.approvalTimeoutMs);
 return {schemaVersion:1,request,policy:p,status:'pending',stageIndex:0,revision:0,createdAt:now,deadline:now+p.approvalTimeoutMs,reminded:false,receipts:{},audit:[{sequence:1,at:now,event:'requested',actorId:request.requesterId}],auditSequence:1,cancellationRequested:false,reserved:false,activated:false};
}

export interface Decision {id:string;stage:Stage;actor:Actor;choice:'approve'|'reject';note:string;revision:number;}
export function parseDecision(value:unknown):Decision {
 const c=record(value,['id','stage','actor','choice','note','revision']);
 const id=identifier(c.id,'decision');
 if(c.stage!=='security'&&c.stage!=='commercial')throw new DomainError('invalid_stage','Unknown review stage');
 if(c.choice!=='approve'&&c.choice!=='reject')throw new DomainError('invalid_choice','Choose approve or reject');
 if(typeof c.revision!=='number'||!Number.isSafeInteger(c.revision)||c.revision<0)throw new DomainError('invalid_revision','Expected revision is invalid');
 return {id,stage:c.stage,actor:parseActor(c.actor),choice:c.choice,note:boundedText(c.note,'note',500,true),revision:c.revision};
}
export function decisionFingerprint(c:Decision):string {return JSON.stringify([c.actor.tenantId,c.actor.id,c.stage,c.choice,c.note,c.revision]);}
