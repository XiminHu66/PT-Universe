import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {githubLoginRoute,LOGIN_ORIGIN as origin,SITE_ORIGIN,loginManifest} from './src/github-login.js';
import {integratedRoute} from './src/integrated.js';
import {handle} from './src/index.js';
import {digest} from './src/session-auth.js';

const child=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']}),pending=new Map();let sequence=0;
const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
function sql(ops,batch=false){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops,batch})+'\n');});}
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,batch:ops=>sql(ops,true)},env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'true',MEDIA_APP_TEST_MODE:'personal',MEDIA_APP_ACCOUNT_ID:'media-vault-personal',MEDIA_GITHUB_LOGIN:'true',MEDIA_AGENT_TOKEN:'a'.repeat(64),MEDIA_OWNER_TOKEN:'o'.repeat(64)};
const calls=[],clientID='Iv1.'+'b'.repeat(16),secret='s'.repeat(40),code='c'.repeat(40);let githubID=36136585,permissions={},ghFailure=false,scope='';
const github=async(url,options)=>{
 calls.push({url,options});assert.equal(options.redirect,'error');
 if(ghFailure)throw Error('fixture network outage');
 if(url.includes('/app-manifests/'))return Response.json({owner:{id:githubID,type:'User'},client_id:clientID,client_secret:secret,permissions,events:[],pem:'discard-this-unused-private-key',webhook_secret:'discard-unused-webhook-secret'},{status:201});
 if(url==='https://github.com/login/oauth/access_token'){const data=new URLSearchParams(options.body);assert.equal(data.get('client_id'),clientID);assert.equal(data.get('client_secret'),secret);assert.equal(data.get('redirect_uri'),origin+'/media-vault-login/callback');assert.match(data.get('code_verifier'),/^[a-f0-9]{64}$/);return Response.json({access_token:'ghu_'+ 'x'.repeat(40),scope,token_type:'bearer'});}
 assert.equal(url,'https://api.github.com/user');assert.equal(options.headers.Authorization,'Bearer ghu_'+'x'.repeat(40));return Response.json({id:githubID,login:githubID===36136585?'XiminHu66':'attacker',type:'User'});
};
function req(path,{body,cookie,source=origin,method,auth,form}={}){return new Request(origin+path,{method:method||(body||form?'POST':'GET'),headers:{'CF-Connecting-IP':'192.0.2.'+serial,...(source?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:JSON.stringify(body)}:form?{body:new URLSearchParams(form).toString()}:{} )});}
const route=(path,options)=>githubLoginRoute(req(path,options),env,{exchange:integratedRoute,fetch:github});
let serial=1;const context=remember=>({channel:(serial++).toString(16).padStart(64,'0'),remember});
async function register(ctx){const r=await route('/media-vault-login/connect',{body:ctx,source:SITE_ORIGIN});assert.ok([200,201].includes(r.status));return ctx;}
async function begin(ctx){const r=await route('/media-vault-login/start',{body:ctx});assert.equal(r.status,200);const d=await r.json();return {data:d,cookie:r.headers.get('Set-Cookie')?.split(';')[0],url:d.authorize_url?new URL(d.authorize_url):null,header:r.headers.get('Set-Cookie')};}
async function setup(ctx){
 const r=await route('/media-vault-login/setup/start',{form:{...ctx,remember:String(ctx.remember)}});assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes(secret));const state=html.match(/apps\/new\?state=([a-f0-9]{64})/)[1];return {state,cookie:r.headers.get('Set-Cookie').split(';')[0]};
}
async function callback(ctx,{source=null,cookie,codeValue=code,state}={}){return route('/media-vault-login/callback?'+new URLSearchParams({code:codeValue,state}),{source,cookie});}
const result=ctx=>route('/media-vault-login/result',{source:SITE_ORIGIN,auth:ctx.channel});
try{
 for(const statement of (await readFile(new URL('./oauth-schema.sql',import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(statement).run();
 // Additive schema is idempotent and never touches existing account/task rows.
 for(const statement of (await readFile(new URL('./oauth-schema.sql',import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(statement).run();
 const manifest=loginManifest();assert.equal(manifest.public,false);assert.deepEqual(manifest.default_permissions,{});assert.deepEqual(manifest.default_events,[]);assert.equal(manifest.hook_attributes.active,false);assert.deepEqual(manifest.callback_urls,[origin+'/media-vault-login/callback']);
 const first=await register(context(true));assert.equal((await begin(first)).data.status,'setup_required');
 for(const source of [null,'https://evil.invalid'])assert.equal((await route('/media-vault-login/connect',{body:context(true),source})).status,403);
 assert.equal((await route('/media-vault-login/result',{source:null,auth:first.channel})).status,403);
 assert.equal((await route('/media-vault-login/result',{source:SITE_ORIGIN,auth:'bad'})).status,403);
 // Another account cannot become the bootstrap owner or install broad permissions.
 let flow=await setup(first);githubID=7;let r=await route('/media-vault-login/setup/callback?code='+code+'&state='+flow.state,{cookie:flow.cookie,source:null});assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/media-vault-login/failed');assert.equal(await DB.prepare('SELECT * FROM mv_hybrid_login_config').first(),null);
 githubID=36136585;const second=await register(context(true));flow=await setup(second);permissions={contents:'read'};await route('/media-vault-login/setup/callback?code='+code+'&state='+flow.state,{cookie:flow.cookie,source:null});assert.equal(await DB.prepare('SELECT * FROM mv_hybrid_login_config').first(),null);permissions={};
 const own=await register(context(true));flow=await setup(own);r=await route('/media-vault-login/setup/callback?code='+code+'&state='+flow.state,{cookie:flow.cookie,source:null});assert.equal(r.status,303);assert.ok(r.headers.get('Location').startsWith(origin+'/media-vault-connect/#'));const stored=await DB.prepare('SELECT cipher FROM mv_hybrid_login_config').first();for(const text of [clientID,secret,'discard-this-unused-private-key','discard-unused-webhook-secret'])assert.ok(!stored.cipher.includes(text));
 const login=await begin(own);assert.match(login.header,/HttpOnly; SameSite=Lax/);assert.equal(login.url.origin,'https://github.com');assert.equal(login.url.searchParams.get('scope'),null);assert.equal(login.url.searchParams.get('code_challenge_method'),'S256');assert.equal(login.url.searchParams.get('code_challenge').length,43);assert.ok(!login.url.href.includes(own.channel)&&!login.url.href.includes(secret));
 const before=calls.length;await callback(own,{cookie:'__Host-mv-login='+'f'.repeat(64),state:login.url.searchParams.get('state')});assert.equal(calls.length,before,'wrong browser rejected before token exchange');
 await callback(own,{cookie:login.cookie,state:'f'.repeat(64)});assert.equal(calls.length,before,'wrong state rejected before token exchange');
 r=await callback(own,{cookie:login.cookie,state:login.url.searchParams.get('state')});assert.equal(r.status,303);assert.ok(r.headers.get('Location').includes('#channel='));const parentCookie=r.headers.get('Set-Cookie').split(';')[0];assert.match(r.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict; Max-Age=2592000/);
 const count=await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first();assert.equal(count.n,1);const n=calls.length;await callback(own,{cookie:login.cookie,state:login.url.searchParams.get('state')});assert.equal(calls.length,n,'code/state replay rejected before network');assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n,1);
 assert.equal((await handle(req('/app-auth/pair',{body:{}}),env)).status,410);assert.equal((await handle(req('/app-auth/approve',{body:{code:'f'.repeat(32)},auth:env.MEDIA_OWNER_TOKEN}),env)).status,410,'old issue workflow cannot grant personal browsers');
 assert.equal((await route('/media-vault-login/complete',{body:own})).status,403);assert.equal((await route('/media-vault-login/complete',{body:own,cookie:parentCookie,source:SITE_ORIGIN})).status,403);
 r=await route('/media-vault-login/complete',{body:own,cookie:parentCookie});assert.equal(r.status,200);assert.ok(!(await r.text()).includes('token'));
 assert.equal((await route('/media-vault-login/complete',{body:own,cookie:parentCookie})).status,409,'complete cannot mint twice');assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n,2);
 assert.equal((await result(context(true))).status,202,'wrong connection proof never reveals grant');r=await result(own);assert.equal(r.status,200);const grant=await r.json();assert.match(grant.token,/^[a-f0-9]{64}$/);assert.equal(grant.status,'connected');assert.equal((await (await result(own)).json()).token,grant.token,'lost response retries return the same grant');
 const cipher=(await DB.prepare('SELECT cipher FROM mv_hybrid_login_connections WHERE digest=?').bind(await digest(own.channel)).first()).cipher;assert.ok(!cipher.includes(grant.token));
 await route('/media-vault-login/ack',{method:'POST',source:SITE_ORIGIN,auth:own.channel});assert.equal((await result(own)).status,202,'ack deletes private handoff');
 const gateway=(path,body)=>integratedRoute(req('/vault-api'+path,{source:SITE_ORIGIN,auth:grant.token,body}),env);
 assert.equal((await gateway('/session')).status,200);const devices=await (await gateway('/devices')).json();assert.equal(devices.devices.length,1);assert.equal(devices.devices[0].current,true);assert.ok(!JSON.stringify(devices).includes(grant.token));
 assert.equal((await gateway('/devices/revoke',{id:'f'.repeat(24)})).status,404);assert.equal((await gateway('/logout',{})).status,200);assert.equal((await gateway('/session')).status,403);assert.equal((await handle(req('/app-auth/session',{cookie:parentCookie}),env)).status,403,'logout revokes the parent cookie too');
 // Known configuration never grants a different account, requested scope or replay.
 for(const type of ['wrong-user','extra-scope','cancelled','expired','cancel-before-callback','provider-outage']){
  const ctx=await register(context(false)),started=await begin(ctx),state=started.url.searchParams.get('state');githubID=type==='wrong-user'?7:36136585;scope=type==='extra-scope'?'repo':'';ghFailure=type==='provider-outage';
  if(type==='expired')await DB.prepare('UPDATE mv_hybrid_login_flows SET expires_at=0 WHERE digest=?').bind(await digest(state)).run();
  if(type==='cancel-before-callback')await route('/media-vault-login/cancel',{method:'POST',source:SITE_ORIGIN,auth:ctx.channel});
  const before=(await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n;
  r=await callback(ctx,{state,cookie:started.cookie,codeValue:type==='cancelled'?'':code});assert.equal(r.status,303);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n,before,type+' cannot grant a browser');
  githubID=36136585;scope='';ghFailure=false;
 }
 console.log('PASS private GitHub login with real SQLite: owner-only zero-repository-permission bootstrap, encrypted client/handoff, cookie-bound single-use state and PKCE, exact identity, wrong-user/scope/replay/cancel/expiry/outage rejection, retry/ack, real parent/grant exchange and full-device logout; no live app or grant created');
}finally{child.stdin.end();lines.close();}
