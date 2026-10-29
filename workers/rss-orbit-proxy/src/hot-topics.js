const ORIGINS=new Set(['https://ximinhu66.github.io','http://localhost:4173','http://127.0.0.1:4173']);
const SNAPSHOT='hot-topics:snapshot:v1',TRANSPORT='private/knowledge/vps-transport-v1';
const b64=a=>btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const clean=(v,n=400)=>String(v??'').replace(/<[^>]*>/g,' ').trim().slice(0,n);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const url=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
export function sanitizeSnapshot(raw){
 if(raw?.revision!=='rss-hot-topics-v1'||!date(raw.generated_at)||!Array.isArray(raw.items)||!Array.isArray(raw.sources))throw Error('Invalid news snapshot');
 const sources=raw.sources.slice(0,100).filter(s=>/^(rss|hot):[a-z0-9_-]{1,80}$/i.test(s?.id)).map(s=>({id:s.id,name:clean(s.name,100),kind:s.kind==='hotlist'?'hotlist':'rss',url:url(s.url),status:['ok','error'].includes(s.status)?s.status:'pending',checked_at:date(s.checked_at)}));
 const allowed=new Map(sources.map(s=>[s.id,s]));
 const items=raw.items.slice(0,1000).filter(x=>allowed.has(x.source_id)&&url(x.url)&&date(x.collected_at)).map(x=>({id:clean(x.id,500),title:clean(x.title,300),url:url(x.url),source_id:x.source_id,source:allowed.get(x.source_id).name,kind:allowed.get(x.source_id).kind,published_at:date(x.published_at),collected_at:date(x.collected_at),first_seen_at:date(x.first_seen_at),rank:Number.isInteger(x.rank)&&x.rank>0&&x.rank<100000?x.rank:null,rank_change:Number.isInteger(x.rank_change)?Math.max(-10000,Math.min(10000,x.rank_change)):null,appearances:Math.max(1,Math.min(10000,Number(x.appearances)||1)),summary:clean(x.summary,500)}));
 return {revision:'rss-hot-topics-v1',generated_at:date(raw.generated_at),stale:raw.stale===true||Date.now()-Date.parse(raw.generated_at)>2*3600000,sources,items};
}
export async function readVpsNews(env,fetchImpl=fetch){
 const raw=await env.PT_UNIVERSE_DATA?.get(TRANSPORT);if(!raw)throw Error('News transport not configured');
 const c=JSON.parse(raw),u=new URL(c.origin);
 if(u.protocol!=='https:'||!(/^[a-z0-9-]+\.trycloudflare\.com$/).test(u.hostname)||u.pathname!=='/'||u.port||u.search||u.hash||u.username||u.password||c.siteOrigin!=='https://pt-vps-tools.h1nano.chatgpt.site'||c.jwk?.kty!=='EC'||c.jwk?.crv!=='P-256'||!c.jwk?.d)throw Error('Invalid news transport');
 const path='/hub/api/hot-topics',timestamp=String(Date.now()),nonce=b64(crypto.getRandomValues(new Uint8Array(18)));
 const message=['pt-gateway-v1','hub','GET',path,timestamp,nonce,c.siteOrigin,''].join('\n');
 const key=await crypto.subtle.importKey('jwk',c.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(message))));
 const r=await fetchImpl(u.origin+path,{method:'GET',headers:{'x-pt-time':timestamp,'x-pt-nonce':nonce,'x-pt-signature':signature,'x-pt-role':'hub',origin:c.siteOrigin},redirect:'manual',signal:AbortSignal.timeout(18000)});
 if(!r.ok){await r.body?.cancel();throw Error('News unavailable');}
 const reader=r.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('News response too large');}chunks.push(value);}
 const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
 return sanitizeSnapshot(JSON.parse(new TextDecoder().decode(merged)));
}
let inflight=null;
export async function hotTopicsRoute(request,env){
 const u=new URL(request.url);if(!['/hot-topics','/hot-topics/sources'].includes(u.pathname))return null;
 const origin=request.headers.get('origin')||'',headers={'access-control-allow-origin':ORIGINS.has(origin)?origin:'https://ximinhu66.github.io','access-control-allow-methods':'GET, HEAD, OPTIONS','access-control-allow-headers':'Accept, Content-Type',vary:'Origin','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':'no-store'};
 const respond=(d,status=200)=>new Response(request.method==='HEAD'?null:JSON.stringify(d),{status,headers});
 if(origin&&!ORIGINS.has(origin))return respond({error:'Origin denied'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','HEAD'].includes(request.method))return respond({error:'Read only'},405);
 if([...u.searchParams.keys()].some(k=>k!=='t'))return respond({error:'Unsupported news request'},400);
 const cached=await env.RSS_CACHE?.get(SNAPSHOT,'json');let data=cached?.value;
 if(!data||Date.now()-Number(cached?.cachedAt||0)>120000){
  try{
   if(!inflight)inflight=(async()=>{const value=await readVpsNews(env);await env.RSS_CACHE?.put(SNAPSHOT,JSON.stringify({cachedAt:Date.now(),value}),{expirationTtl:30*86400});return value;})();
   data=await inflight;
  }catch{if(data)data={...data,stale:true};else return respond({revision:'rss-hot-topics-v1',error:'暂时无法读取热点，原有 RSS 阅读不受影响。'},503);}
  finally{inflight=null;}
 }
 const result={...data,stale:data.stale||Date.now()-Date.parse(data.generated_at)>2*3600000};
 return respond(u.pathname.endsWith('/sources')?{revision:result.revision,generated_at:result.generated_at,stale:result.stale,sources:result.sources}:result);
}
