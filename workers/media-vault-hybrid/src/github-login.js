import {appEnabled,appCookie,appCookieDigest,randomHex} from './account-auth.js';
import {digest} from './session-auth.js';

export const LOGIN_OWNER_ID=36136585;
export const LOGIN_ORIGIN='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
export const SITE_ORIGIN='https://ximinhu66.github.io';
const prefix='/media-vault-login',flowCookie='__Host-mv-login',life=10*60000;
const pattern=/^[a-f0-9]{64}$/;
const enabled=env=>appEnabled(env)&&env.MEDIA_APP_TEST_MODE==='personal'&&env.MEDIA_GITHUB_LOGIN==='true';
const baseHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json',...extra}});
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function encryptionKey(env){
 if((env.MEDIA_AGENT_TOKEN||'').length<32)fail(503,'登录服务暂不可用，请稍后重试。');
 return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('media-vault-private-github-login-v1\0'+env.MEDIA_AGENT_TOKEN)),'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealLogin(value,env,purpose){
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(purpose)},await encryptionKey(env),new TextEncoder().encode(JSON.stringify(value)));
 return b64(iv)+'.'+b64(new Uint8Array(data));
}
async function openLogin(cipher,env,purpose){
 const [iv,data]=cipher.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(purpose)},await encryptionKey(env),unb64(data))));
}
const cookie=(value,age=600)=>flowCookie+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
const cookieValue=request=>(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(flowCookie+'='))?.slice(flowCookie.length+1);
function page(content,{status=200,headers={},script='',externalForm=false}={}){
 const nonce=randomHex(16);
 return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media Vault 私有登录</title><style>body{font:17px/1.65 system-ui;background:#f5f7fa;color:#17202a;margin:0;padding:28px}main{max-width:540px;margin:6vh auto;background:#fff;padding:28px;border-radius:18px}h1{font-size:25px}button,a.button{display:inline-block;border:0;border-radius:9px;padding:12px 18px;background:#267e60;color:white;font:inherit;text-decoration:none}.muted{color:#5d6878}input[hidden]{display:none}</style><main>${content}</main>${script?`<script nonce="${nonce}">${script}</script>`:''}</html>`,{status,headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action ${externalForm?'https://github.com':"'self'"}; frame-ancestors 'none'`,...headers}});
}
const cleanRedirect=(path,headers={})=>new Response(null,{status:303,headers:{...baseHeaders,Location:LOGIN_ORIGIN+path,...headers}});
function connectPath(context){return '/media-vault-connect/#'+new URLSearchParams({channel:context.channel,remember:String(context.remember)});}
async function readBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))fail(415,'需要 JSON 请求。');
 const text=await request.text();if(text.length>400)fail(400,'登录请求无效。');let data;try{data=JSON.parse(text);}catch{fail(400,'登录请求无效。');}
 if(!data||!pattern.test(data.channel||'')||typeof data.remember!=='boolean'||Object.keys(data).some(k=>!['channel','remember'].includes(k)))fail(400,'请从 Media Vault 重新打开登录。');return data;
}
async function limit(request,env){
 const now=Date.now(),until=(Math.floor(now/life)+1)*life,ip=await digest((request.headers.get('CF-Connecting-IP')||'unknown')+'|'+until);
 for(const [id,max] of [['ip:'+ip,10],['global:'+until,60]]){
  const row=await env.DB.prepare('INSERT INTO mv_hybrid_login_limits(id,hits,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id,until).first();if(row.hits>max)fail(429,'登录尝试过多，请稍后重试。');
 }
 await env.DB.batch(['flows','connections','limits'].map(table=>env.DB.prepare('DELETE FROM mv_hybrid_login_'+table+' WHERE expires_at<=?').bind(now)));
}
async function connection(data,env){
 const id=await digest(data.channel),row=await env.DB.prepare('SELECT * FROM mv_hybrid_login_connections WHERE digest=? AND expires_at>?').bind(id,Date.now()).first();
 if(!row||row.remember!==Number(data.remember))fail(409,'连接已到期或选项已变化，请回到 Media Vault 重试。');return {id,row};
}
async function config(env){
 const row=await env.DB.prepare("SELECT cipher FROM mv_hybrid_login_config WHERE id='github'").first();return row?openLogin(row.cipher,env,'config'):null;
}
async function beginFlow(request,env,kind,context){
 await limit(request,env);const state=randomHex(32),browser=randomHex(32),payload={...context,verifier:randomHex(32)};
 await env.DB.prepare('INSERT INTO mv_hybrid_login_flows(digest,browser_digest,kind,cipher,expires_at) VALUES(?,?,?,?,?)').bind(await digest(state),await digest(browser),kind,await sealLogin(payload,env,'flow'),Date.now()+life).run();return {state,browser,payload};
}
async function consumeFlow(request,env,kind){
 const u=new URL(request.url),state=u.searchParams.get('state'),browser=cookieValue(request);
 if(!pattern.test(state||'')||!pattern.test(browser||'')||u.searchParams.getAll('state').length!==1||u.searchParams.getAll('code').length>1)fail(403,'登录校验失败，请回到 Media Vault 重试。');
 const row=await env.DB.prepare('UPDATE mv_hybrid_login_flows SET consumed=1 WHERE digest=? AND browser_digest=? AND kind=? AND consumed=0 AND expires_at>? RETURNING cipher').bind(await digest(state),await digest(browser),kind,Date.now()).first();
 if(!row)fail(403,'登录请求已到期或已使用，请回到 Media Vault 重试。');
 const context=await openLogin(row.cipher,env,'flow');await connection(context,env);return context;
}
async function github(request,url,init={}){
 const response=await request(url,{...init,headers:{Accept:'application/vnd.github+json','User-Agent':'MediaVaultPrivateLogin',...init.headers},redirect:'error',signal:AbortSignal.timeout(15000)});
 const text=await response.text();if(text.length>64000||!response.ok)fail(502,'GitHub 暂时无法完成登录，请稍后重试。');let data;try{data=JSON.parse(text);}catch{fail(502,'GitHub 暂时无法完成登录，请稍后重试。');}return data;
}
export function loginManifest(){return {name:'Media Vault XiminHu66 '+randomHex(3),url:SITE_ORIGIN+'/PT-Universe/apps/media-vault/',description:'仅用于 XiminHu66 的 Media Vault 身份登录；不读取或写入仓库，不接收 webhook。',redirect_url:LOGIN_ORIGIN+prefix+'/setup/callback',callback_urls:[LOGIN_ORIGIN+prefix+'/callback'],public:false,default_permissions:{},default_events:[],hook_attributes:{url:LOGIN_ORIGIN+prefix+'/unused-webhook',active:false},request_oauth_on_install:false};}

// The callback never accepts an owner ID or a device/session ID from the browser.
// Only GitHub's fixed HTTPS /user response can create an approved personal parent.
export async function githubLoginRoute(request,env,{exchange,fetch:requestGitHub=fetch}={}){
 const u=new URL(request.url),path=u.pathname;
 if(!path.startsWith(prefix+'/'))return null;
 const origin=request.headers.get('Origin'),isResult=path===prefix+'/result',isConnect=path===prefix+'/connect',isReceipt=[prefix+'/ack',prefix+'/cancel'].includes(path),cross=isResult||isConnect||isReceipt;let callbackContext;
 const cors=origin===SITE_ORIGIN&&cross?{'Access-Control-Allow-Origin':SITE_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin'}:{};
 try{
  if(!enabled(env)||!env.DB)return json({error:'私有登录尚未启用。'},404,cors);
  if(u.origin!==LOGIN_ORIGIN)fail(403,'登录地址无效。');
  if(origin&&origin!==LOGIN_ORIGIN&&!(origin===SITE_ORIGIN&&cross))fail(403,'登录来源无效。');
  if(request.method==='OPTIONS')return origin===SITE_ORIGIN&&cross?new Response(null,{status:204,headers:{...baseHeaders,...cors}}):json({error:'来源无效。'},403);
  if(path===prefix+'/failed')return page('<h1>登录未完成</h1><p>请求可能已过期、被取消，或不是允许的 GitHub 账号。请关闭此窗口，回到 Media Vault 重新登录。</p>',{status:400});
  if(isConnect){
   if(request.method!=='POST'||![SITE_ORIGIN,LOGIN_ORIGIN].includes(origin))fail(403,'请从 Media Vault 开始登录。');
   const data=await readBody(request),id=await digest(data.channel),prior=await env.DB.prepare('SELECT remember,status,expires_at FROM mv_hybrid_login_connections WHERE digest=?').bind(id).first();
   if(prior){if(prior.remember!==Number(data.remember)||prior.expires_at<=Date.now()||prior.status!=='pending')fail(409,'请重新开始登录。');return json({ok:true},200,cors);}
   await limit(request,env);await env.DB.prepare('INSERT OR IGNORE INTO mv_hybrid_login_connections(digest,remember,expires_at) VALUES(?,?,?)').bind(id,Number(data.remember),Date.now()+life).run();return json({ok:true},201,cors);
  }
  if(isResult||isReceipt){
   if(request.method!==(isResult?'GET':'POST')||origin!==SITE_ORIGIN)fail(403,'请在 Media Vault 完成连接。');
   const proof=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!pattern.test(proof))fail(403,'连接校验失败。');
   if(isReceipt){await env.DB.prepare('DELETE FROM mv_hybrid_login_connections WHERE digest=?').bind(await digest(proof)).run();return json({ok:true},200,cors);}
   // The same secret can retry delivery until the main page acknowledges it.
   // No second device is minted; acknowledgement deletes the encrypted handoff.
   const ready=await env.DB.prepare("SELECT status,cipher FROM mv_hybrid_login_connections WHERE digest=? AND status IN ('deliverable','error') AND expires_at>?").bind(await digest(proof),Date.now()).first();
   return ready?ready.status==='error'?json({error:(await openLogin(ready.cipher,env,'handoff')).error},403,cors):json({status:'connected',...await openLogin(ready.cipher,env,'handoff')},200,cors):json({status:'pending'},202,cors);
  }
  if(path===prefix+'/start'){
   if(request.method!=='POST'||origin!==LOGIN_ORIGIN)fail(403,'需要同源登录。');const context=await readBody(request);await connection(context,env);const app=await config(env);
   if(!app)return json({status:'setup_required'});
   const flow=await beginFlow(request,env,'login',context),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.payload.verifier))));
   const url=new URL('https://github.com/login/oauth/authorize');url.search=new URLSearchParams({client_id:app.client_id,redirect_uri:LOGIN_ORIGIN+prefix+'/callback',state:flow.state,code_challenge:challenge,code_challenge_method:'S256',allow_signup:'false',login:'XiminHu66'});
   return json({authorize_url:url.href},200,{'Set-Cookie':cookie(flow.browser)});
  }
  if(path===prefix+'/setup/start'){
   if(request.method!=='POST'||origin!==LOGIN_ORIGIN)fail(403,'需要同源开通。');
   if(!(request.headers.get('Content-Type')||'').startsWith('application/x-www-form-urlencoded'))fail(415,'开通表单无效。');
   const text=await request.text();if(text.length>300)fail(400,'开通表单无效。');const params=new URLSearchParams(text),context={channel:params.get('channel'),remember:params.get('remember')==='true'};if(!pattern.test(context.channel||'')||!['true','false'].includes(params.get('remember')))fail(400,'请重新开始连接。');await connection(context,env);
   const flow=await beginFlow(request,env,'setup',context),action='https://github.com/settings/apps/new?state='+flow.state;
   return page(`<h1>首次启用 GitHub 登录</h1><p>正在打开 GitHub 的私有应用创建页面。应用只识别你的身份，不申请仓库读写权限，无需安装到仓库。</p><form id="manifest" action="${action}" method="post"><input hidden name="manifest" value="${escape(JSON.stringify(loginManifest()))}"><button>继续到 GitHub</button></form>`,{headers:{'Set-Cookie':cookie(flow.browser),'Referrer-Policy':'strict-origin'},externalForm:true,script:'document.getElementById("manifest").submit();'});
  }
  if(path===prefix+'/setup/callback'){
   if(request.method!=='GET')fail(405,'需要 GET。');const context=callbackContext=await consumeFlow(request,env,'setup'),code=u.searchParams.get('code');if(!/^[a-zA-Z0-9_-]{16,200}$/.test(code||''))fail(403,'GitHub 开通已取消，请重新登录。');
   const app=await github(requestGitHub,'https://api.github.com/app-manifests/'+encodeURIComponent(code)+'/conversions',{method:'POST'});
   if(app.owner?.id!==LOGIN_OWNER_ID||app.owner?.type!=='User')fail(403,'仅允许指定 GitHub 账号开通。');
   if(!/^Iv[0-9A-Za-z.]{5,100}$/.test(app.client_id||'')||!/^[a-zA-Z0-9_-]{20,200}$/.test(app.client_secret||'')||!app.permissions||Object.entries(app.permissions).some(([key,value])=>key!=='metadata'||value!=='read')||!Array.isArray(app.events)||app.events.length)fail(403,'登录应用权限不符合要求。');
   // Discard GitHub's generated PEM/webhook secret. No installation token or
   // repository API access is used; persist only the encrypted OAuth client.
   await env.DB.prepare("INSERT INTO mv_hybrid_login_config(id,cipher,created_at) VALUES('github',?,?) ON CONFLICT(id) DO UPDATE SET cipher=excluded.cipher,created_at=excluded.created_at").bind(await sealLogin({client_id:app.client_id,client_secret:app.client_secret},env,'config'),Date.now()).run();
   return cleanRedirect(connectPath(context),{'Set-Cookie':cookie('',0)});
  }
  if(path===prefix+'/callback'){
   if(request.method!=='GET')fail(405,'需要 GET。');const context=callbackContext=await consumeFlow(request,env,'login'),code=u.searchParams.get('code');if(!/^[a-zA-Z0-9_-]{16,200}$/.test(code||''))fail(403,'GitHub 登录已取消，请重试。');
   const app=await config(env);if(!app)fail(503,'登录服务尚未开通。');
   const token=await github(requestGitHub,'https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({client_id:app.client_id,client_secret:app.client_secret,code,redirect_uri:LOGIN_ORIGIN+prefix+'/callback',code_verifier:context.verifier}).toString()});
   if(token.error||typeof token.access_token!=='string'||token.access_token.length<20||String(token.scope||'').trim())fail(403,'GitHub 登录未完成，或返回了额外权限。');
   const user=await github(requestGitHub,'https://api.github.com/user',{headers:{Authorization:'Bearer '+token.access_token}});
   if(user.id!==LOGIN_OWNER_ID||user.type!=='User')fail(403,'此 Media Vault 仅允许指定 GitHub 账号登录。');
   const now=Date.now(),raw=randomHex(32),id=randomHex(12),expires=now+(context.remember?30:1)*86400000;
   const added=await env.DB.prepare("INSERT INTO mv_hybrid_app_sessions(digest,id,pair_code,account_id,status,created_at,expires_at) SELECT ?,?,?,?,'approved',?,? WHERE (SELECT COUNT(*) FROM mv_hybrid_app_sessions WHERE account_id=? AND status='approved' AND pair_code NOT LIKE 'vault:%' AND expires_at>?)<20 AND EXISTS(SELECT 1 FROM mv_hybrid_login_connections WHERE digest=? AND status='pending' AND expires_at>?)").bind(await digest(raw),id,'oauth:'+randomHex(16),env.MEDIA_APP_ACCOUNT_ID,now,expires,env.MEDIA_APP_ACCOUNT_ID,now,await digest(context.channel),now).run();
   if(!added.meta?.changes)fail(409,'已达到设备上限，请从已登录设备撤销旧设备后重试。');
   return cleanRedirect(connectPath(context),{'Set-Cookie':appCookie(raw,Math.floor((expires-now)/1000))});
  }
  if(path===prefix+'/complete'){
   if(request.method!=='POST'||origin!==LOGIN_ORIGIN)fail(403,'需要同源连接。');const context=await readBody(request),{id}=await connection(context,env),hash=await appCookieDigest(request);
   const parent=hash?await env.DB.prepare("SELECT id FROM mv_hybrid_app_sessions WHERE digest=? AND account_id=? AND status='approved' AND expires_at>? AND pair_code NOT LIKE 'vault:%'").bind(hash,env.MEDIA_APP_ACCOUNT_ID,Date.now()).first():null;if(!parent)fail(403,'请先使用 GitHub 登录。');
   const claimed=await env.DB.prepare("UPDATE mv_hybrid_login_connections SET status='processing' WHERE digest=? AND status='pending' AND expires_at>? RETURNING digest").bind(id,Date.now()).first();if(!claimed)fail(409,'连接已处理，请返回 Media Vault。');
   try{
    const response=await exchange(new Request(LOGIN_ORIGIN+'/app-auth/media-vault-connect',{method:'POST',headers:{Origin:LOGIN_ORIGIN,Cookie:request.headers.get('Cookie')||'','Content-Type':'application/json'},body:JSON.stringify({remember:context.remember})}),env);
    if(response.status!==200)fail(503,'设备连接暂不可用，请重试。');const grant=await response.json();
    await env.DB.prepare("UPDATE mv_hybrid_login_connections SET status='deliverable',cipher=? WHERE digest=? AND status='processing'").bind(await sealLogin(grant,env,'handoff'),id).run();return json({ok:true});
   }catch(error){await env.DB.prepare("UPDATE mv_hybrid_login_connections SET status='pending' WHERE digest=? AND status='processing'").bind(id).run();throw error;}
  }
  return json({error:'登录入口不存在。'},404);
 }catch(error){
  const status=error.status||503,message=error.status?error.message:'登录服务暂不可用，请稍后重试。';
  if(callbackContext)try{await env.DB.prepare("UPDATE mv_hybrid_login_connections SET status='error',cipher=?,expires_at=? WHERE digest=? AND status='pending'").bind(await sealLogin({error:message},env,'handoff'),Date.now()+120000,await digest(callbackContext.channel)).run();}catch{}
  if(path.endsWith('/callback'))return cleanRedirect(prefix+'/failed',{'Set-Cookie':cookie('',0),'X-MV-Login-Error':String(status)});
  return json({error:message},status,cors);
 }
}
