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
