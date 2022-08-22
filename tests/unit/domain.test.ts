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

describe('decision replay',()=>{it('returns the same receipt without advancing twice or mutating prior state',()=>{
 has('applyDecision');const first=state();const accepted=D.applyDecision(first,command(),1200);const replay=D.applyDecision(accepted,command(),1500);
 assert.equal(first.revision,0);assert.equal(accepted.revision,1);assert.deepEqual(replay,accepted);assert.equal(accepted.receipts['decision-1'].outcome,'accepted');
});});

describe('decision identity conflicts',()=>{it('preserves the original receipt after changed intent',()=>{
 const accepted=D.applyDecision(state(),command(),1200),before=JSON.stringify(accepted);
 assert.throws(()=>D.applyDecision(accepted,command({choice:'reject'}),1500),(e:any)=>e.code==='decision_conflict');
 assert.equal(JSON.stringify(accepted),before);
});});

describe('review authorization',()=>{it('records rejected receipts without advancing business state',()=>{
 for(const [patch,reason] of [[{actor:{...actor,tenantId:'other'}},'wrong_tenant'],[{actor:{...actor,roles:['requester']}},'wrong_role'],[{stage:'commercial'},'wrong_stage'],[{revision:9},'stale_revision']] as any[]){
  const s=D.applyDecision(state(),command(patch),1200);assert.equal(s.revision,0);assert.equal(s.receipts['decision-1'].reason,reason);assert.equal(s.receipts['decision-1'].outcome,'rejected');
 }
});});

describe('separation of duties',()=>{it('rejects self approval even when requester also has review role',()=>{
 const s=D.applyDecision(state(),command({actor:{...actor,id:metadata.requesterId}}),1200);
 assert.equal(s.receipts['decision-1'].reason,'self_review');assert.equal(s.revision,0);
});});

describe('ordered approvals',()=>{it('requires both distinct stages before provisioning',()=>{
 const a=D.applyDecision(state(),command(),1200);assert.equal(a.stageIndex,1);assert.equal(a.status,'pending');
 const b=D.applyDecision(a,command({id:'decision-2',stage:'commercial',actor:{...actor,id:'reviewer-2',roles:['commercial-reviewer']},revision:1}),1300);
 assert.equal(b.stageIndex,2);assert.equal(b.status,'provisioning');assert.equal(b.revision,2);
 const wrong=D.applyDecision(state(),command({stage:'commercial',actor:{...actor,roles:['commercial-reviewer']}}),1200);assert.equal(wrong.status,'pending');
});});

describe('terminal rejection',()=>{it('records the negative decision and refuses later approvals',()=>{
 const rejected=D.applyDecision(state(),command({choice:'reject',note:'Missing contract'}),1200);
 assert.equal(rejected.status,'rejected');assert.equal(rejected.stageIndex,0);assert.equal(rejected.receipts['decision-1'].outcome,'accepted');
 const later=D.applyDecision(rejected,command({id:'later',revision:1}),1300);assert.equal(later.status,'rejected');assert.equal(later.receipts.later.reason,'not_pending');
});});

describe('deadline',()=>{it('rejects late signals before timer processing and expires only pending work',()=>{
 has('expire');const s=state();assert.equal(D.expire(s,60999).status,'pending');assert.equal(D.expire(s,61000).status,'expired');
 assert.equal(D.applyDecision(s,command(),61000).receipts['decision-1'].reason,'expired');assert.equal(s.status,'pending');
 const rejected=D.applyDecision(s,command({choice:'reject'}),1200);assert.equal(D.expire(rejected,70000).status,'rejected');
});});
