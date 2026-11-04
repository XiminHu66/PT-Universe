// Private, demand-filled cache in the existing KV. No scheduled work or supplier secrets in stored keys/values.
import {hash} from './knowledge';
type CacheEnv={PT_UNIVERSE_DATA:KVNamespace;RESOURCE_GITHUB_TOKEN?:string;RESOURCE_CF_TOKEN?:string;RESOURCE_CF_ACCOUNT_ID?:string};
const inflight=new Map<string,Promise<any>>();
const ttls:Record<string,number>={'github-inventory':21600000,'github-storage':3600000,'github-billing':3600000,cloudflare:3600000,browser:900000};
function merge(previous:any,next:any){
 if(!previous)return next;const result={...previous,...next};
 for(const [field,key]of [['repositories','name'],['quotas','id']])if(Array.isArray(previous[field])&&Array.isArray(next[field])){
  const rows=new Map<string,any>(previous[field].map((r:any)=>[r[key],r]));for(const row of next[field])rows.set(row[key],{...rows.get(row[key]),...row});result[field]=[...rows.values()];
 }
 if(['unavailable','last_good'].includes(next.status?.state)&&['repositories','quotas','billing'].some(k=>previous[k]))result.status={...next.status,state:'last_good',observedAt:previous.status?.observedAt};
 return result;
}
export async function cachedResources(provider:string,env:CacheEnv,load:()=>Promise<any>,clock=Date.now){
 const now=clock(),ttl=ttls[provider];if(!ttl)throw Error('unsupported-resource-cache');
 const date=new Date(now).toISOString(),period=provider==='cloudflare'||provider==='browser'?date.slice(0,10):provider==='github-billing'?date.slice(0,7):'inventory';
 const credentials=provider.startsWith('github')?env.RESOURCE_GITHUB_TOKEN||'public':provider==='cloudflare'?[env.RESOURCE_CF_TOKEN,env.RESOURCE_CF_ACCOUNT_ID].join(':'):'binding';
 const key='private/resources/'+(provider==='github-billing'?'actions-usage-v4':'cache-v3')+'/'+provider+'/'+period+'/'+(await hash(credentials)).slice(0,32);
 if(inflight.has(key))return inflight.get(key);
 const pending=(async()=>{
  let old:any=null;try{const text=await env.PT_UNIVERSE_DATA.get(key);if(text){const value=JSON.parse(text);if(value&&value.expiresAt>now&&value.packet?.status)return {...value.packet,cacheHit:true};if(value?.packet?.status)old=value.packet;}}catch{}
  let next:any;try{next=await load();}catch{next={status:{provider,state:'unavailable',error:'upstream_unavailable',checkedAt:new Date(now).toISOString()}};}
  if(!next?.status)return next;
  const packet=merge(old,next),success=['ok','partial'].includes(next.status.state),expiresAt=now+(success?ttl:300000);
  // Cache failures briefly as well. Storage failure must not hide a valid upstream result.
  try{await env.PT_UNIVERSE_DATA.put(key,JSON.stringify({expiresAt,packet}),{expirationTtl:Math.max(86400,Math.ceil(ttl/1000)*4)});}catch{}
  return packet;
 })();inflight.set(key,pending);try{return await pending;}finally{inflight.delete(key);}
}
