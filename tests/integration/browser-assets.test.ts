import {strict as assert} from 'assert';
import request from 'supertest';
import {createApp} from '../../src/server/app';
it('serves built browser assets without swallowing API errors',async()=>{const app=createApp({registry:{} as any,workflows:{} as any,authenticate:async()=>({id:'owner',tenantId:'acme',roles:['requester']}),config:{origin:'http://localhost:4900',issuer:'http://localhost:4901/realms/switchboard',clientId:'switchboard',policy:{} as any}});const html=await request(app).get('/').expect(200);assert.ok(html.text.includes('Switchboard'));assert.ok(html.text.includes('/assets/'));await request(app).get('/api/missing').expect(404)});
