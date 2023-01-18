import {readFileSync,existsSync} from 'fs';
import {parsePolicy,identifier} from '../domain';
export function loadEnvironment(file='.env'){
 const allowed=new Set(['DATABASE_URL','PROVIDER_TOKEN','OIDC_ISSUER','PUBLIC_ORIGIN','PROVIDER_URL','PORT','PROVIDER_PORT','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','TASK_QUEUE','APPROVAL_TIMEOUT_MS','REMINDER_AFTER_MS']);
 if(existsSync(file))for(const line of readFileSync(file,'utf8').split('\n')){const i=line.indexOf('=');if(i>0&&allowed.has(line.slice(0,i))&&!process.env[line.slice(0,i)])process.env[line.slice(0,i)]=line.slice(i+1)}
}
export function loadConfig(env:Record<string,string|undefined>=process.env){
 try{
  const local=new Set(['localhost','127.0.0.1','[::1]']);
  const url=(value:string|undefined,fallback?:string)=>{const u=new URL(value||fallback||'');if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&local.has(u.hostname))))throw new Error();return u};
  const database=new URL(env.DATABASE_URL||'');if(!['postgresql:','postgres:'].includes(database.protocol)||!database.username||!database.password)throw new Error();
  const origin=url(env.PUBLIC_ORIGIN,'http://localhost:4900');if(origin.pathname!=='/')throw new Error();
  const issuer=url(env.OIDC_ISSUER);if(!/^\/realms\/[A-Za-z0-9_-]+$/.test(issuer.pathname))throw new Error();
  const provider=url(env.PROVIDER_URL,'http://127.0.0.1:4903');if(provider.pathname!=='/')throw new Error();
  const token=env.PROVIDER_TOKEN;if(!token||token.length<32||token.length>512)throw new Error();
  const port=Number(env.PORT||4900),providerPort=Number(env.PROVIDER_PORT||4903);if([port,providerPort].some(p=>!Number.isInteger(p)||p<1024||p>65535))throw new Error();
  const address=env.TEMPORAL_ADDRESS||'127.0.0.1:4904';if(!/^[A-Za-z0-9.-]+:[1-9][0-9]{0,4}$/.test(address)||Number(address.split(':')[1])>65535)throw new Error();
  return {databaseUrl:database.toString(),providerUrl:provider.origin,providerToken:token,origin:origin.origin,issuer:issuer.toString(),audience:'switchboard-api',clientId:'switchboard',port,providerPort,temporalAddress:address,namespace:identifier(env.TEMPORAL_NAMESPACE||'default','namespace'),taskQueue:identifier(env.TASK_QUEUE||'switchboard','task queue'),policy:parsePolicy({stages:['security','commercial'],approvalTimeoutMs:Number(env.APPROVAL_TIMEOUT_MS||600000),reminderAfterMs:Number(env.REMINDER_AFTER_MS||300000)})};
 }catch{throw new Error('Invalid runtime configuration; check the documented environment fields')}
}
