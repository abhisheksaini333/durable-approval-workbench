import Keycloak from 'keycloak-js';
import {Actor,api,configureToken} from './api';
import {clearIntents} from './intent';
export interface Session {actor:Actor;logout:()=>Promise<void>;}
let setup:Promise<{login:()=>Promise<void>;session:Session|null}>|undefined;
export function initializeIdentity(){return setup||(setup=(async()=>{
 const response=await fetch('/config.json',{credentials:'omit'});if(!response.ok)throw new Error('Workspace sign-in configuration is unavailable');const config=await response.json();
 const issuer=new URL(config.issuer),realm=issuer.pathname.split('/').pop()!;const keycloak=Keycloak({url:issuer.origin,realm,clientId:config.clientId});
 const authenticated=await keycloak.init({onLoad:'check-sso',pkceMethod:'S256',checkLoginIframe:false,flow:'standard'});
 configureToken(async()=>{if(!keycloak.authenticated)throw new Error('Your session has ended');await keycloak.updateToken(30);return keycloak.token!});
 const login=()=>keycloak.login({redirectUri:window.location.origin});
 if(!authenticated)return {login,session:null};
 const {actor}=await api<{actor:Actor}>('/session');
 return {login,session:{actor,logout:async()=>{clearIntents(sessionStorage);await keycloak.logout({redirectUri:window.location.origin})}}};
})())}
