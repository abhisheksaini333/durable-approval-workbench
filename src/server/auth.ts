import {jwtVerify,createRemoteJWKSet,JWTVerifyGetKey} from 'jose';
import {Actor,DomainError,parseActor} from '../domain';
export interface IdentityConfig {issuer:string;audience:string;}
export async function authenticateToken(header:unknown,keys:JWTVerifyGetKey,config:IdentityConfig):Promise<Actor>{
 try{
  if(typeof header!=='string'||header.length>12000||!/^Bearer [A-Za-z0-9_.-]+$/.test(header))throw new Error('invalid bearer');
  const {payload}=await jwtVerify(header.slice(7),keys,{issuer:config.issuer,audience:config.audience,algorithms:['RS256'],clockTolerance:5,maxTokenAge:'15 minutes'});
  const realm=payload.realm_access as any;
  return parseActor({id:payload.sub,tenantId:payload.tenant_id,roles:realm?.roles});
 }catch{throw new DomainError('unauthorized','Sign in with a valid session',401)}
}
export function remoteAuthenticator(config:IdentityConfig){
 const keys=createRemoteJWKSet(new URL(config.issuer+'/protocol/openid-connect/certs'),{timeoutDuration:3000,cooldownDuration:30000});
 return (header:unknown)=>authenticateToken(header,keys,config);
}
