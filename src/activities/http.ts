import {request as httpRequest} from 'http';
import {request as httpsRequest} from 'https';
import {ApplicationFailure,Context} from '@temporalio/activity';
import {EffectInput,ProvisioningActivities} from './contracts';
export async function callProvider(base:string,token:string,operation:string,input:EffectInput,timeoutMs=3000,signal?:AbortSignal):Promise<void>{
 const target=new URL('/effects/'+operation,base),payload=JSON.stringify(input);
 return new Promise((resolve,reject)=>{
  const send=target.protocol==='https:'?httpsRequest:httpRequest;
  const req=send(target,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk});res.on('end',()=>{cleanup();if(res.statusCode!==200){reject(ApplicationFailure.retryable('Provider operation failed','ProviderUnavailable'));return}try{const receipt=JSON.parse(body);if(receipt.operation!==operation||typeof receipt.replayed!=='boolean')throw new Error();resolve()}catch{reject(ApplicationFailure.retryable('Invalid provider receipt','ProviderUnavailable'))}});
  });
  const cleanup=()=>{};
  req.on('error',()=>{cleanup();reject(ApplicationFailure.retryable('Provider connection failed','ProviderUnavailable'))});req.end(payload);
 });
}
export function providerActivities(base:string,token:string):ProvisioningActivities{
 const execute=(operation:string,input:EffectInput)=>callProvider(base,token,operation,input,3000,Context.current().cancellationSignal as unknown as AbortSignal);
 return {reserve:input=>execute('reserve',input),activate:input=>execute('activate',input),deactivate:input=>execute('deactivate',input),release:input=>execute('release',input)};
}
