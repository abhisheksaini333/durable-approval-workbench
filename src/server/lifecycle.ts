import {Server} from 'http';
import {Socket} from 'net';
export function gracefulServer(server:Server,cleanup:()=>Promise<void>){
 const sockets=new Set<Socket>();server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=3000;
 let closing:Promise<void>|undefined;
 return ()=>closing||(closing=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{for(const socket of sockets)socket.destroy()},10000);timer.unref();server.close(error=>{clearTimeout(timer);cleanup().then(()=>error?reject(error):resolve(),reject)})}));
}
