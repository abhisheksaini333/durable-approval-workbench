import {strict as assert} from 'assert';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {authenticateToken} from '../../src/server/auth';
describe('OIDC authentication',()=>{
 let privateKey:any,keys:any;
 before(async()=>{const p=await generateKeyPair('RS256');privateKey=p.privateKey;keys=createLocalJWKSet({keys:[{...await exportJWK(p.publicKey),kid:'demo',alg:'RS256'}]})});
 async function token(claims:any={},issuer='https://identity.example/realms/switchboard',audience='switchboard-api'){
  return new SignJWT({tenant_id:'acme',realm_access:{roles:['requester']},...claims}).setProtectedHeader({alg:'RS256',kid:'demo'}).setSubject('owner').setIssuedAt().setExpirationTime('5m').setIssuer(issuer).setAudience(audience).sign(privateKey);
 }
 const config={issuer:'https://identity.example/realms/switchboard',audience:'switchboard-api'};
 it('accepts signed identities and rejects wrong issuer or audience',async()=>{
  const actor=await authenticateToken('Bearer '+await token(),keys,config);assert.deepEqual(actor,{id:'owner',tenantId:'acme',roles:['requester']});
  await assert.rejects(()=>authenticateToken('Bearer unsigned',keys,config),(e:any)=>e.status===401);
  await assert.rejects(async()=>authenticateToken('Bearer '+await token({},'https://evil.example'),keys,config),(e:any)=>e.status===401);
  await assert.rejects(async()=>authenticateToken('Bearer '+await token({},undefined,'other-service'),keys,config),(e:any)=>e.status===401);
 });
 it('requires expiry and rejects malformed authority claims',async()=>{
  const noExpiry=await new SignJWT({tenant_id:'acme',realm_access:{roles:['operator']}}).setProtectedHeader({alg:'RS256',kid:'demo'}).setSubject('owner').setIssuedAt().setIssuer(config.issuer).setAudience(config.audience).sign(privateKey);
  await assert.rejects(()=>authenticateToken('Bearer '+noExpiry,keys,config),(e:any)=>e.status===401);
  for(const claims of [{tenant_id:'../other'},{realm_access:{roles:'operator'}},{tenant_id:null}])await assert.rejects(async()=>authenticateToken('Bearer '+await token(claims),keys,config),(e:any)=>e.status===401);
 });
});
