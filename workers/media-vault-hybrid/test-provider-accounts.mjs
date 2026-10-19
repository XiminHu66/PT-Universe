import assert from 'node:assert/strict';
import {canonicalJob} from './src/job-contract.js';
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
const origin='https://account.invalid',env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',MEDIA_APP_ACCOUNT_ID:'personal-test',MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64),ENABLE_DIRECT_STREAM:'true',RELAY:{idFromName(){return 'relay';},get(){return {fetch:async url=>new Response(null,{status:url.endsWith('/ticket-permit')?204:503})};}}};
async function request(path,{body,cookie,token,environment=env,source=origin,method}={}){return handle(new Request(origin+path,{method:method||(body?'POST':'GET'),headers:{...(source?{Origin:source}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),environment);}
async function browser(){const r=await request('/app-auth/pair',{body:{}});assert.equal(r.status,201);const data=await r.json(),cookie=r.headers.get('Set-Cookie').split(';')[0];return {...data,cookie,header:r.headers.get('Set-Cookie')};}
const approve=b=>request('/app-auth/approve',{body:{code:b.pair_code},token:env.MEDIA_OWNER_TOKEN});
const counter=()=>DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_jobs').first();
const usage=async()=>Number((await DB.prepare('SELECT reserved_bytes FROM mv_hybrid_transfer_usage').first())?.reserved_bytes||0);
const job=(key='1'.repeat(32))=>({kind:'video',url:'https://example.com/owned.mp4',request_key:key});

env.MEDIA_APP_TEST_MODE='personal';env.ENABLE_DIRECT_STREAM='false';
try{
 const a=await browser();assert.equal((await approve(a)).status,200);
 const session=await (await request('/app-auth/session',{cookie:a.cookie})).json();
 assert.equal(session.scope,'personal-vps-downloads');assert.equal(session.jobs_remaining,200);assert.equal(session.can_download,false);
 const token='fixture-PAT-'+ 't'.repeat(32),spec={kind:'pikpak-account',label:'我的账号',token,request_key:'1'.repeat(32)};
 const submitted=await request('/app-api/jobs',{cookie:a.cookie,body:spec});assert.equal(submitted.status,202);const id=(await submitted.json()).id;
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:spec})).status,200,'retry reuses exact registration');
 const row=await DB.prepare('SELECT * FROM mv_hybrid_jobs WHERE id=?').bind(id).first();
 assert.ok(!row.request_json.includes(token));const saved=JSON.parse(row.request_json);assert.equal(saved.vault_scope,env.MEDIA_APP_ACCOUNT_ID);assert.ok(saved.token_cipher);assert.equal(saved.token,undefined);
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('media-vault-pikpak-v1:'+env.MEDIA_AGENT_TOKEN)),{name:'AES-GCM'},false,['decrypt']);
 const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(saved.token_cipher.iv),additionalData:new TextEncoder().encode(saved.vault_scope+'/'+id)},key,decode(saved.token_cipher.data))),token);
 await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',iv:decode(saved.token_cipher.iv),additionalData:new TextEncoder().encode('wrong-scope/'+id)},key,decode(saved.token_cipher.data)));
 const listed=await (await request('/app-api/jobs',{cookie:a.cookie})).json();assert.ok(!JSON.stringify(listed).includes(token));assert.ok(!JSON.stringify(listed).includes(saved.token_cipher.data));
 const lease=await (await request('/agent/lease',{body:{},token:env.MEDIA_AGENT_TOKEN})).json();assert.equal(lease.job.id,id);assert.equal(lease.job.token,undefined);
 const report=await request('/agent/report',{token:env.MEDIA_AGENT_TOKEN,body:{id,status:'complete',files:[],title:JSON.stringify({id,label:spec.label,ready:true})}});assert.equal(report.status,200);
 assert.equal(JSON.parse((await DB.prepare('SELECT request_json FROM mv_hybrid_jobs WHERE id=?').bind(id).first()).request_json).token_cipher,undefined,'terminal registration clears transport cipher from D1');
 const profiles=await (await request('/app-api/pikpak/accounts',{cookie:a.cookie})).json();assert.deepEqual(profiles.accounts,[{id,label:spec.label,ready:true}]);
 const download={kind:'pikpak',url:'https://example.org/authorized.mp4',profile_id:id,cleanup_after_download:true,request_key:'2'.repeat(32),vault_scope:'injected-owner'};
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:download})).status,202);
 const second=await DB.prepare("SELECT request_json FROM mv_hybrid_jobs WHERE kind='pikpak'").first();assert.equal(JSON.parse(second.request_json).vault_scope,env.MEDIA_APP_ACCOUNT_ID);
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:{...download,profile_id:'f'.repeat(24),request_key:'3'.repeat(32)}})).status,403,'cross-account or unknown profile denied');
 assert.equal((await request('/app-api/pikpak/accounts',{cookie:a.cookie,environment:{...env,MEDIA_APP_TEST_MODE:undefined}})).status,403,'provider operations never enter old test scopes');
 assert.equal(canonicalJob({kind:'torrent',url:'magnet:?xt=urn:btih:'+'A'.repeat(32)}).kind,'torrent','valid base32 magnets supported');
 assert.equal(canonicalJob({...download,cleanup_after_download:false}),null);
 // Plain provider tokens never enter retry storage; only the request hash/key.
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const client=createAccountConnection({origin,storage,channel:null,fetch:async(url,o)=>url.endsWith('/app-auth/session')?new Response(JSON.stringify(session)):new Response(JSON.stringify({id})),setTimeout:()=>0,clearTimeout(){}});
 await client.submit({kind:spec.kind,label:spec.label,token});assert.ok(!JSON.stringify([...data]).includes(token));

 const full={kind:'pikpak-account',auth_type:'rclone',label:'完整账号',username:'fixture@example.org',password:'fixture-secret-not-real',store_credentials:true,request_key:'4'.repeat(32)};
 assert.equal(canonicalJob({...full,store_credentials:false}),null);
 const fullResponse=await request('/app-api/jobs',{cookie:a.cookie,body:full});assert.equal(fullResponse.status,202);const fullId=(await fullResponse.json()).id;
 const fullRow=await DB.prepare('SELECT * FROM mv_hybrid_jobs WHERE id=?').bind(fullId).first();assert.ok(!fullRow.request_json.includes(full.password));assert.ok(!fullRow.request_json.includes(full.username));
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='running' WHERE id=?").bind(fullId).run();
 assert.equal((await request('/agent/report',{token:env.MEDIA_AGENT_TOKEN,body:{id:fullId,status:'complete',files:[],title:JSON.stringify({id:fullId,label:full.label,ready:true,auth_type:'rclone'})}})).status,200);
 assert.equal(JSON.parse((await DB.prepare('SELECT request_json FROM mv_hybrid_jobs WHERE id=?').bind(fullId).first()).request_json).token_cipher,undefined);
 const sourceResponse=await request('/app-api/jobs',{cookie:a.cookie,body:{...download,profile_id:fullId,request_key:'5'.repeat(32)}});assert.equal(sourceResponse.status,202);const sourceId=(await sourceResponse.json()).id;
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='running' WHERE id=?").bind(sourceId).run();
 const cloudFile='fixture-cloud-file',receipt={cleanup:'awaiting-confirmation',file_id:cloudFile,name:'完整视频.mp4',bytes:19};
 assert.equal((await request('/agent/report',{token:env.MEDIA_AGENT_TOKEN,body:{id:sourceId,status:'complete',files:[{path:'generated/'+sourceId+'.mp4',name:sourceId+'.mp4',size:19}],title:JSON.stringify(receipt)}})).status,200);
 const clean={kind:'pikpak-cleanup',source_job:sourceId,profile_id:fullId,file_id:cloudFile,confirm_permanent:true,request_key:'6'.repeat(32)};
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:{...clean,file_id:'wrong'}})).status,409);
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:{...clean,profile_id:id}})).status,403);
 assert.equal((await request('/app-api/jobs',{cookie:a.cookie,body:{...clean,confirm_permanent:false}})).status,400);
 const cleanResponse=await request('/app-api/jobs',{cookie:a.cookie,body:clean});assert.equal(cleanResponse.status,202);const cleanId=(await cleanResponse.json()).id;
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='running' WHERE id=?").bind(cleanId).run();
 assert.equal((await request('/agent/report',{token:env.MEDIA_AGENT_TOKEN,body:{id:cleanId,status:'complete',files:[],title:JSON.stringify({cleanup:'purged-quota-pending',source_job:sourceId,file_id:cloudFile})}})).status,200);
 const afterJobs=await (await request('/app-api/jobs',{cookie:a.cookie})).json();const sourceAfter=afterJobs.jobs.find(j=>j.id===sourceId);assert.equal(sourceAfter.cleanup_target,null);assert.equal(sourceAfter.cleanup_status,'purged-quota-pending');
 const cancelReg=await request('/app-api/jobs',{cookie:a.cookie,body:{...full,request_key:'7'.repeat(32)}});assert.equal(cancelReg.status,202);const cancelId=(await cancelReg.json()).id;
 assert.equal((await request('/app-api/jobs/cancel',{cookie:a.cookie,body:{id:cancelId}})).status,200);assert.equal(JSON.parse((await DB.prepare('SELECT request_json FROM mv_hybrid_jobs WHERE id=?').bind(cancelId).first()).request_json).token_cipher,undefined);
 await client.submit(full);assert.ok(!JSON.stringify([...data]).includes(full.password));
 client.dispose();
 console.log('PASS real SQLite personal provider scope: encrypted PAT, public redaction, idempotency, account-owned profiles, control-only empty-file completion, base32 magnets and credential-free retry storage; stream remains OFF');
}finally{child.stdin.end();lines.close()}
