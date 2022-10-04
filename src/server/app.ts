import express from 'express';
import {randomUUID} from 'crypto';
import {Actor,Decision,Policy,DomainError,identifier,parseRequest,parseDecision,record as objectRecord} from '../domain';
import {Registry,RequestRecord} from './registry';
export interface Workflows {ready():Promise<void>;start(record:RequestRecord,policy:Policy):Promise<void>;query(record:RequestRecord):Promise<any>;decide(record:RequestRecord,decision:Decision):Promise<void>;cancel(record:RequestRecord,actor:Actor):Promise<void>;}
export interface AppConfig {origin:string;issuer:string;clientId:string;policy:Policy;}
export interface Dependencies {registry:Registry;workflows:Workflows;config:AppConfig;authenticate:(header:unknown)=>Promise<Actor>;}
const route=(fn:(q:express.Request,r:express.Response)=>Promise<any>):express.RequestHandler=>(q,r,next)=>{Promise.resolve(fn(q,r)).catch(next)};
export function createApp(deps:Dependencies){
 const {registry,workflows,config}=deps;const app=express();app.disable('x-powered-by');
 app.use((_q,r,next)=>{r.locals.traceId=randomUUID();r.setHeader('X-Request-Id',r.locals.traceId);next()});
 app.get('/health',(_q,r)=>r.json({status:'ok'}));
 app.get('/ready',route(async(_q,r)=>{try{await Promise.all([registry.pool.query('SELECT 1'),workflows.ready()]);r.json({status:'ready'})}catch{r.status(503).json({status:'unavailable'})}}));
 app.get('/config.json',(_q,r)=>r.json({issuer:config.issuer,clientId:config.clientId}));
 app.use('/api',(q,r,next)=>{deps.authenticate(q.get('authorization')).then(actor=>{r.locals.actor=actor;next()},next)});
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
 /* ROUTES */
 app.use((_q,_r,next)=>next(new DomainError('not_found','Resource not found',404)));
 app.use((error:any,_q:express.Request,r:express.Response,_next:express.NextFunction)=>{
  const status=error instanceof DomainError?error.status:error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
  r.status(status).type('application/problem+json').json({type:'about:blank',status,code:error instanceof DomainError?error.code:status===413?'body_too_large':status===400?'invalid_json':'internal_error',detail:error instanceof DomainError?error.message:status===500?'The operation could not be completed':'Invalid request body',traceId:r.locals.traceId});
 });return app;
}
function requireRole(actor:Actor,roles:string[]){if(!actor.roles.some(r=>roles.includes(r)))throw new DomainError('forbidden','Your role does not permit this action',403)}
