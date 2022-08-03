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
