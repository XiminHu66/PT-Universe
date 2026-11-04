import {OWNER_CONNECT_PUBLIC_KEY,readVpsSnapshot,hash} from './knowledge';
import {sanitizeVpsSnapshot} from './vps';
// @ts-ignore Shared dependency-free collector is also exercised directly by Node tests.
import {ResourceCollector,automaticConnections} from '../../../services/resource-monitor/collector.mjs';
type ResourceEnv={PT_UNIVERSE_DATA:KVNamespace;RESOURCE_GITHUB_TOKEN?:string;RESOURCE_CF_TOKEN?:string;RESOURCE_CF_ACCOUNT_ID?:string};
const SNAPSHOT='private/resources/inventory-v1',ORIGIN='https://ximinhu66.github.io',ISSUER='https://pt-vps-tools.h1nano.chatgpt.site';
const collector=new ResourceCollector();
const headers={'cache-control':'private,no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers});
const bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
export async function verifyResourceToken(token:string,scope='resources:read',now=Date.now(),publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY){
 try{if(token.length>3500)return null;const [a,b,c,...extra]=token.split('.');if(extra.length||!a||!b||!c)return null;
 const h=JSON.parse(new TextDecoder().decode(bytes(a))),p=JSON.parse(new TextDecoder().decode(bytes(b))),t=Math.floor(now/1000),max=scope==='resources:configure'?60:86400;
 if(h.alg!=='ES256'||h.typ!=='JWT'||p.iss!==ISSUER||p.aud!=='pt-universe-resources'||p.sub!=='pt-backend-owner'||p.scope!==scope||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||p.iat>t+30||p.iat<t-max||p.exp<=t||p.exp<=p.iat||p.exp-p.iat>max||!/^[a-f0-9]{48}$/.test(p.nonce||''))return null;
 const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(c),new TextEncoder().encode(a+'.'+b))?p:null;
 }catch{return null;}
}
export function resourceScope(raw:any){
 if(!raw||!Array.isArray(raw.repositories)||!Array.isArray(raw.quotas)||!Array.isArray(raw.projects)||typeof raw.generatedAt!=='string')throw Error('invalid-inventory');
 const providers=new Set(['GitHub Actions','Cloudflare','Oracle VPS']);
 return {...raw,quotas:raw.quotas.filter((q:any)=>providers.has(q.provider)),projects:raw.projects.filter((p:any)=>['GitHub','Pages','Cloudflare','VPS'].includes(p.platform)),providerNotes:Object.fromEntries(Object.entries(raw.providerNotes||{}).filter(([k])=>providers.has(k)))};
}
const inventoryCache=new WeakMap<object,{at:number;value:any}>(),vpsCache=new WeakMap<object,{at:number;value:any}>();
async function inventory(env:ResourceEnv){const cached=inventoryCache.get(env.PT_UNIVERSE_DATA);if(cached&&Date.now()-cached.at<300000)return cached.value;const stored=await env.PT_UNIVERSE_DATA.get(SNAPSHOT);if(!stored)return null;const value=resourceScope(JSON.parse(stored));inventoryCache.set(env.PT_UNIVERSE_DATA,{at:Date.now(),value});return value;}
export async function resourcesRoute(request:Request,env:ResourceEnv,publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY,browserReader?:()=>Promise<unknown>):Promise<Response|null>{
 const u=new URL(request.url),prefix='/api/resources';if(!u.pathname.startsWith(prefix+'/'))return null;
 const origin=request.headers.get('origin');if(origin&&origin!==ORIGIN)return json({error:'Origin denied'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(u.pathname===prefix+'/bootstrap'){
  if(request.method!=='POST'||u.search)return json({error:'Unsupported configuration request'},405);
  const grant=await verifyResourceToken(token,'resources:configure',Date.now(),publicKey);if(!grant)return json({error:'Owner configuration required'},401);
  const body=await request.text();if(new TextEncoder().encode(body).length>250000||grant.digest!==await hash(body))return json({error:'Invalid signed inventory'},400);
  try{const value=resourceScope(JSON.parse(body)),encoded=JSON.stringify(value),old=await env.PT_UNIVERSE_DATA.get(SNAPSHOT);if(old!==encoded)await env.PT_UNIVERSE_DATA.put(SNAPSHOT,encoded);inventoryCache.delete(env.PT_UNIVERSE_DATA);return json({ok:true,changed:old!==encoded});}catch{return json({error:'Invalid resource inventory'},400);}
 }
 if(request.method!=='GET')return json({error:'Read only'},405);
 if(!await verifyResourceToken(token,'resources:read',Date.now(),publicKey))return json({error:'请连接 PT 资源后台',code:'connect_required'},401);
 try{
  if(u.pathname===prefix+'/vps'&&!u.search){const cached=vpsCache.get(env.PT_UNIVERSE_DATA);if(cached&&Date.now()-cached.at<20000)return json(cached.value);const value=sanitizeVpsSnapshot(await readVpsSnapshot(env));vpsCache.set(env.PT_UNIVERSE_DATA,{at:Date.now(),value});return json(value);}
  if(u.pathname===prefix+'/browser'&&!u.search){if(!browserReader)return json({status:{provider:'browser',state:'unavailable',checkedAt:new Date().toISOString()}});return json(await browserReader());}
  const snapshot=await inventory(env);if(!snapshot)return json({error:'请重新连接，完成私有清单迁移',code:'inventory_missing'},503);
  if(u.pathname===prefix+'/data'&&!u.search)return json({...snapshot,connections:automaticConnections(env)});
  if(u.pathname===prefix+'/auto'&&u.searchParams.getAll('provider').length===1&&[...u.searchParams.keys()].every(k=>k==='provider')){
   const provider=u.searchParams.get('provider');if(!['github-inventory','github-storage','github-billing','cloudflare'].includes(provider||''))return json({error:'Unsupported provider'},400);
   return json(await collector.collect(provider,snapshot,env));
  }
  return json({error:'Unsupported resource request'},400);
 }catch{return json({error:'资源后台暂不可用，保留最近一次数据',code:'upstream_unavailable'},503);}
}
