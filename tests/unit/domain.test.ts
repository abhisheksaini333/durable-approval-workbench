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
