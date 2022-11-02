export interface PendingIntent {kind:'request'|'decision';id:string;requestId?:string;payload:unknown;}
const prefix='switchboard.intent.';
export function intentKey(tenantId:string,actorId:string){return prefix+encodeURIComponent(tenantId)+'.'+encodeURIComponent(actorId)}
export function readIntent(storage:Storage,key:string):PendingIntent|null {try{const value=JSON.parse(storage.getItem(key)||'null');if(!value||!['request','decision'].includes(value.kind)||typeof value.id!=='string'||value.id.length>64||!value.payload||typeof value.payload!=='object')return null;return value}catch{return null}}
export function saveIntent(storage:Storage,key:string,intent:PendingIntent){storage.setItem(key,JSON.stringify(intent))}
export function clearIntents(storage:Storage){for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key)}}
