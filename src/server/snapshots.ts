import {RequestRecord} from './registry';
export async function collectSnapshots(entries:RequestRecord[],query:(entry:RequestRecord,remainingMs:number)=>Promise<any>,budgetMs=3500){
 if(!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>60000)throw new Error('Invalid snapshot budget');
 const deadline=Date.now()+budgetMs;const items=entries.map(entry=>({...entry,snapshot:null as any,stateUnavailable:true}));let cursor=0;
 async function worker(){while(cursor<entries.length){const remaining=deadline-Date.now();if(remaining<=0)return;const index=cursor++;let timer:NodeJS.Timeout|undefined;try{const snapshot=await Promise.race([query(entries[index],remaining),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Snapshot budget exhausted')),remaining)})]);items[index]={...entries[index],snapshot,stateUnavailable:false}}catch{}finally{if(timer)clearTimeout(timer)}}}
 await Promise.all(Array.from({length:Math.min(4,entries.length)},worker));return items;
}
