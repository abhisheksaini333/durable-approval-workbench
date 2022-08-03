import assert from 'assert';
const I: Record<string,any> = require('../../src/server/identity');
describe('workflow identity',()=>{it('isolates tenants actors and idempotency keys without disclosing them',()=>{
 assert.equal(typeof I.workflowIdentity,'function');
 const id=I.workflowIdentity('tenant-a','actor-a','key-1');
 assert.match(id,/^onboarding-[a-f0-9]{64}$/);assert.equal(I.workflowIdentity('tenant-a','actor-a','key-1'),id);
 for(const args of [['tenant-b','actor-a','key-1'],['tenant-a','actor-b','key-1'],['tenant-a','actor-a','key-2']])assert.notEqual(I.workflowIdentity(...args),id);
 assert.throws(()=>I.workflowIdentity('tenant-a','actor-a','bad key'));
});});
