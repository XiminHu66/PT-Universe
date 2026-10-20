import {chapterIndices,formSpec} from '../../apps/media-vault/account-form.js';
import {canonicalJob,MAX_NOVEL_CHAPTERS,MAX_JOB_BODY} from './src/job-contract.js';
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
 const response=await request('/app-auth/media-vault-connect',{cookie:a.cookie,body:{remember:true}});assert.equal(response.status,200);const grant=await response.json();
 const gateway=(path,options={})=>request('/vault-api'+path,{token:grant.token,source:MEDIA_ORIGIN,...options});
 const spec={...formSpec({kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:'1-10000',textOnly:true,layout:'compact'}),layout:{fontScale:100,lineHeight:1.5,paragraphGap:.5,indent:0,pageMargin:.8,titleAlign:'left',textAlign:'justify'}};
 assert.equal(MAX_NOVEL_CHAPTERS,10000);assert.equal(spec.indices.length,10000);assert.ok(JSON.stringify(spec).length>12000);assert.deepEqual(canonicalJob(spec).layout,spec.layout);
 for(const input of ['1-10001','1-10000,10001'])assert.throws(()=>chapterIndices(input));
 const created=await gateway('/jobs',{body:{...spec,request_key:'0123456789abcdef'.repeat(2),resume_from:'f'.repeat(24)}});assert.equal(created.status,202);const id=(await created.json()).id;
 let lease=(await (await request('/agent/lease',{body:{},token:env.MEDIA_AGENT_TOKEN})).json()).job;assert.equal(lease.id,id);assert.deepEqual(lease.indices,spec.indices);assert.equal(lease.layout.textAlign,'justify');assert.equal(lease.resume_from,undefined,'Client cannot select another task checkpoint');
 assert.equal((await gateway('/jobs/cancel',{body:{id}})).status,200);
 const retry=await gateway('/jobs',{body:{retry_of:id,url:'https://ignored.invalid',indices:[9],request_key:'fedcba9876543210'.repeat(2)}});assert.equal(retry.status,202);const retryID=(await retry.json()).id;
 lease=(await (await request('/agent/lease',{body:{},token:env.MEDIA_AGENT_TOKEN})).json()).job;assert.equal(lease.id,retryID);assert.deepEqual(lease.indices,spec.indices);assert.equal(lease.url,spec.url);assert.equal(lease.resume_from,id);
 assert.equal((await gateway('/jobs/cancel',{body:{id:retryID}})).status,200);
 assert.equal((await gateway('/jobs',{body:{retry_of:'f'.repeat(24),request_key:'c'.repeat(32)}})).status,404);
 assert.equal((await gateway('/jobs',{environment:{...env,MEDIA_APP_ACCOUNT_ID:'different-account'},body:{retry_of:id,request_key:'d'.repeat(32)}})).status,403);
 const owner=await request('/jobs',{token:env.MEDIA_OWNER_TOKEN,body:spec});assert.equal(owner.status,202);const ownerID=(await owner.json()).id;assert.equal((await request('/jobs/cancel',{token:env.MEDIA_OWNER_TOKEN,body:{id:ownerID}})).status,200);
 for(const bad of [{...spec,indices:Array.from({length:10001},(_,i)=>i)},{...spec,indices:[0,0]},{...spec,layout:{titleAlign:'right'}},{...spec,padding:'x'.repeat(MAX_JOB_BODY)}])assert.equal((await gateway('/jobs',{body:{...bad,request_key:'b'.repeat(32)}})).status,400);
 assert.equal((await gateway('/jobs/cancel',{body:{id,padding:'x'.repeat(12001)}})).status,400,'Non-job body limits remain narrow');
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_jobs').first()).n,3,'Rejected selections never create jobs');
 console.log('PASS 10,000-chapter actual SQLite/device/Owner API: large JSON admission, full lease, seven layout fields, authorized checkpoint retry, client/cross-account checkpoint rejection, oversized/duplicate/invalid-layout rejection');
}finally{child.stdin.end();lines.close();}
