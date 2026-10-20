// Real Worker WebCrypto and D1. All GitHub responses are local fixtures.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../pt-universe-api/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(require.resolve('miniflare')).href);
const viaVps=process.argv.includes('--vps');
const origin='https://pt-media-hybrid.summer07-nanjolno.workers.dev',site='https://ximinhu66.github.io';
const fixture=`export {MediaRelay} from './relay.js';
import {handle} from './index.js';
import {novelCatalog,catalogFailure} from './account-catalog.js';
export default {async fetch(req,env){
 if(new URL(req.url).pathname==='/fixture-catalog')try{return Response.json(await novelCatalog('https://www.wenku8.net/book/3551.htm',{RELAY:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:204})})}}));}catch(e){const f=catalogFailure(e);return Response.json(f.body,{status:f.status});}
 return handle(req,env);
}};`;
let providerRedirect=false;const external=[];
const outboundService=async request=>{
 const url=request.url;external.push(url);
 if(url.startsWith('https://pt-universe-api.summer07-nanjolno.workers.dev/api/media/novel?'))return providerRedirect?new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/'}}):Response.json({title:'目录',chapters:[{title:'一',url:'private-drop'}]});
 assert.equal(request.headers.get('User-Agent'),'MediaVaultPrivateLogin');
 if(providerRedirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/'}});
 if(url.startsWith('https://api.github.com/app-manifests/'))return Response.json({owner:{id:36136585,type:'User'},client_id:'Iv1.'+'b'.repeat(16),client_secret:'s'.repeat(40),permissions:{},events:[]},{status:201});
 if(url==='https://github.com/login/oauth/access_token')return Response.json({access_token:'ghu_'+'x'.repeat(40),scope:''});
 if(url==='https://api.github.com/users/XiminHu66')return Response.json({id:36136585,type:'User'});
 if(url==='https://api.github.com/user')return Response.json({id:36136585,type:'User'});
 throw Error('Unexpected external fixture URL');
};
const modules=[{type:'ESModule',path:'entry.mjs',contents:fixture}];
for(const name of await readdir(new URL('./src/',import.meta.url)))if(name.endsWith('.js'))modules.push({type:'ESModule',path:name,contents:await readFile(new URL('./src/'+name,import.meta.url),'utf8')});
const options={host:'127.0.0.1',port:0,outboundService:request=>{if(viaVps&&['api.github.com','github.com'].includes(new URL(request.url).hostname))throw Error('VPS login must not use edge provider fetch');return outboundService(request);},durableObjects:{RELAY:{className:'MediaRelay',useSQLite:true}},compatibilityDate:'2026-08-26',modules,d1Databases:{DB:'login-fixture'},bindings:{ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'true',MEDIA_APP_TEST_MODE:'personal',MEDIA_APP_ACCOUNT_ID:'media-vault-personal',MEDIA_GITHUB_LOGIN:'true',MEDIA_LOGIN_TRANSPORT:viaVps?'vps':'edge',MEDIA_AGENT_TOKEN:'a'.repeat(64),MEDIA_OWNER_TOKEN:'o'.repeat(64)}};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
const ctx={channel:'a'.repeat(64),remember:true};
const request=(path,{body,cookie,source=origin,form}={})=>mf.dispatchFetch(origin+path,{redirect:'manual',method:body||form?'POST':'GET',headers:{...(source?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?JSON.stringify(body):form?new URLSearchParams(form).toString():undefined});
let agent,suppressReply=false,observeCall;const wireErrors=[];
try{
 const db=await mf.getD1Database('DB');
 for(const file of ['schema.sql','oauth-schema.sql'])await db.exec((await readFile(new URL('./'+file,import.meta.url),'utf8')).split('\n').filter(x=>!x.startsWith('--')).join(' '));
 if(viaVps){
  const connected=await mf.dispatchFetch(origin+'/agent/ws',{headers:{Upgrade:'websocket',Authorization:'Bearer '+'a'.repeat(64)}});assert.equal(connected.status,101);agent=connected.webSocket;agent.accept();
  agent.addEventListener('message',async event=>{try{
   if(typeof event.data!=='string')return;const m=JSON.parse(event.data);if(m.type!=='github-request')return;
   assert.match(m.id,/^[a-f0-9]{24}$/);if(suppressReply){observeCall?.();return;}agent.send(JSON.stringify({type:'github-response',id:'f'.repeat(24),status:200,data:{access_token:'unsolicited'}}));let url,method='GET',headers={'User-Agent':'MediaVaultPrivateLogin'},body;
   if(m.operation==='probe'){assert.deepEqual(m.payload,{});url='https://api.github.com/users/XiminHu66';}
   else if(m.operation==='manifest'){assert.deepEqual(m.payload,{code:'c'.repeat(40)});url='https://api.github.com/app-manifests/'+m.payload.code+'/conversions';method='POST';}
   else if(m.operation==='token'){assert.equal(m.payload.client_secret,'s'.repeat(40));assert.equal(m.payload.client_id,'Iv1.'+'b'.repeat(16));assert.match(m.payload.code_verifier,/^[a-f0-9]{64}$/);url='https://github.com/login/oauth/access_token';method='POST';body=new URLSearchParams(m.payload).toString();}
   else if(m.operation==='user'){assert.equal(m.payload.access_token,'ghu_'+'x'.repeat(40));url='https://api.github.com/user';}
   else throw Error('Unsupported operation');
   const response=await outboundService(new Request(url,{method,headers,body}));const data=response.status===302?{error:'github_unavailable'}:await response.json();agent.send(JSON.stringify({type:'github-response',id:m.id,status:response.status,data}));
  }catch(error){wireErrors.push(error);}});
 }
 let r=await request('/media-vault-login/connect',{body:ctx,source:site});assert.equal(r.status,201,await r.text());
 r=await request('/media-vault-login/setup/start',{form:{...ctx,remember:'true'}});assert.equal(r.status,200,await r.clone().text());
 const state=(await r.text()).match(/apps\/new\?state=([a-f0-9]{64})/)[1],cookie=r.headers.get('Set-Cookie').split(';')[0];
 r=await request('/media-vault-login/setup/callback?code='+'c'.repeat(40)+'&state='+state,{cookie,source:null});assert.equal(r.status,303);assert.ok(r.headers.get('Location').includes('/media-vault-connect/#'),r.headers.get('X-MV-Login-Error'));
 r=await request('/media-vault-login/start',{body:ctx});assert.equal(r.status,200,await r.clone().text());const auth=new URL((await r.json()).authorize_url),loginCookie=r.headers.get('Set-Cookie').split(';')[0];
 r=await request('/media-vault-login/callback?code='+'c'.repeat(40)+'&state='+auth.searchParams.get('state'),{cookie:loginCookie,source:null});assert.equal(r.status,303);assert.ok(r.headers.get('Location').includes('/media-vault-connect/#'),r.headers.get('X-MV-Login-Error'));
 const parent=r.headers.get('Set-Cookie').split(';')[0];r=await request('/media-vault-login/complete',{body:ctx,cookie:parent});assert.equal(r.status,200,await r.text());
 r=await mf.dispatchFetch(origin+'/media-vault-login/result',{headers:{Origin:site,Authorization:'Bearer '+ctx.channel}});assert.equal(r.status,200,await r.clone().text());const grant=await r.json();assert.match(grant.token,/^[a-f0-9]{64}$/);
 r=await mf.dispatchFetch(origin+'/vault-api/session',{headers:{Origin:site,Authorization:'Bearer '+grant.token}});assert.equal(r.status,200,await r.text());
 assert.equal(external.length,3,'native Worker fetch performed all three fixed provider requests');
 const count=await db.prepare('SELECT COUNT(*) AS n FROM mv_hybrid_app_sessions').first();
 r=await request('/login-readiness');assert.equal(r.status,401,'public cannot inspect login configuration');
 r=await mf.dispatchFetch(origin+'/login-readiness',{headers:{Authorization:'Bearer '+'o'.repeat(64)}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{enabled:true,provider_reachable:true,configured:true,provider_http_status:200,provider_reason:'ok',transport:viaVps?'vps':'edge'});
 r=await request('/fixture-catalog');assert.equal(r.status,200);assert.deepEqual(await r.json(),{title:'目录',total:1,chapters:[{index:0,title:'一'}],truncated:false});
 const blocked={channel:'b'.repeat(64),remember:false};r=await request('/media-vault-login/connect',{body:blocked,source:site});assert.equal(r.status,201);
 r=await request('/media-vault-login/start',{body:blocked});assert.equal(r.status,200);const blockedAuth=new URL((await r.json()).authorize_url),blockedCookie=r.headers.get('Set-Cookie').split(';')[0];
 providerRedirect=true;const beforeRedirect=external.length;
 r=await request('/media-vault-login/callback?code='+'c'.repeat(40)+'&state='+blockedAuth.searchParams.get('state'),{cookie:blockedCookie,source:null});assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/media-vault-login/failed?reason=service');assert.equal(external.length,beforeRedirect+1,'provider redirect never followed');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM mv_hybrid_app_sessions').first()).n,count.n,'redirect cannot create a session');
 r=await request('/media-vault-login/failed?reason=service');assert.equal(r.status,502);assert.ok((await r.text()).includes('这不是账号不符'));
 r=await request('/fixture-catalog');assert.equal(r.status,503);assert.equal((await r.json()).code,'catalog_upstream_http');assert.ok(external.every(url=>!url.startsWith('https://untrusted.invalid')));
 if(viaVps){
  suppressReply=true;const observed=new Promise(resolve=>observeCall=resolve),headers={Authorization:'Bearer '+'o'.repeat(64)};
  const pending=mf.dispatchFetch(origin+'/login-readiness',{headers});await observed;
  const busy=await mf.dispatchFetch(origin+'/login-readiness',{headers});assert.equal((await busy.json()).provider_http_status,429,'one in-flight login RPC is bounded');
  agent.close(1000,'fixture disconnect');const disconnected=await pending;assert.equal((await disconnected.json()).provider_http_status,503,'exact socket close settles pending RPC without waiting or creating a grant');
 }
 assert.deepEqual(wireErrors,[]);
 console.log((viaVps?'PASS outbound WSS GitHub login: ':'PASS actual workerd ')+ 'WebCrypto/D1 native fetch, bootstrap, PKCE, encrypted config/handoff, authenticated session, owner-only live readiness, catalog metadata and credential-safe redirect rejection; no live identity or external API');
}finally{try{agent?.close(1000,'fixture finished');}catch{}await mf.dispose();}
