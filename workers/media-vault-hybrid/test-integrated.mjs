import assert from 'node:assert/strict';
import {MEDIA_ORIGIN} from './src/integrated.js';
import {createAccountConnection} from '../../apps/media-vault/account-session.js';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {handle} from './src/index.js';
import {configureAccountWindow} from './account-window-config.mjs';
import {issueFileTicket} from './src/transport.js';
import {APP_LIFETIME,APP_COOKIE} from './src/account-auth.js';
import {digest} from './src/session-auth.js';
import {readFile} from 'node:fs/promises';
const defaults=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
assert.equal(defaults.vars.ENABLE_APP_ACCESS,'false');assert.equal(defaults.vars.ENABLE_APP_SUBMISSION,'false');assert.equal(defaults.vars.ENABLE_DIRECT_STREAM,'false');
const child=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let sequence=0,failAt,beforeBatch,beforeRun,beforeFirst;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
function sql(ops,batch=false,fail_at){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops,batch,fail_at})+'\n');});}
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){if(beforeRun)await beforeRun(this);return (await sql([this]))[0];},async first(){if(beforeFirst)await beforeFirst(this);return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,async batch(ops){if(beforeBatch)await beforeBatch(ops);return sql(ops,true,failAt);}};
const origin='https://account.invalid',env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',MEDIA_APP_ACCOUNT_ID:'personal-test',MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64),ENABLE_DIRECT_STREAM:'true',RELAY:{idFromName(){return 'relay';},get(){return {fetch:async url=>new Response(null,{status:(url.endsWith('/ticket-permit')||url.endsWith('/agent-ready'))?204:503})};}}};
async function request(path,{body,cookie,token,environment=env,source=origin,method}={}){return handle(new Request(origin+path,{method:method||(body?'POST':'GET'),headers:{...(source?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),environment);}
async function browser(){const r=await request('/app-auth/pair',{body:{}});assert.equal(r.status,201);const data=await r.json(),cookie=r.headers.get('Set-Cookie').split(';')[0];return {...data,cookie,header:r.headers.get('Set-Cookie')};}
const approve=b=>request('/app-auth/approve',{body:{code:b.pair_code},token:env.MEDIA_OWNER_TOKEN});
const counter=()=>DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_jobs').first();
const usage=async()=>Number((await DB.prepare('SELECT reserved_bytes FROM mv_hybrid_transfer_usage').first())?.reserved_bytes||0);
const job=(key='1'.repeat(32))=>({kind:'video',url:'https://example.com/owned.mp4',request_key:key});

env.MEDIA_APP_TEST_MODE='personal';
try{
 const a=await browser();assert.equal((await approve(a)).status,200);
 assert.equal((await request('/app-auth/media-vault-connect',{cookie:a.cookie,body:{remember:true},source:MEDIA_ORIGIN})).status,403);
 assert.equal((await request('/app-auth/media-vault-connect',{body:{remember:true}})).status,403);
 const grantResponse=await request('/app-auth/media-vault-connect',{cookie:a.cookie,body:{remember:true}});assert.equal(grantResponse.status,200);
 const grant=await grantResponse.json();assert.match(grant.token,/^[a-f0-9]{64}$/);assert.ok(grant.expires_at>Date.now()+29*86400000);
 const row=await DB.prepare('SELECT * FROM mv_hybrid_app_sessions WHERE id=?').bind(grant.session_id).first();assert.equal(row.digest,await digest(grant.token));assert.equal(row.pair_code,'vault:'+a.session_id);
 const gateway=(path,options={})=>request('/vault-api'+path,{token:grant.token,source:MEDIA_ORIGIN,...options});
 const sessionResponse=await gateway('/session');assert.equal(sessionResponse.status,200);assert.equal(sessionResponse.headers.get('Access-Control-Allow-Origin'),MEDIA_ORIGIN);assert.equal(sessionResponse.headers.get('Access-Control-Allow-Credentials'),null);assert.equal(sessionResponse.headers.get('Set-Cookie'),null);
 const session=await sessionResponse.json();assert.equal(session.can_download,true);assert.equal(session.scope,'personal-vps-downloads');
 for(const source of [null,'https://evil.invalid'])assert.equal((await gateway('/session',{source})).status,403);
 for(const token of [env.MEDIA_OWNER_TOKEN,env.MEDIA_AGENT_TOKEN,'f'.repeat(64),'bad'])assert.equal((await gateway('/session',{token})).status,403);
 assert.equal((await gateway('/app-auth/approve',{body:{}})).status,404);assert.equal((await gateway('/agent/lease',{body:{}})).status,404);
 assert.equal((await gateway('/jobs',{environment:{...env,MEDIA_APP_TEST_MODE:'submission'}})).status,403);
 const preflight=await gateway('/jobs',{method:'OPTIONS',token:undefined});assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);
 const submit=await gateway('/jobs',{body:job()});assert.equal(submit.status,202);const id=(await submit.json()).id;
 assert.equal((await gateway('/jobs',{body:job()})).status,200,'exact retry deduplicates');
 assert.equal((await (await gateway('/jobs')).json()).jobs.length,1);
 assert.equal((await gateway('/jobs/files?id='+'e'.repeat(24))).status,404,'other account files unavailable');
 assert.equal((await request('/jobs',{token:grant.token})).status,401,'device token is never Owner');
 const path='video/fixture.mp4',bytes=17*1024*1024;
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='complete' WHERE id=?").bind(id).run();
 await DB.prepare('INSERT INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,?)').bind(id,path,'fixture.mp4',bytes).run();
 const ticket=await gateway('/download-ticket',{body:{id,path}});assert.equal(ticket.status,200,'normal delivery exceeds old 10 MiB test cap');
 assert.equal(await usage(),bytes);
 const rotatedResponse=await request('/app-auth/media-vault-connect',{cookie:a.cookie,body:{remember:false}});assert.equal(rotatedResponse.status,200);const rotated=await rotatedResponse.json();
 assert.equal((await gateway('/session')).status,403,'old device connection replaced');assert.equal(await usage(),0,'rotation releases unclaimed reservation');
 const renewed=await (await gateway('/session',{token:rotated.token})).json();assert.equal(renewed.jobs_remaining,199);assert.equal(renewed.tickets_remaining,99,'rotation preserves usage counters');assert.ok(rotated.expires_at<=Date.now()+86400000);
 const again=await gateway('/download-ticket',{body:{id,path},token:rotated.token});assert.equal(again.status,200);
 failAt=1;assert.equal((await request('/app-auth/logout',{cookie:a.cookie,body:{}})).status,503);failAt=undefined;assert.equal((await gateway('/session',{token:rotated.token})).status,200,'failed revocation rolls back both grants');assert.equal(await usage(),bytes);
 assert.equal((await request('/app-auth/logout',{cookie:a.cookie,body:{}})).status,200);assert.equal((await gateway('/session',{token:rotated.token})).status,403);assert.equal(await usage(),0,'parent logout revokes child tickets');
 assert.equal((await request('/download?ticket='+(await again.json()).ticket)).status,403);
 const config=configureAccountWindow(defaults,'account-personal-downloads-on');assert.equal(config.vars.ENABLE_DIRECT_STREAM,'true');assert.equal(config.vars.MEDIA_STREAM_TEST_UNTIL,undefined);assert.equal(config.vars.MEDIA_APP_ACCOUNT_ID,'media-vault-personal');
 console.log('PASS integrated device grant: one-time approved cookie exchange, 30-day remember, strict Origin/CORS, role separation, account ownership, submission idempotency, normal >10MiB ticket, usage-preserving rotation, parent revocation and reservation release');
}finally{child.stdin.end();lines.close();}
