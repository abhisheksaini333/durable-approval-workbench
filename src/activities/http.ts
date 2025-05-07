import {request as httpRequest} from 'http';
import {request as httpsRequest} from 'https';
import {ApplicationFailure,Context} from '@temporalio/activity';
import {EffectInput,ProvisioningActivities} from './contracts';
export async function callProvider(base:string,token:string,operation:string,input:EffectInput,timeoutMs=3000,signal?:AbortSignal):Promise<void>{
 let root:URL;try{root=new URL(base);if(root.username||root.password||root.search||root.hash||root.pathname!=='/'||!(root.protocol==='https:'||(root.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(root.hostname)))||!['reserve','activate','deactivate','release'].includes(operation))throw new Error();}catch{throw ApplicationFailure.nonRetryable('Invalid provider target','ProviderRejected')}
 const target=new URL('/effects/'+operation,root),payload=JSON.stringify(input);
 return new Promise((resolve,reject)=>{
  const send=target.protocol==='https:'?httpsRequest:httpRequest;
  const req=send(target,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','content-length':Buffer.byteLength(payload)}},res=>{
   let body='',bytes=0;res.on('error',()=>{cleanup();reject(ApplicationFailure.retryable('Provider response interrupted','ProviderUnavailable'))});res.setEncoding('utf8');res.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>65536){res.destroy(new Error('response too large'));req.destroy();return}body+=chunk});res.on('end',()=>{cleanup();if(res.statusCode!==200){const permanent=!!res.statusCode&&res.statusCode>=400&&res.statusCode<500&&res.statusCode!==408&&res.statusCode!==429;reject(new ApplicationFailure('Provider operation failed',permanent?'ProviderRejected':'ProviderUnavailable',permanent));return}try{const receipt=JSON.parse(body);if(receipt.operation!==operation||typeof receipt.replayed!=='boolean')throw new Error();resolve()}catch{reject(ApplicationFailure.retryable('Invalid provider receipt','ProviderUnavailable'))}});
  });
  const timer=setTimeout(()=>req.destroy(new Error('deadline exceeded')),timeoutMs);
  const abort=()=>req.destroy(new Error('cancelled'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
  req.on('error',()=>{cleanup();reject(ApplicationFailure.retryable('Provider connection failed','ProviderUnavailable'))});req.end(payload);
 });
}
export function providerActivities(base:string,token:string):ProvisioningActivities{
 const execute=(operation:string,input:EffectInput)=>callProvider(base,token,operation,input,3000,Context.current().cancellationSignal as unknown as AbortSignal);
 return {reserve:input=>execute('reserve',input),activate:input=>execute('activate',input),deactivate:input=>execute('deactivate',input),release:input=>execute('release',input)};
}
