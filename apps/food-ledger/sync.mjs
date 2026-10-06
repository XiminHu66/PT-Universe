import {normalize} from './model.mjs';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev',enc=new TextEncoder(),dec=new TextDecoder();
export const config=()=>{try{return JSON.parse(localStorage.getItem('ptu.sync.config'))}catch{return null}};
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function key(token){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(token)),'AES-GCM',false,['encrypt','decrypt'])}
async function request(cfg,path,options={}){
 let r;try{r=await fetch(API+path,{...options,cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+cfg.token},signal:AbortSignal.timeout(20000)})}catch(e){throw Error(e.name==='TimeoutError'||e.name==='AbortError'?'同步请求超时，请稍后重试':'无法连接同步服务，请检查网络后重试')}
 const data=await r.json().catch(()=>null);if(!r.ok){const message=r.status===401?'配对码无效或已失效，请从有记录的设备重新复制':r.status===403?'同步服务拒绝了请求，请稍后重试':data?.error||'同步失败 '+r.status;const error=Error(message);error.status=r.status;throw error}if(!data)throw Error('同步服务返回内容不完整，请稍后重试');return data;
}
const path=cfg=>'/api/sync/'+encodeURIComponent(cfg.id)+'/food-ledger';
export async function register(){const cfg={id:crypto.randomUUID(),token:b64(crypto.getRandomValues(new Uint8Array(32)))};await request(cfg,'/api/sync/register',{method:'POST',body:JSON.stringify(cfg)});localStorage.setItem('ptu.sync.config',JSON.stringify(cfg));return cfg}
export function parseCode(code){const [id,token,...rest]=String(code).replace(/\s/g,'').split('.');if(rest.length||!/^[-a-f0-9]{36}$/i.test(id||'')||!/^[-\w]{43}$/.test(token||''))throw Error('配对码格式不正确');return {id,token}}
export function useConfig(cfg){localStorage.setItem('ptu.sync.config',JSON.stringify(cfg))}
export async function fetchCloud(cfg=config()){if(!cfg)throw Error('尚未连接');const result=await request(cfg,path(cfg));if(!result.ciphertext)return {...result,state:null};const cipher=JSON.parse(result.ciphertext),bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(cipher.iv)},await key(cfg.token),unb64(cipher.body));return {...result,state:normalize(JSON.parse(dec.decode(bytes)))}}
export async function putCloud(state,revision,cfg=config()){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(cfg.token),enc.encode(JSON.stringify(state)))),ciphertext=JSON.stringify({v:1,iv:b64(iv),body:b64(bytes)});if(ciphertext.length>1_900_000)throw Error('记录超过同步容量，请导出备份；本机记录已保存');return request(cfg,path(cfg),{method:'PUT',body:JSON.stringify({ciphertext,baseRevision:revision})})}
