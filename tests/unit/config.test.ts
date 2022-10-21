import {strict as assert} from 'assert';
import {loadConfig} from '../../src/server/config';
const valid={DATABASE_URL:'postgresql://user:password@127.0.0.1:4902/switchboard',PROVIDER_TOKEN:'a'.repeat(40),OIDC_ISSUER:'http://localhost:4901/realms/switchboard',PUBLIC_ORIGIN:'http://localhost:4900',PROVIDER_URL:'http://127.0.0.1:4903'};
describe('runtime configuration',()=>{
 it('requires explicit credentials and validates endpoints',()=>{const c=loadConfig(valid);assert.equal(c.port,4900);assert.equal(c.policy.stages.length,2);for(const patch of [{PROVIDER_TOKEN:''},{DATABASE_URL:'http://user:secret@host'},{OIDC_ISSUER:'http://identity.example/realms/test'},{PUBLIC_ORIGIN:'http://localhost:4900/unexpected'},{PORT:'invalid'}])assert.throws(()=>loadConfig({...valid,...patch}),/configuration/i)});
});
