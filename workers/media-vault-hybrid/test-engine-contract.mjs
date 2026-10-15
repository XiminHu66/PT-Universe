import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {handle} from './src/index.js';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
import {createAccountConnection} from '../../apps/media-vault/account-session.js';
import {formSpec,chapterIndices,progressText} from '../../apps/media-vault/account-form.js';
const dbProcess=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']}),responses=new Map();let seq=0;
const lines=createInterface({input:dbProcess.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=responses.get(r.id);responses.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
const sql=(ops,batch=false)=>new Promise((resolve,reject)=>{const id=++seq;responses.set(id,{resolve,reject});dbProcess.stdin.write(JSON.stringify({id,ops,batch})+'\n');});
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,batch:ops=>sql(ops,true)},origin='https://journey.invalid';
const env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'false',MEDIA_APP_ACCOUNT_ID:'journey',MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64)};
const relay=new MediaRelay(relayContext(null),env);env.RELAY={idFromName:()=>'',get:()=>({fetch:url=>relay.fetch(new Request(url))})};
async function request(path,{body,cookie,token,environment=env}={}){return handle(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),environment);}
const adapter=process.env.MEDIA_ADAPTER_SOURCE,agent=process.env.MEDIA_AGENT_SOURCE;
assert.ok(adapter&&agent,'Both companion source directories are required; no silent integration skip');
const token=env.MEDIA_OWNER_TOKEN,agentToken=env.MEDIA_AGENT_TOKEN;
const memory={data:null,getItem(){return this.data;},setItem(k,v){this.data=v;},removeItem(){this.data=null;}};
let cookie='';const options={origin,storage:memory,setTimeout:()=>1,clearTimeout(){},fetch:async(url,o)=>{const u=new URL(url),r=await request(u.pathname+u.search,{body:o.body?JSON.parse(o.body):undefined,cookie});if(r.headers.has('Set-Cookie'))cookie=r.headers.get('Set-Cookie').split(';')[0];return r;}};
const lease=async()=>{const r=await request('/agent/lease',{body:{},token:agentToken});assert.equal(r.status,200);return (await r.json()).job;};
function execute(jobs,cancelled=[]){const r=spawnSync('python3',[new URL('./test-engine-contract.py',import.meta.url).pathname,adapter,agent],{input:JSON.stringify({jobs,cancelled}),encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
async function apply(result){for(const report of result.reports){const r=await request('/agent/report',{body:report,token:agentToken});assert.equal(r.status,200);}assert.equal(result.restart_stable,true);}
const client=createAccountConnection(options);
try{
 const p=await client.pair();assert.equal((await request('/app-auth/approve',{body:{code:p.pair_code},token})).status,200);
 const compact=formSpec({kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:'1-2',textOnly:true,layout:'compact'});
 const owner=await request('/jobs',{token,body:{...compact,text_only:undefined,skip_images:true,request_id:'f'.repeat(24),headers:{test:'must drop'},account_id:'must drop'}});assert.equal(owner.status,202);
 const recipes=[compact,formSpec({kind:'manga',title:'授权图片 fixture',pages:'File:One.png\nFile:Two.png'}),formSpec({kind:'video',url:'https://fixture.invalid/source.mp4'}),formSpec({kind:'torrent',url:'https://fixture.invalid/payload.txt'})];
 const ids=[];for(const spec of recipes)ids.push((await client.submit(spec)).id);
 const jobs=[];for(let i=0;i<5;i++)jobs.push(await lease());assert.ok(jobs.every(Boolean));assert.equal(await lease(),null);
 assert.ok(jobs.every(j=>!j.headers&&!j.request_id&&!j.account_id));assert.ok(jobs.some(j=>j.skip_images===true));
 const result=execute(jobs);await apply(result);assert.equal(result.submissions,5);
 let tasks=await client.read('/jobs');assert.equal(tasks.jobs.length,4);assert.ok(tasks.jobs.every(j=>j.status==='complete'),'all four account kinds completed through the real Agent/adapter contract');
 for(const id of ids){const files=(await client.read('/jobs/files?id='+id)).files;assert.ok(files.length);assert.ok(files.every(f=>f.size>0));}
 const cancelled=await client.submit({...compact,indices:[0]}),cancelLease=await lease();assert.equal(cancelLease.id,cancelled.id);await client.read('/jobs/cancel',{id:cancelled.id});
 await client.logout();const newPair=await client.pair();assert.equal((await request('/app-auth/approve',{body:{code:newPair.pair_code},token})).status,200);
 const rebuilt=await client.submit({retry_of:cancelled.id,url:'https://ignored.invalid',indices:[9]}),rebuildLease=await lease();assert.equal(rebuildLease.id,rebuilt.id);assert.deepEqual(rebuildLease.indices,[0]);assert.equal(rebuildLease.url,compact.url);
 const recovery=execute([cancelLease,rebuildLease],[cancelled.id]);await apply(recovery);assert.deepEqual(recovery.cancelled,[cancelled.id]);
 tasks=await client.read('/jobs');assert.equal(tasks.jobs.find(j=>j.id===cancelled.id).status,'cancelled');assert.equal(tasks.jobs.find(j=>j.id===rebuilt.id).status,'complete');
 assert.equal((await client.read('/jobs/files?id='+cancelled.id)).files.length,0);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_tickets').first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_transfer_usage').first()).n,0);
 await client.logout();assert.equal((await request('/app-auth/session',{cookie})).status,403);
 console.log('PASS OFF integration: actual cookie/form -> Worker/SQLite -> Agent polling -> adapter/EPUB/CBZ/files -> report -> account visibility; canonical Owner input, cancellation, rebuild, restart, logout, zero tickets/ledger; source and engine I/O are offline fixtures');
}finally{client.dispose();dbProcess.stdin.end();lines.close();}
