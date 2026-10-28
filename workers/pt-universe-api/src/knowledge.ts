// PT Universe owns the knowledge API. The existing private hub is used only to
// authenticate the owner and provision the already deployed VPS transport.
// Private keys, native cookies, source bodies and capabilities are never logged.
const ISSUER='https://pt-vps-tools.h1nano.chatgpt.site';
const ORIGIN='https://ximinhu66.github.io';
const PUBLIC_KEY:JsonWebKey={key_ops:['verify'],ext:true,kty:'EC',x:'K8ov89BUOrCoAYzYMnjz6OTnwsnCHiQwBiS6vU56SwA',y:'xPOB1n3kM9SKbq6KMnNrTN1pfn1fXSfVAgvcqXFfDr4',crv:'P-256'};
const CONFIG_KEY='private/knowledge/vps-transport-v1',SESSION_KEY='private/knowledge/native-session-v1';
type Config={origin:string;jwk:JsonWebKey;siteOrigin:string;revision:string};
type KnowledgeEnv={PT_UNIVERSE_DATA:KVNamespace};
const b64=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const headers={'cache-control':'private,no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
export async function hash(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyKnowledgeToken(token:string,scope:string,now=Date.now(),publicKey:JsonWebKey=PUBLIC_KEY){
 try{if(token.length>3500)return null;const [a,b,c,...extra]=token.split('.');if(extra.length||!a||!b||!c)return null;const h=JSON.parse(new TextDecoder().decode(bytes(a))),p=JSON.parse(new TextDecoder().decode(bytes(b))),t=Math.floor(now/1000),max=scope==='knowledge:configure'?60:86400;
 if(h.alg!=='ES256'||h.typ!=='JWT'||p.iss!==ISSUER||p.aud!=='pt-universe-knowledge'||p.sub!=='pt-backend-owner'||p.scope!==scope||!Number.isInteger(p.exp)||!Number.isInteger(p.iat)||p.exp<=t||p.iat>t+30||p.iat<t-max||p.exp-p.iat>max||p.exp<=p.iat||!/^[-\w]{24,80}$/.test(p.nonce||''))return null;
 const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(c),new TextEncoder().encode(a+'.'+b))?p:null;}catch{return null;}
}
export function validConfig(raw:any):raw is Config{try{const u=new URL(raw.origin);return u.protocol==='https:'&&/^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname)&&u.pathname==='/'&&!u.search&&!u.hash&&!u.port&&!u.username&&!u.password&&raw.siteOrigin===ISSUER&&raw.jwk?.kty==='EC'&&raw.jwk?.crv==='P-256'&&typeof raw.jwk.d==='string'&&typeof raw.jwk.x==='string'&&typeof raw.jwk.y==='string';}catch{return false;}}
export function allowedNativePath(path:string,method:string){
 const [pathname,query='']=path.split('?');if(query.length>5000||/%(?:2f|5c|2e)|\\|\/\//i.test(pathname))return false;
 const id='[a-zA-Z0-9_-]{6,100}',base='/karakeep/api/v1/';
 if(new RegExp('^/karakeep/api/assets/'+id+'$').test(pathname))return ['GET','HEAD'].includes(method);
 if(pathname===base+'bookmarks')return ['GET','POST'].includes(method);
 if(pathname===base+'lists')return ['GET','POST'].includes(method);
 if(pathname===base+'assets')return method==='POST';
 if(new RegExp('^'+base+'bookmarks/'+id+'$').test(pathname))return ['GET','PATCH','DELETE'].includes(method);
 if(new RegExp('^'+base+'bookmarks/'+id+'/(content|tags)$').test(pathname))return ['GET','POST','DELETE'].includes(method)&&(!pathname.endsWith('/content')||method==='GET');
 if(new RegExp('^'+base+'lists/'+id+'$').test(pathname))return ['GET','PATCH'].includes(method);
 if(new RegExp('^'+base+'lists/'+id+'/bookmarks$').test(pathname))return method==='GET';
 return new RegExp('^'+base+'lists/'+id+'/bookmarks/'+id+'$').test(pathname)&&['PUT','DELETE'].includes(method);
}
async function signedFetch(config:Config,path:string,method:string,body:BodyInit|null=null,contentType='',cookie='',range='',timeoutMs=110000){
 const timestamp=Date.now().toString(),nonce=b64(crypto.getRandomValues(new Uint8Array(18))),message=['pt-gateway-v1','hub',method,path,timestamp,nonce,config.siteOrigin,contentType].join('\n');
 const key=await crypto.subtle.importKey('jwk',config.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']),sig=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(message))));
 const h=new Headers({'x-pt-time':timestamp,'x-pt-nonce':nonce,'x-pt-signature':sig,'x-pt-role':'hub','x-forwarded-proto':'https','x-forwarded-host':new URL(config.siteOrigin).host,origin:config.siteOrigin});if(contentType)h.set('content-type',contentType);if(cookie)h.set('cookie',cookie);if(range&&/^bytes=\d*-\d*$/.test(range))h.set('range',range);
 return fetch(config.origin.replace(/\/$/,'')+path,{method,headers:h,body:['GET','HEAD'].includes(method)?undefined:body,redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});
}
// A separate read-only capability uses the existing server-owned transport.
// Its caller cannot supply a method, URL, cookie, or arbitrary native API path.
export {PUBLIC_KEY as OWNER_CONNECT_PUBLIC_KEY};
// A bounded monitor adapter reuses the provisioned transport without exposing
// its signing key, cookies, arbitrary paths or upstream configuration.
export async function monitorTransport(env:KnowledgeEnv,path:string,method:string,body:string|null){
 if(!/^\/(state|export|objects|sources|events|settings|evidence)(\/|$)/.test(path)||/[?%\\]/.test(path))throw Error('invalid-monitor-path');
 const raw=await env.PT_UNIVERSE_DATA.get(CONFIG_KEY);if(!raw)throw Error('transport-not-configured');const config=JSON.parse(raw) as Config;if(!validConfig(config))throw Error('transport-invalid');
 return signedFetch(config,'/__pt_monitor/api'+path,method,body,'application/json','','',30000);
}
export async function readVpsSnapshot(env:KnowledgeEnv){
 const stored=await env.PT_UNIVERSE_DATA.get(CONFIG_KEY);
 if(!stored)throw Error('transport-not-configured');
 const config=JSON.parse(stored) as Config;if(!validConfig(config))throw Error('transport-invalid');
 const results=await Promise.allSettled(['/hub/api/metrics','/hub/status'].map(async path=>{
  const r=await signedFetch(config,path,'GET',null,'','','',12000);
  if(!r.ok){await r.body?.cancel();throw Error('read-unavailable');}
  return r.json();
 }));
 if(results[0].status!=='fulfilled')throw Error('metrics-unavailable');
 return {metrics:results[0].value,services:results[1].status==='fulfilled'?results[1].value:null};
}
export function nativeCookies(h:Headers){const extended=h as Headers&{getAll?:(name:string)=>string[]};const lines=typeof h.getSetCookie==='function'?h.getSetCookie():extended.getAll?extended.getAll('Set-Cookie'):[h.get('set-cookie')||''];return lines.flatMap(s=>s.split(/,(?=\s*(?:__Secure-|__Host-)?next-auth\.)/)).map(s=>s.trim().split(';',1)[0]).filter(s=>/^(?:__Secure-|__Host-)?next-auth\.(?:session-token(?:\.\d{1,2})?|csrf-token|callback-url)=/.test(s)).join('; ');}
async function nativeSession(env:KnowledgeEnv,config:Config,fresh=false){if(!fresh){const raw=await env.PT_UNIVERSE_DATA.get(SESSION_KEY);if(raw){try{const s=JSON.parse(raw);if(s.revision===config.revision&&s.exp>Date.now())return s.cookie as string;}catch{}}}
 const r=await signedFetch(config,'/hub/open/karakeep','GET'),cookie=nativeCookies(r.headers);await r.body?.cancel();if(!/next-auth\.session-token/.test(cookie))throw Error('native-login-unavailable');await env.PT_UNIVERSE_DATA.put(SESSION_KEY,JSON.stringify({cookie,revision:config.revision,exp:Date.now()+6*3600000}),{expirationTtl:6*3600});return cookie;
}
async function nativeRequest(env:KnowledgeEnv,config:Config,path:string,request:Request){const cookie=await nativeSession(env,config),method=request.method,type=request.headers.get('content-type')||'',range=request.headers.get('range')||'';
 // A bounded request body can be replayed once only for a native 401. Never
 // retry an accepted mutation or stream the upload twice after success.
 let body:BodyInit|null=null;const streamed=type.startsWith('multipart/form-data');if(!['GET','HEAD'].includes(method)){if(Number(request.headers.get('content-length')||0)>81*1024*1024)return json({error:'文件超过 80 MiB 上传上限'},413);if(streamed){let size=0;body=request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>81*1024*1024)throw Error('upload-too-large');controller.enqueue(chunk);}}))||null;}else{const data=await request.arrayBuffer();if(data.byteLength>8*1024*1024)return json({error:'单条资料超过 8 MiB'},413);body=data;}}
 let r=await signedFetch(config,path,method,body,type,cookie,range);if(r.status===401){await r.body?.cancel();if(streamed){await nativeSession(env,config,true);return json({error:'上传会话已恢复，请重试上传。'},401);}r=await signedFetch(config,path,method,body,type,await nativeSession(env,config,true),range);}
 if(r.status>=300&&r.status<400){await r.body?.cancel();return json({error:'VPS 返回了不支持的重定向，请重新连接后台。'},502);}
 const h=new Headers(headers);for(const name of ['content-type','content-length','content-disposition','content-range','accept-ranges','content-security-policy','x-frame-options','content-encoding']){const v=r.headers.get(name);if(v)h.set(name,v);}return new Response(r.body,{status:r.status,headers:h});
}
export async function knowledgeRoute(request:Request,env:KnowledgeEnv,publicKey:JsonWebKey=PUBLIC_KEY):Promise<Response|null>{const u=new URL(request.url),prefix='/api/knowledge';if(!u.pathname.startsWith(prefix+'/'))return null;
 try{
 const op=u.pathname.slice(prefix.length),origin=request.headers.get('origin');if(origin&&origin!==ORIGIN&&!(op.startsWith('/asset/')&&['GET','HEAD'].includes(request.method)&&origin===u.origin))return json({error:'Origin denied'},403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(op==='/configure'){
  if(request.method!=='POST')return json({error:'POST required'},405);const grant=await verifyKnowledgeToken(token,'knowledge:configure',Date.now(),publicKey);if(!grant)return json({error:'Owner provisioning signature required'},401);
  const raw=await request.text();if(raw.length>6000||grant.digest!==await hash(raw))return json({error:'Invalid signed configuration'},400);let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!validConfig(data))return json({error:'Invalid VPS transport'},400);
  const revision=await hash(raw);await env.PT_UNIVERSE_DATA.put(CONFIG_KEY,JSON.stringify({origin:data.origin,jwk:data.jwk,siteOrigin:data.siteOrigin,revision}));return json({ok:true,backend:'existing-vps',storage:'Karakeep'});
 }
 let ticket=false;if(op.startsWith('/asset/')&&['GET','HEAD'].includes(request.method)){
  const id=op.slice(7),nonce=u.searchParams.get('ticket')||'';if(/^[a-f0-9]{48}$/.test(nonce)&&/^[\w-]{6,100}$/.test(id)){
   const raw=await env.PT_UNIVERSE_DATA.get('private/knowledge/asset/'+await hash(nonce));if(raw){const t=JSON.parse(raw);ticket=t.id===id&&t.exp>Date.now();}
  }
 }
 if(!ticket&&!await verifyKnowledgeToken(token,'knowledge:session',Date.now(),publicKey))return json({error:'请连接 PT 后台以读取你的私有知识库。'},401);
 const stored=await env.PT_UNIVERSE_DATA.get(CONFIG_KEY);if(!stored)return json({error:'知识库后台尚未连接，请点击「连接 PT 后台」。'},503);const config=JSON.parse(stored) as Config;if(!validConfig(config))return json({error:'VPS transport unavailable'},503);
 if(op==='/status'&&request.method==='GET'){await nativeSession(env,config);return json({ok:true,backend:'vps-karakeep',frontend:'PT-Universe'});}
 if(op==='/asset-ticket'&&request.method==='POST'){
  const raw=await request.text();if(raw.length>300)return json({error:'Too large'},413);let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!/^[\w-]{6,100}$/.test(body.id||''))return json({error:'Invalid asset'},400);
  const nonce=[...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join(''),exp=Date.now()+600000;await env.PT_UNIVERSE_DATA.put('private/knowledge/asset/'+await hash(nonce),JSON.stringify({id:body.id,exp}),{expirationTtl:600});return json({url:u.origin+prefix+'/asset/'+body.id+'?ticket='+nonce,expiresAt:exp});
 }
 let path=op.startsWith('/asset/')?'/karakeep/api/assets/'+op.slice(7):op;
 if(!allowedNativePath(path,request.method))return json({error:'Knowledge API path or method denied'},403);
 if(!op.startsWith('/asset/'))path+=u.search;
 return await nativeRequest(env,config,path,request);
 }catch{return json({error:'VPS 知识库暂时无法连接，请重试连接后台。'},502);}
}
