import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {handle} from './src/index.js';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
import {configureAccountWindow} from './account-window-config.mjs';
import {NOVEL_UX_SOURCE,NOVEL_UX_LAYOUTS,novelUxWindowValid} from './src/account-novel-scope.js';
import {streamingEnabled} from './src/limits.js';
const dbProcess=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']}),responses=new Map();let seq=0;
const lines=createInterface({input:dbProcess.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=responses.get(r.id);responses.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
const sql=(ops,batch=false)=>new Promise((resolve,reject)=>{const id=++seq;responses.set(id,{resolve,reject});dbProcess.stdin.write(JSON.stringify({id,ops,batch})+'\n');});
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,batch:ops=>sql(ops,true)},origin='https://journey.invalid';
const env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'false',MEDIA_APP_ACCOUNT_ID:'submit-test-'+'b'.repeat(32),MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64)};
const relay=new MediaRelay(relayContext(null),env);env.RELAY={idFromName:()=>'',get:()=>({fetch:url=>relay.fetch(new Request(url))})};
async function request(path,{body,cookie,token,environment=env}={}){return handle(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),environment);}

const base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
Object.assign(env,configureAccountWindow(base,'account-novel-on',Date.now()-1000).vars);
async function pair(){const r=await request('/app-auth/pair',{body:{}});assert.equal(r.status,201);return {...await r.json(),cookie:r.headers.get('Set-Cookie').split(';')[0]};}
const approve=p=>request('/app-auth/approve',{body:{code:p.pair_code},token:env.MEDIA_OWNER_TOKEN});
let key=0;const spec=(layout='compact')=>({kind:'novel',url:NOVEL_UX_SOURCE,indices:[0,1],text_only:true,layout:NOVEL_UX_LAYOUTS[layout]});
const submit=(p,body)=>request('/app-api/jobs',{cookie:p.cookie,body:{...body,request_key:(++key).toString(16).padStart(32,'0')}});
try{
 assert.ok(novelUxWindowValid(env));assert.equal(streamingEnabled({...env,ENABLE_DIRECT_STREAM:'true'}),false);
 for(const operation of ['account-novel-off','account-rc-off']){const v=configureAccountWindow(base,operation).vars;assert.equal(v.ENABLE_APP_ACCESS,'false');assert.equal(v.MEDIA_APP_NOVEL_TEST_UNTIL,'0');}
 const a=await pair(),b=await pair();assert.equal((await approve(a)).status,200);assert.equal((await approve(b)).status,409);
 let state=await (await request('/app-auth/session',{cookie:a.cookie})).json();assert.equal(state.scope,'novel-ux-no-transfer');assert.equal(state.job_limit,4);assert.equal(state.ticket_limit,0);assert.equal(state.can_submit,true);assert.equal(state.can_download,false);assert.equal(state.novel_scope.url,NOVEL_UX_SOURCE);
 assert.match(await (await request('/app/')).text(),/30 分钟小说操作验收/);
 assert.equal((await request('/app-api/novel/catalog?url=https://www.wenku8.net/book/1.htm',{cookie:a.cookie})).status,403);
 const originalFetch=globalThis.fetch;let catalogCalls=0;
 try{globalThis.fetch=async(url,opts)=>{catalogCalls++;assert.equal(new URL(url).hostname,'pt-universe-api.summer07-nanjolno.workers.dev');assert.equal(new URL(url).searchParams.get('url'),NOVEL_UX_SOURCE);assert.equal(opts.redirect,'manual');return new Response(JSON.stringify({title:'fixture',chapters:[{title:'one',url:'private'},{title:'two',url:'private'}]}));};
 const catalog=await request('/app-api/novel/catalog?'+new URLSearchParams({url:NOVEL_UX_SOURCE}),{cookie:a.cookie});assert.equal(catalog.status,200);assert.deepEqual((await catalog.json()).chapters,[{index:0,title:'one'},{index:1,title:'two'}]);assert.equal(catalogCalls,1);
 globalThis.fetch=async()=>new Response('private upstream text',{status:500});
 const upstream=await request('/app-api/novel/catalog?'+new URLSearchParams({url:NOVEL_UX_SOURCE}),{cookie:a.cookie});assert.equal(upstream.status,503);assert.deepEqual(await upstream.json(),{error:'Catalog unavailable; verify source access and retry later',code:'catalog_upstream_http'});
 globalThis.fetch=async()=>new Response('<html>unexpected</html>');
 const malformed=await request('/app-api/novel/catalog?'+new URLSearchParams({url:NOVEL_UX_SOURCE}),{cookie:a.cookie});assert.equal(malformed.status,503);assert.equal((await malformed.json()).code,'catalog_invalid_response');
 }finally{globalThis.fetch=originalFetch;}
 for(const bad of [{...spec(),url:'https://www.wenku8.net/book/1.htm'},{...spec(),indices:[2]},{...spec(),indices:[]},{...spec(),text_only:false},{...spec(),layout:{...NOVEL_UX_LAYOUTS.compact,fontScale:110}},{kind:'video',url:'https://example.com/v.mp4'}])assert.ok((await submit(a,bad)).status>=400);
 const first=await submit(a,spec());assert.equal(first.status,202);const firstId=(await first.json()).id;
 assert.equal((await request('/app-api/jobs/cancel',{cookie:a.cookie,body:{id:firstId}})).status,200);
 const rebuilt=await submit(a,{retry_of:firstId,url:'https://untrusted.invalid',indices:[9],layout:NOVEL_UX_LAYOUTS.large});assert.equal(rebuilt.status,202);const rebuiltId=(await rebuilt.json()).id;
 assert.deepEqual(JSON.parse((await DB.prepare('SELECT request_json FROM mv_hybrid_jobs WHERE id=?').bind(rebuiltId).first()).request_json),spec(),'rebuild clones server request, ignoring editable inputs');
 await request('/app-auth/logout',{cookie:a.cookie,body:{}});const c=await pair();assert.equal((await approve(c)).status,200);state=await (await request('/app-auth/session',{cookie:c.cookie})).json();assert.equal(state.jobs_remaining,2,'replacement session cannot reset account cap');
 const results=await Promise.all(['standard','large','compact','standard','large'].map(layout=>submit(c,spec(layout))));assert.equal(results.filter(r=>r.status===202).length,2);assert.equal(results.filter(r=>r.status===429).length,3);
 const rows=(await DB.prepare("SELECT request_json FROM mv_hybrid_jobs WHERE status='queued' ORDER BY created_at,id").all()).results;const scales=rows.map(r=>JSON.parse(r.request_json).layout);const accepted=['standard','large','compact','standard','large'].filter((_,i)=>results[i].status===202).map(name=>NOVEL_UX_LAYOUTS[name]);assert.deepEqual(scales.map(x=>JSON.stringify(x)).sort(),[NOVEL_UX_LAYOUTS.compact,...accepted].map(x=>JSON.stringify(x)).sort(),'stored recipes match the actual winners of the concurrent cap race');
 for(let i=0;i<3;i++){
  const leased=await (await request('/agent/lease',{body:{},token:env.MEDIA_AGENT_TOKEN})).json();assert.ok(leased.job);assert.equal(leased.job.skip_images,true);assert.deepEqual(leased.job.indices,[0,1]);
  if(process.env.MEDIA_ADAPTER_SOURCE){const r=spawnSync('python3',[new URL('./test-account-packager.py',import.meta.url).pathname,process.env.MEDIA_ADAPTER_SOURCE],{input:JSON.stringify(leased.job),encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).layout,leased.job.layout);}
 }
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_account_jobs WHERE account_id=?').bind(env.MEDIA_APP_ACCOUNT_ID).first()).n,4);
 state=await (await request('/app-auth/session',{cookie:c.cookie})).json();assert.equal(state.jobs_remaining,0);assert.equal(state.tickets_remaining,0);
 assert.equal((await request('/app-api/download-ticket',{cookie:c.cookie,body:{id:rebuiltId,path:'generated/test.epub'}})).status,403);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_tickets').first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_transfer_usage').first()).n,0);
 for(const patch of [{ENABLE_DIRECT_STREAM:'true'},{MEDIA_APP_NOVEL_TEST_UNTIL:String(Number(env.MEDIA_APP_NOVEL_TEST_START)+1800001)},{MEDIA_APP_NOVEL_TEST_START:String(Date.now()+5000)},{MEDIA_APP_LOGIN_TEST_UNTIL:'1'},{MEDIA_APP_FILE_TEST_FILES:'[]'}])assert.equal((await request('/app-auth/session',{cookie:c.cookie,environment:{...env,...patch}})).status,404);
 const clock=Date.now;try{Date.now=()=>Number(env.MEDIA_APP_NOVEL_TEST_UNTIL);assert.equal((await request('/app-auth/session',{cookie:c.cookie})).status,404);assert.equal((await request('/app/')).status,404);}finally{Date.now=clock;}
 console.log('PASS real SQLite novel UX window: fixed catalog, first two chapters, text-only presets, canonical cancel/rebuild, one device, atomic four-job account cap across replacement, zero tickets/ledger/stream and fail-closed expiry');
}finally{dbProcess.stdin.end();lines.close();}
