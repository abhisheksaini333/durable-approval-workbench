import '../support/env';
import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {Pool} from 'pg';
import request from 'supertest';
import {EffectStore,migrateEffects} from '../../src/provisioner/store';
import {providerApp} from '../../src/provisioner/app';
const effect=()=>({requestId:randomUUID(),tenantId:'acme',requesterId:'owner',customer:'Acme',plan:'standard',seats:4});
describe('persistent provider',function(){
 this.timeout(10000);const pool=new Pool({connectionString:process.env.DATABASE_URL});const store=new EffectStore(pool);
 before(async()=>{await migrateEffects(pool)});after(async()=>pool.end());
 it('authenticates every effect mutation',async()=>{const app=providerApp(store,'a-secret-token-with-at-least-32-chars');await request(app).post('/effects/reserve').send(effect()).expect(401);await request(app).get('/health').expect(200)});
 it('reserves capacity exactly once under concurrent retries',async()=>{const e=effect();const r=await Promise.all(Array.from({length:6},()=>store.apply('reserve',e)));assert.equal(r.filter(x=>!x.replayed).length,1);assert.equal((await store.inspect(e.requestId)).reserved,true);assert.equal((await pool.query('SELECT * FROM provider_receipts WHERE request_id=$1',[e.requestId])).rowCount,1)});
 it('activates only an existing reservation',async()=>{const e=effect();await assert.rejects(()=>store.apply('activate',e),(x:any)=>x.code==='not_reserved');await store.apply('reserve',e);await store.apply('activate',e);assert.equal((await store.inspect(e.requestId)).activated,true);assert.equal((await store.apply('activate',e)).replayed,true)});
});
