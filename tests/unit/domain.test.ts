import assert from 'assert';
const D: Record<string, any> = require('../../src/domain');
const has = (name: string) => { assert.equal(typeof D[name], 'function', name + ' must be implemented'); };

describe('resource identifiers', () => {
 it('accepts canonical identities and rejects ambiguous or oversized inputs', () => {
  has('identifier'); assert.equal(D.identifier('team-01', 'tenant'), 'team-01');
  for(const value of ['', ' x', 'x\n', '../x', 'x/y', 'x'.repeat(65), null, 1])
   assert.throws(() => D.identifier(value, 'tenant'), (e: any) => e.code === 'invalid_identifier');
 });
});

describe('onboarding input', () => {
 it('normalizes display text without accepting undeclared authority fields', () => {
  has('parseRequest'); assert.deepEqual(D.parseRequest({customer:'  Sample Labs  ',plan:'enterprise',seats:25}), {customer:'Sample Labs',plan:'enterprise',seats:25});
  for(const value of [null, [], {customer:'x',plan:'standard',seats:0}, {customer:'x',plan:'standard',seats:1.5}, {customer:'x',plan:'standard',seats:1001}, {customer:'x\nadmin',plan:'standard',seats:1}, {customer:'x',plan:'root',seats:1}, {customer:'x',plan:'standard',seats:1,tenantId:'other'}]) assert.throws(() => D.parseRequest(value));
 });
});

describe('review policy', () => {
 it('requires distinct ordered stages and finite bounded durations', () => {
  has('parsePolicy');
  const p={stages:['security','commercial'],approvalTimeoutMs:60000,reminderAfterMs:30000};
  assert.deepEqual(D.parsePolicy(p),p);
  for(const patch of [{stages:[]},{stages:['security','security']},{stages:['root']},{approvalTimeoutMs:NaN},{approvalTimeoutMs:1999},{approvalTimeoutMs:86400001},{reminderAfterMs:60000},{reminderAfterMs:0}]) assert.throws(()=>D.parsePolicy({...p,...patch}));
 });
});

describe('actor boundary',()=>{
 it('keeps only known roles and rejects malformed identity claims',()=>{
  has('parseActor');assert.deepEqual(D.parseActor({id:'r1',tenantId:'demo',roles:['security-reviewer','offline_access']}),{id:'r1',tenantId:'demo',roles:['security-reviewer']});
  for(const value of [{id:'r1',tenantId:'',roles:[]},{id:'r1',tenantId:'demo',roles:'operator'},{id:'r1',tenantId:'demo',roles:[1]},{id:'r1',tenantId:'demo',roles:Array(33).fill('operator')},{id:'r1',tenantId:'demo',roles:[],admin:true}])assert.throws(()=>D.parseActor(value));
 });
});

const metadata={requestId:'request-1',tenantId:'demo',requesterId:'requester-1'};
const input={customer:'Sample Labs',plan:'enterprise',seats:12};
const policy={stages:['security','commercial'],approvalTimeoutMs:60000,reminderAfterMs:30000};
const actor={id:'reviewer-1',tenantId:'demo',roles:['security-reviewer']};
const state=()=>D.createState(input,metadata,policy,1000);
describe('workflow initialization',()=>{it('captures the canonical request and deadline without shared input references',()=>{
 has('createState');const p={...policy,stages:[...policy.stages]};const s=D.createState(input,metadata,p,1000);p.stages.length=0;
 assert.equal(s.status,'pending');assert.equal(s.deadline,61000);assert.equal(s.revision,0);assert.equal(s.policy.stages.length,2);assert.equal(s.audit[0].event,'requested');
 assert.throws(()=>D.createState(input,metadata,policy,NaN));assert.throws(()=>D.createState(input,metadata,policy,Number.MAX_SAFE_INTEGER));
});});

const command=(changes:any={})=>({id:'decision-1',stage:'security',actor,choice:'approve',note:'Reviewed evidence',revision:0,...changes});
describe('decision intent',()=>{it('normalizes notes and binds fingerprints to author stage and choice',()=>{
 has('parseDecision');has('decisionFingerprint');const a=D.parseDecision(command());
 assert.equal(D.decisionFingerprint(a),D.decisionFingerprint(D.parseDecision(command({note:'  Reviewed evidence  '}))));
 for(const patch of [{choice:'reject'},{stage:'commercial'},{actor:{...actor,id:'another'}},{revision:1}])assert.notEqual(D.decisionFingerprint(a),D.decisionFingerprint(D.parseDecision(command(patch))));
 for(const patch of [{choice:'skip'},{revision:-1},{revision:0.1},{note:'x'.repeat(501)},{extra:true}])assert.throws(()=>D.parseDecision(command(patch)));
});});
