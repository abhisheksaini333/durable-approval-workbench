import {Pool} from 'pg';
import {loadConfig,loadEnvironment} from '../server/config';
import {gracefulServer} from '../server/lifecycle';
import {EffectStore,migrateEffects} from './store';
import {providerApp} from './app';
async function main(){loadEnvironment();const config=loadConfig();const pool=new Pool({connectionString:config.databaseUrl,max:6,connectionTimeoutMillis:3000,statement_timeout:3000});await migrateEffects(pool);const server=providerApp(new EffectStore(pool),config.providerToken).listen(config.providerPort,'127.0.0.1',()=>console.log(JSON.stringify({event:'provider_ready',port:config.providerPort})));const stop=gracefulServer(server,()=>pool.end());for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stop().then(()=>process.exit(0),()=>process.exit(1))})}
main().catch(()=>{console.error(JSON.stringify({event:'provider_start_failed'}));process.exit(1)});
