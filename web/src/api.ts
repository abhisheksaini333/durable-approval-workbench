export class ApiError extends Error {constructor(public status:number,public code:string,message:string,public traceId?:string){super(message)}}
let bearer:()=>Promise<string>=async()=>'';
export function configureToken(resolve:()=>Promise<string>){bearer=resolve}
export async function api<T>(path:string,options:{method?:string;body?:unknown;key?:string;signal?:AbortSignal}={}):Promise<T>{
 let pathname:string;try{pathname=decodeURIComponent(path.split('?',1)[0]);if(!path.startsWith('/')||pathname.startsWith('//')||path.includes('#')||/[\x00-\x1f\x7f\\]/.test(pathname)||pathname.split('/').some(part=>part==='.'||part==='..'))throw new Error()}catch{throw new Error('Invalid application API path')}
 if(options.signal?.aborted)throw new Error('Request cancelled before submission');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
 try{const token=await bearer();if(controller.signal.aborted)throw new Error('Request cancelled');const response=await fetch('/api'+path,{method:options.method||'GET',signal:controller.signal,credentials:'omit',headers:{Authorization:'Bearer '+token,...(options.body===undefined?{}:{'Content-Type':'application/json'}),...(options.key?{'Idempotency-Key':options.key}:{})},...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});
  let data:any;try{data=await response.json()}catch{if(!response.ok)throw new ApiError(response.status,'request_failed','The request could not be completed');throw new Error('Invalid server response')}if(!response.ok)throw new ApiError(response.status,typeof data?.code==='string'?data.code:'request_failed',typeof data?.detail==='string'?data.detail:'The request could not be completed',typeof data?.traceId==='string'?data.traceId:undefined);return data;
 }catch(error){if(error instanceof ApiError)throw error;throw new Error('Connection interrupted. Your pending changes can be retried.')}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
}
export interface Actor {id:string;tenantId:string;roles:string[];}
export interface Input {customer:string;plan:'standard'|'enterprise';seats:number;}
export interface Snapshot {request:Input&{requestId:string;tenantId:string;requesterId:string};status:string;stage:string|null;stages:string[];stageIndex:number;revision:number;createdAt:number;deadline:number;reminded:boolean;reserved:boolean;activated:boolean;cancellationRequested:boolean;errorCode:string|null;receipts:{id:string;outcome:string;reason?:string;revision:number}[];audit:{sequence:number;at:number;event:string;actorId?:string;stage?:string;detail?:string}[];}
export interface Entry {id:string;input:Input;createdAt:string;snapshot:Snapshot|null;stateUnavailable:boolean;}
