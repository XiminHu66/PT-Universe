import {OWNER_CONNECT_PUBLIC_KEY,readVpsSnapshot} from './knowledge';
const ISSUER='https://pt-vps-tools.h1nano.chatgpt.site',ORIGIN='https://ximinhu66.github.io';
type VpsEnv={PT_UNIVERSE_DATA:KVNamespace};
const bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private,no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export async function verifyVpsToken(token:string,now=Date.now(),publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY){
 try{
  if(token.length>3500)return null;
  const [a,b,c,...extra]=token.split('.');if(extra.length||!a||!b||!c)return null;
  const h=JSON.parse(new TextDecoder().decode(bytes(a))),p=JSON.parse(new TextDecoder().decode(bytes(b))),t=Math.floor(now/1000);
  if(h.alg!=='ES256'||h.typ!=='JWT'||p.iss!==ISSUER||p.aud!=='pt-universe-vps'||p.sub!=='pt-backend-owner'||p.scope!=='vps:read'||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||p.iat>t+30||p.iat<t-86400||p.exp<=t||p.exp<=p.iat||p.exp-p.iat>86400||!/^[-\w]{24,80}$/.test(p.nonce||''))return null;
  const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(c),new TextEncoder().encode(a+'.'+b))?p:null;
 }catch{return null;}
}
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:0;
const pct=(v:unknown)=>Math.max(0,Math.min(100,finite(v)));
const iso=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const services=new Set(['pdf','pikpak','bilipack','karakeep','search','video','bt','omnitools','moodist','trip','koito','wanderer','trendradar','beszel']);
export function sanitizeVpsSnapshot(raw:any){
 const m=raw?.metrics;if(!m||!iso(m.sampleAt)||finite(m.memory?.totalBytes)<=0||finite(m.disk?.totalBytes)<=0)throw Error('invalid-sample');
 return {sampleAt:iso(m.sampleAt),fetchedAt:iso(m.fetchedAt),stale:m.stale===true||Date.now()-Date.parse(m.sampleAt)>180000,
  cpu:{percent:pct(m.cpu?.percent),load:Array.isArray(m.cpu?.load)?m.cpu.load.slice(0,3).map(finite):[]},
  memory:{percent:pct(m.memory?.percent),totalBytes:finite(m.memory?.totalBytes),usedBytes:finite(m.memory?.usedBytes)},
  disk:{percent:pct(m.disk?.percent),totalBytes:finite(m.disk?.totalBytes),usedBytes:finite(m.disk?.usedBytes),freeBytes:finite(m.disk?.freeBytes)},
  network:{sentBytesPerSecond:finite(m.network?.sentBytesPerSecond),receivedBytesPerSecond:finite(m.network?.receivedBytesPerSecond)},uptimeSeconds:finite(m.uptimeSeconds),
  history:(Array.isArray(m.history)?m.history:[]).slice(-30).filter((r:any)=>iso(r.at)).map((r:any)=>({at:iso(r.at),cpu:pct(r.cpu),memory:pct(r.memory),disk:pct(r.disk)})),
  services:(Array.isArray(raw?.services?.items)?raw.services.items:[]).filter((s:any)=>services.has(s.name)).map((s:any)=>({name:s.name,ok:s.ok===true,status:finite(s.status)}))};
}
const snapshots=new WeakMap<object,{at:number;value:unknown}>();
export async function vpsRoute(request:Request,env:VpsEnv,publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY):Promise<Response|null>{
 const u=new URL(request.url);if(!u.pathname.startsWith('/api/vps/'))return null;
 if(request.headers.get('origin')&&request.headers.get('origin')!==ORIGIN)return json({error:'Origin denied'},403);
 if(request.method!=='GET')return json({error:'只读接口不支持此操作'},405);
 if(u.pathname!=='/api/vps/overview'||u.search)return json({error:'不支持的监控请求'},400);
 const grant=await verifyVpsToken((request.headers.get('authorization')||'').replace(/^Bearer /,''),Date.now(),publicKey);
 if(!grant)return json({error:'请先连接私有工具中心',code:'connect_required'},401);
 try{
  const cached=snapshots.get(env.PT_UNIVERSE_DATA);if(cached&&Date.now()-cached.at<20000)return json(cached.value);
  const value=sanitizeVpsSnapshot(await readVpsSnapshot(env));snapshots.set(env.PT_UNIVERSE_DATA,{at:Date.now(),value});return json(value);
 }catch{return json({error:'暂时无法读取 VPS 状态。可重试连接或直接打开工具。',code:'upstream_unavailable'},503);}
}
