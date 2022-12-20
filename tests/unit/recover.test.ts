import {strict as assert} from 'assert';
import {recoverResource} from '../../src/operations/recover';
it('requires an explicit matching failed request before manual cleanup',async()=>{let calls=0;const execute=async()=>{calls++};await assert.rejects(recoverResource({status:'approved',request:{requestId:'one'}},'one',execute));await assert.rejects(recoverResource({status:'compensation_failed',request:{requestId:'one'}},'two',execute));assert.equal(calls,0)});
