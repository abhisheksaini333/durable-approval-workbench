import {strict as assert} from 'assert';
import {createServer,Server} from 'http';
import {callProvider} from '../../src/activities/http';
describe('provider transport',()=>{
 let server:Server,url:string;let respond:(q:any,r:any)=>void;
 before(async()=>{server=createServer((q,r)=>respond(q,r));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+(server.address() as any).port});
 after(async()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 it('sends an authenticated bounded operation',async()=>{respond=(q,r)=>{assert.equal(q.headers.authorization,'Bearer credential');assert.equal(q.url,'/effects/reserve');q.resume();r.setHeader('Content-Type','application/json');r.end(JSON.stringify({operation:'reserve',replayed:false}))};await callProvider(url,'credential','reserve',{} as any,1000)});
 it('enforces an absolute deadline for a stalled provider',async()=>{respond=(q,r)=>{q.resume();setTimeout(()=>r.end('{}'),350)};const started=Date.now();await assert.rejects(()=>callProvider(url,'credential','reserve',{} as any,100),(e:any)=>e.type==='ProviderUnavailable');assert.ok(Date.now()-started<300)});
 it('classifies permanent rejections and retryable outages',async()=>{for(const status of [400,401,403,409,429,503]){respond=(q,r)=>{q.resume();r.statusCode=status;r.end('{}')};await assert.rejects(()=>callProvider(url,'credential','reserve',{} as any),(e:any)=>e.type===(status<500&&status!==429?'ProviderRejected':'ProviderUnavailable')&&e.nonRetryable===(status<500&&status!==429))}});
 it('rejects oversized provider responses',async()=>{respond=(q,r)=>{q.resume();r.end(JSON.stringify({operation:'reserve',replayed:false,padding:'x'.repeat(70000)}))};await assert.rejects(()=>callProvider(url,'credential','reserve',{} as any),(e:any)=>e.type==='ProviderUnavailable')});
});
