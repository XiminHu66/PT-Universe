import {normalize} from './model.mjs';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev',enc=new TextEncoder(),dec=new TextDecoder();
export const config=()=>{try{return JSON.parse(localStorage.getItem('ptu.sync.config'))}catch{return null}};
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function key(token){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(token)),'AES-GCM',false,['encrypt','decrypt'])}
async function request(cfg,path,options={}){const r=await fetch(API+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+cfg.token},signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'同步失败 '+r.status);return data}
const path=cfg=>'/api/sync/'+encodeURIComponent(cfg.id)+'/todo-dashboard';
export async function register(){const cfg={id:crypto.randomUUID(),token:b64(crypto.getRandomValues(new Uint8Array(32)))};await request(cfg,'/api/sync/register',{method:'POST',body:JSON.stringify(cfg)});localStorage.setItem('ptu.sync.config',JSON.stringify(cfg));return cfg.id+'.'+cfg.token}
export function parseCode(code){const [id,token,...rest]=code.trim().split('.');if(rest.length||!/^[-a-f0-9]{36}$/i.test(id||'')||!/^[\w-]{43}$/.test(token||''))throw Error('配对码格式不正确');return {id,token}}
export function useConfig(cfg){localStorage.setItem('ptu.sync.config',JSON.stringify(cfg))}
export async function fetchCloud(cfg=config()){if(!cfg)throw Error('先生成配对码或连接设备');const result=await request(cfg,path(cfg));if(!result.ciphertext)return {...result,state:null};const cipher=JSON.parse(result.ciphertext),bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(cipher.iv)},await key(cfg.token),unb64(cipher.body));return {...result,state:normalize(JSON.parse(dec.decode(bytes)))}}
export async function putCloud(state,revision,cfg=config()){if(!cfg)throw Error('未连接设备');const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(cfg.token),enc.encode(JSON.stringify(state)))),ciphertext=JSON.stringify({v:1,iv:b64(iv),body:b64(bytes)});return request(cfg,path(cfg),{method:'PUT',body:JSON.stringify({ciphertext,baseRevision:revision})})}
