import {readFileSync,existsSync} from 'fs';
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').split('\n')){const i=line.indexOf('=');if(i>0&&!process.env[line.slice(0,i)])process.env[line.slice(0,i)]=line.slice(i+1)}
