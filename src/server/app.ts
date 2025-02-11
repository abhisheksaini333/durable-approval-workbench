import express from 'express';
import {randomUUID} from 'crypto';
import {resolve} from 'path';
import {existsSync} from 'fs';
import {Actor,Decision,Policy,DomainError,identifier,parseRequest,parseDecision,record as objectRecord} from '../domain';
import {Registry,RequestRecord} from './registry';
import {collectSnapshots} from './snapshots';
export interface Workflows {ready():Promise<void>;start(record:RequestRecord,policy:Policy):Promise<void>;query(record:RequestRecord,timeoutMs?:number):Promise<any>;decide(record:RequestRecord,decision:Decision):Promise<void>;cancel(record:RequestRecord,actor:Actor):Promise<void>;}
export interface AppConfig {origin:string;issuer:string;clientId:string;policy:Policy;}
export interface Dependencies {readinessBudgetMs?:number;snapshotBudgetMs?:number;mutationBudget?:number;now?:()=>number;registry:Registry;workflows:Workflows;config:AppConfig;authenticate:(header:unknown)=>Promise<Actor>;}
const route=(fn:(q:express.Request,r:express.Response)=>Promise<any>):express.RequestHandler=>(q,r,next)=>{Promise.resolve(fn(q,r)).catch(next)};
export function createApp(deps:Dependencies){
 for(const [name,value,maximum] of [['mutationBudget',deps.mutationBudget,10000],['snapshotBudgetMs',deps.snapshotBudgetMs,60000],['readinessBudgetMs',deps.readinessBudgetMs,60000]] as const){if(value!==undefined&&(!Number.isInteger(value)||value<1||value>maximum))throw new Error('Invalid '+name);}
 const responses:Record<string,number>={};
 const {registry,workflows,config}=deps;const app=express();app.disable('x-powered-by');
 app.use((_q,r,next)=>{r.on('finish',()=>{const key=String(Math.floor(r.statusCode/100))+'xx';responses[key]=(responses[key]||0)+1});r.locals.traceId=randomUUID();r.setHeader('X-Request-Id',r.locals.traceId);next()});
 app.use((q,r,next)=>{
  const allowed=new Set([new URL(config.origin).hostname,'localhost','127.0.0.1','[::1]']);
  if(!allowed.has(q.hostname)){next(new DomainError('invalid_host','Unexpected request host'));return}
  if(q.get('origin')&&q.get('origin')!==config.origin){next(new DomainError('forbidden_origin','Request origin is not allowed',403));return}
  r.setHeader('X-Content-Type-Options','nosniff');r.setHeader('Referrer-Policy','no-referrer');r.setHeader('Cache-Control','no-store');r.setHeader('X-Frame-Options','DENY');
  const identityOrigin=new URL(config.issuer).origin;r.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' "+identityOrigin+"; frame-src "+identityOrigin+"; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");next();
 });
 app.get('/health',(_q,r)=>r.json({status:'ok'}));
 app.get('/ready',route(async(_q,r)=>{let timer:NodeJS.Timeout|undefined;try{await Promise.race([Promise.all([registry.pool.query('SELECT 1'),workflows.ready()]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness deadline exceeded')),deps.readinessBudgetMs??3500)})]);r.json({status:'ready'})}catch{r.status(503).json({status:'unavailable'})}finally{if(timer)clearTimeout(timer)}}));
 app.get('/config.json',(_q,r)=>r.json({issuer:config.issuer,clientId:config.clientId}));
 app.use('/api',(q,r,next)=>{deps.authenticate(q.get('authorization')).then(actor=>{r.locals.actor=actor;next()},next)});
 const mutationWindows=new Map<string,{start:number;count:number}>();
 app.use('/api',(q,r,next)=>{
  if(q.method==='GET'||q.method==='HEAD'){next();return}
  const now=(deps.now||Date.now)();for(const [key,value] of mutationWindows)if(now-value.start>=60000)mutationWindows.delete(key);
  const actor=r.locals.actor as Actor,key=actor.tenantId+':'+actor.id;let window=mutationWindows.get(key);
  if(!window){if(mutationWindows.size>=1000){next(new DomainError('busy','Please retry shortly',503));return}window={start:now,count:0};mutationWindows.set(key,window)}
  if(++window.count>(deps.mutationBudget||30)){r.setHeader('Retry-After',String(Math.max(1,Math.ceil((60000-now+window.start)/1000))));next(new DomainError('rate_limited','Too many changes; retry shortly',429));return}next();
 });
 app.use(express.json({limit:'16kb'}));
 app.get('/api/session',(_q,r)=>r.json({actor:r.locals.actor}));
 app.post('/api/requests',route(async(q,r)=>{
  const actor=r.locals.actor as Actor;requireRole(actor,['requester']);const key=identifier(q.get('idempotency-key'),'idempotency key'),input=parseRequest(q.body);
  const entry=await registry.admit(actor,key,input);await workflows.start(entry,config.policy);await registry.markStarted(entry.id);r.status(202).location('/api/requests/'+entry.id).json({id:entry.id,status:'submitted'});
 }));
 app.get('/api/requests/:id',route(async(q,r)=>{const entry=await registry.get(r.locals.actor,q.params.id);r.json(await workflows.query(entry))}));
 app.post('/api/requests/:id/decisions',route(async(q,r)=>{
  const actor=r.locals.actor as Actor;const body=objectRecord(q.body,['id','stage','choice','note','revision']);const command=parseDecision({...body,actor});requireRole(actor,[command.stage+'-reviewer']);
  const entry=await registry.get(actor,q.params.id);await workflows.decide(entry,command);r.status(202).json({decisionId:command.id,status:'submitted'});
 }));
 app.post('/api/requests/:id/cancel',route(async(q,r)=>{objectRecord(q.body,[]);const actor=r.locals.actor as Actor,entry=await registry.get(actor,q.params.id);if(entry.requesterId!==actor.id&&!actor.roles.includes('operator'))throw new DomainError('forbidden','Only the requester or an operator can cancel',403);await workflows.cancel(entry,actor);r.status(202).json({status:'submitted'})}));
 app.get('/api/requests',route(async(q,r)=>{
  const params=objectRecord(q.query,['limit','cursor']);if((params.limit!==undefined&&(typeof params.limit!=='string'||! /^[1-9][0-9]*$/.test(params.limit)))||(params.cursor!==undefined&&typeof params.cursor!=='string'))throw new DomainError('invalid_query','Invalid page parameters');
  const page=await registry.list(r.locals.actor,params.limit===undefined?20:Number(params.limit),params.cursor as string|undefined);
  const items=await collectSnapshots(page.items,(entry,remaining)=>workflows.query(entry,remaining),deps.snapshotBudgetMs||3500);
  r.json({items,nextCursor:page.nextCursor});
 }));
 app.get('/api/metrics',route(async(_q,r)=>{requireRole(r.locals.actor,['operator']);r.json({httpResponses:{...responses},uptimeSeconds:Math.floor(process.uptime())})}));
 /* ROUTES */
 const browser=resolve(process.cwd(),'web/dist');if(existsSync(resolve(browser,'index.html'))){app.use('/assets',express.static(resolve(browser,'assets'),{immutable:true,maxAge:'1y'}));app.get('/',(_q,r)=>r.sendFile(resolve(browser,'index.html')));}
 app.use((_q,_r,next)=>next(new DomainError('not_found','Resource not found',404)));
 app.use((error:any,_q:express.Request,r:express.Response,_next:express.NextFunction)=>{
  const status=error instanceof DomainError?error.status:error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
  r.status(status).type('application/problem+json').json({type:'about:blank',status,code:error instanceof DomainError?error.code:status===413?'body_too_large':status===400?'invalid_json':'internal_error',detail:error instanceof DomainError?error.message:status===500?'The operation could not be completed':'Invalid request body',traceId:r.locals.traceId});
 });return app;
}
function requireRole(actor:Actor,roles:string[]){if(!actor.roles.some(r=>roles.includes(r)))throw new DomainError('forbidden','Your role does not permit this action',403)}
