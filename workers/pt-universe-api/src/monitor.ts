import {OWNER_CONNECT_PUBLIC_KEY,monitorTransport} from './knowledge';
const ISSUER='https://pt-vps-tools.h1nano.chatgpt.site',ORIGIN='https://ximinhu66.github.io';
const bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const headers={'cache-control':'private,no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers});
export async function verifyMonitorToken(token:string,now=Date.now(),publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY){
 try{if(token.length>3500)return null;const [a,b,c,...extra]=token.split('.');if(extra.length||!a||!b||!c)return null;const h=JSON.parse(new TextDecoder().decode(bytes(a))),p=JSON.parse(new TextDecoder().decode(bytes(b))),t=Math.floor(now/1000);
 if(h.alg!=='ES256'||h.typ!=='JWT'||p.iss!==ISSUER||p.aud!=='pt-universe-monitor'||p.sub!=='pt-backend-owner'||p.scope!=='monitor:manage'||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||p.iat>t+30||p.iat<t-3600||p.exp<=t||p.exp<=p.iat||p.exp-p.iat>3600||!/^[a-f0-9]{48}$/.test(p.nonce||''))return null;
 const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(c),new TextEncoder().encode(a+'.'+b))?p:null;}catch{return null;}
}
export function allowedMonitorPath(path:string,method:string){
 if(path.includes('?')||path.includes('%')||path.includes('\\'))return false;const id='[a-f0-9-]{36}';
 if(['/state','/export'].includes(path))return method==='GET';
 if(path==='/objects'||path==='/settings')return method==='POST';
 if(new RegExp('^/objects/'+id+'$').test(path))return ['GET','PATCH','DELETE'].includes(method);
 if(new RegExp('^/objects/'+id+'/sources$').test(path))return method==='POST';
 if(new RegExp('^/sources/'+id+'$').test(path))return method==='PATCH';
 if(new RegExp('^/sources/'+id+'/(check|confirm)$').test(path))return method==='POST';
 if(new RegExp('^/events/'+id+'$').test(path))return method==='PATCH';
 return new RegExp('^/evidence/'+id+'$').test(path)&&method==='GET';
}
export async function monitorRoute(request:Request,env:{PT_UNIVERSE_DATA:KVNamespace},publicKey:JsonWebKey=OWNER_CONNECT_PUBLIC_KEY):Promise<Response|null>{
 const u=new URL(request.url),prefix='/api/monitor';if(!u.pathname.startsWith(prefix+'/'))return null;
 if(request.headers.get('origin')&&request.headers.get('origin')!==ORIGIN)return json({error:'Origin denied'},403);
 if(!await verifyMonitorToken((request.headers.get('authorization')||'').replace(/^Bearer /,''),Date.now(),publicKey))return json({error:'请连接私有工具中心',code:'connect_required'},401);
 const path=u.pathname.slice(prefix.length);if(u.search||!allowedMonitorPath(path,request.method))return json({error:'Unsupported monitor request'},400);
 try{let body:string|null=null;if(!['GET','HEAD'].includes(request.method)){body=await request.text();if(new TextEncoder().encode(body).length>32768)return json({error:'请求过大'},413);try{JSON.parse(body)}catch{return json({error:'Invalid JSON'},400);}}
 const r=await monitorTransport(env,path,request.method,body),type=r.headers.get('content-type')||'';if(!type.includes('application/json')){await r.body?.cancel();return json({error:'监控后台正在连接，请稍后重试'},503);}return new Response(r.body,{status:r.status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
 }catch{return json({error:'VPS监控后台暂不可用，请重试连接',code:'upstream_unavailable'},503);}
}
