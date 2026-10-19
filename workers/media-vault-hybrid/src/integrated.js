import {accountRoute,revoke} from './account.js';
import {appEnabled,appCookieDigest,randomHex,appCookie} from './account-auth.js';
import {digest} from './session-auth.js';
import assets from './preview-assets.js';
export const MEDIA_ORIGIN='https://ximinhu66.github.io';
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const allowed=new Set(['/session','/logout','/health','/quota','/jobs','/jobs/files','/jobs/cancel','/download-ticket','/pikpak/accounts','/novel/catalog']);
const personal=env=>appEnabled(env)&&env.MEDIA_APP_TEST_MODE==='personal';
export async function integratedRoute(request,env){
 try{return await integratedCore(request,env);}catch{return reply({error:"Download connection temporarily unavailable"},503);}
}
async function integratedCore(request,env){
 const u=new URL(request.url),p=u.pathname,origin=request.headers.get('Origin');
 if(p==='/media-vault-connect/'||p==='/media-vault-connect/device-connect.js'){
  if(request.method!=='GET')return reply({error:'GET required'},405);
  if(!personal(env))return reply({error:'Personal downloads unavailable'},404);
  if(p.endsWith('.js'))return new Response(assets['device-connect.js'],{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const nonce=randomHex(16);
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 Media Vault</title><style>body{font:18px/1.65 system-ui;background:#f5f7fa;color:#17202a;margin:0;padding:32px}main{max-width:520px;margin:8vh auto;background:white;padding:28px;border-radius:18px}h1{font-size:26px}code{display:block;overflow-wrap:anywhere;font-size:20px}p{margin:14px 0}.muted{color:#5d6878}</style><main><h1>连接 Media Vault</h1><p id="connectMessage" role="status">正在复用已有授权…</p><code id="connectCode"></code><p class="muted">连接成功后会自动返回 Media Vault。下载、任务和账号管理均在原页面完成。</p></main><script nonce="${nonce}" type="module" src="device-connect.js"></script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
 }
 if(p==='/app-auth/media-vault-connect'){
  if(request.method!=='POST'||origin!==u.origin)return reply({error:'Same-origin connection required'},403);
  if(!personal(env)||!env.DB)return reply({error:'Personal downloads unavailable'},403);
  const parentHash=await appCookieDigest(request),now=Date.now();
  const parent=parentHash?await env.DB.prepare("SELECT * FROM mv_hybrid_app_sessions WHERE digest=? AND account_id=? AND status='approved' AND expires_at>?").bind(parentHash,env.MEDIA_APP_ACCOUNT_ID,now).first():null;
  if(!parent||String(parent.pair_code).startsWith('vault:'))return reply({error:'An approved browser login is required'},403);
  let data;try{const text=await request.text();if(text.length>300)throw Error();data=JSON.parse(text);}catch{return reply({error:'Invalid connection choice'},400);}
  if(typeof data.remember!=='boolean')return reply({error:'Choose whether to remember this device'},400);
  const pair='vault:'+parent.id,prior=await env.DB.prepare('SELECT digest FROM mv_hybrid_app_sessions WHERE pair_code=?').bind(pair).first();
  if(prior)await revoke(env.DB,prior.digest);
  const token=randomHex(32),hash=await digest(token),id=randomHex(12),expires=data.remember?now+30*24*3600000:Math.min(parent.expires_at,now+24*3600000);
  const result=await env.DB.prepare("INSERT INTO mv_hybrid_app_sessions(digest,id,pair_code,account_id,status,created_at,expires_at) SELECT ?,?,?,?,'approved',?,? WHERE EXISTS(SELECT 1 FROM mv_hybrid_app_sessions WHERE digest=? AND status='approved' AND account_id=? AND expires_at>?) ON CONFLICT(pair_code) DO UPDATE SET digest=excluded.digest,id=excluded.id,status='approved',created_at=excluded.created_at,expires_at=excluded.expires_at").bind(hash,id,pair,parent.account_id,now,expires,parentHash,parent.account_id,now).run();
  if(!result.meta?.changes)return reply({error:'Browser approval changed'},409);
  return reply({token,expires_at:expires,session_id:id});
 }
 if(!p.startsWith('/vault-api/'))return null;
 const headers={'Access-Control-Allow-Origin':MEDIA_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Vary':'Origin','Cache-Control':'no-store'};
 const cors=response=>new Response(response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),...headers}});
 if(origin!==MEDIA_ORIGIN)return reply({error:'Media Vault origin required'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!personal(env)||!env.DB)return cors(reply({error:'Personal downloads unavailable'},403));
 const path=p.slice('/vault-api'.length);
 if(!allowed.has(path))return cors(reply({error:'Unknown Media Vault operation'},404));
 const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token))return cors(reply({error:'Connect this device first'},403));
 const row=await env.DB.prepare("SELECT digest FROM mv_hybrid_app_sessions WHERE digest=? AND account_id=? AND status='approved' AND pair_code LIKE 'vault:%' AND expires_at>? AND EXISTS(SELECT 1 FROM mv_hybrid_app_sessions parent WHERE parent.id=substr(mv_hybrid_app_sessions.pair_code,7) AND parent.status='approved' AND parent.account_id=mv_hybrid_app_sessions.account_id)").bind(await digest(token),env.MEDIA_APP_ACCOUNT_ID,Date.now()).first();
 if(!row)return cors(reply({error:'Device connection expired or revoked'},403));
 const destination=path==='/session'?'/app-auth/session':path==='/logout'?'/app-auth/logout':'/app-api'+path;
 const internal=new Request(u.origin+destination+u.search,{method:request.method,headers:{Origin:u.origin,Cookie:appCookie(token,0).split(';')[0],...(request.method==='POST'?{'Content-Type':'application/json'}:{})},...(request.method==='POST'?{body:await request.text()}:{})});
 const response=await accountRoute(internal,env);const safeHeaders=new Headers(response.headers);safeHeaders.delete('Set-Cookie');
 return cors(new Response(response.body,{status:response.status,headers:safeHeaders}));
}
