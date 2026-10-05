import {normalize} from './model.mjs';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev',enc=new TextEncoder(),dec=new TextDecoder();
export const config=()=>{try{return JSON.parse(localStorage.getItem('ptu.sync.config'))}catch{return null}};
const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function key(token){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(token)),'AES-GCM',false,['encrypt','decrypt'])}
async function request(cfg,path,options={}){const r=await fetch(API+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+cfg.token},signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'同步失败 '+r.status);return data}
const path=cfg=>'/api/sync/'+encodeURIComponent(cfg.id)+'/idea-notes';
export async function register(){const cfg={id:crypto.randomUUID(),token:b64(crypto.getRandomValues(new Uint8Array(32)))};await request(cfg,'/api/sync/register',{method:'POST',body:JSON.stringify(cfg)});localStorage.setItem('ptu.sync.config',JSON.stringify(cfg));return cfg.id+'.'+cfg.token}
export function parseCode(code){const [id,token,...rest]=code.trim().split('.');if(rest.length||!/^[-a-f0-9]{36}$/i.test(id||'')||!/^[\w-]{43}$/.test(token||''))throw Error('配对码格式不正确');return {id,token}}
export function useConfig(cfg){localStorage.setItem('ptu.sync.config',JSON.stringify(cfg))}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function seal(value,cfg){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(cfg.token),enc.encode(JSON.stringify(value))));return JSON.stringify({v:1,iv:b64(iv),body:b64(bytes)})}
async function open(ciphertext,cfg){const cipher=JSON.parse(ciphertext),bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(cipher.iv)},await key(cfg.token),unb64(cipher.body));return JSON.parse(dec.decode(bytes))}
const chunkPath=(cfg,scope)=>'/api/sync/'+encodeURIComponent(cfg.id)+'/'+scope;
export async function fetchCloud(cfg=config()){
 if(!cfg)throw Error('先生成配对码或连接设备');const result=await request(cfg,path(cfg));if(!result.ciphertext)return {...result,state:null};let value=await open(result.ciphertext,cfg);
 if(value?.kind==='idea-notes-chunks'){
  if(!/^idea-chunk-[a-f0-9]{24}$/.test(value.prefix)||!Number.isSafeInteger(value.parts)||value.parts<1||value.parts>60||! /^[a-f0-9]{64}$/.test(value.digest))throw Error('云端分块索引无效');
  const chunks=[];for(let i=0;i<value.parts;i+=3){const batch=await Promise.all(Array.from({length:Math.min(3,value.parts-i)},(_,n)=>request(cfg,chunkPath(cfg,value.prefix+'-'+(i+n)))));for(const part of batch){if(typeof part.ciphertext!=='string'||!part.ciphertext)throw Error('云端正文分块缺失，请保留本机版本');chunks.push(part.ciphertext)}}
  const ciphertext=chunks.join('');if(await digest(ciphertext)!==value.digest)throw Error('云端正文分块校验失败');value=await open(ciphertext,cfg);
 }
 return {...result,state:normalize(value)};
}
export async function putCloud(state,revision,cfg=config()){
 if(!cfg)throw Error('未连接设备');let ciphertext=await seal(state,cfg);
 if(ciphertext.length>1_800_000){
  const checksum=await digest(ciphertext),prefix='idea-chunk-'+checksum.slice(0,24),parts=Math.ceil(ciphertext.length/1_200_000);if(parts>60)throw Error('笔记超过单次同步容量，请先下载完整备份；本机内容仍完整保存');
  // Publish immutable encrypted chunks before atomically advancing the manifest.
  for(let i=0;i<parts;i+=3)await Promise.all(Array.from({length:Math.min(3,parts-i)},(_,n)=>request(cfg,chunkPath(cfg,prefix+'-'+(i+n)),{method:'PUT',body:JSON.stringify({ciphertext:ciphertext.slice((i+n)*1_200_000,(i+n+1)*1_200_000)})})));
  ciphertext=await seal({kind:'idea-notes-chunks',v:1,prefix,parts,digest:checksum},cfg);
 }
 return request(cfg,path(cfg),{method:'PUT',body:JSON.stringify({ciphertext,baseRevision:revision})});
}
