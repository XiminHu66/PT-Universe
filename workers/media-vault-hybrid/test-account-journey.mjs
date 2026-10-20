import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {handle} from './src/index.js';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
import {novelCatalog} from './src/account-catalog.js';
import {PILOT_PRESETS} from './src/account-pilot.js';
import {configureAccountWindow} from './account-window-config.mjs';
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
const token=env.MEDIA_OWNER_TOKEN,agentToken=env.MEDIA_AGENT_TOKEN;
const memory={data:null,getItem(){return this.data;},setItem(k,v){this.data=v;},removeItem(){this.data=null;}};
let cookie='';const clientOptions={origin,storage:memory,setTimeout:()=>1,clearTimeout(){},fetch:async(url,o)=>{const r=await request(new URL(url).pathname+new URL(url).search,{body:o.body?JSON.parse(o.body):undefined,cookie});if(r.headers.has('Set-Cookie'))cookie=r.headers.get('Set-Cookie').split(';')[0];return r;}};
try{
 const client=createAccountConnection(clientOptions),pending=await client.pair();assert.equal((await request('/app-auth/approve',{body:{code:pending.pair_code},token})).status,200);
 const spec=formSpec({kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:'1-2',textOnly:true,layout:'compact'});
 const submitted=await client.submit(spec),leased=(await (await request('/agent/lease',{body:{},token:agentToken})).json()).job;
 assert.equal(leased.id,submitted.id);assert.equal(leased.skip_images,true);assert.equal(leased.layout.indent,2);assert.equal(leased.layout.paragraphGap,0);
 assert.deepEqual(chapterIndices('1-3,2,5'),[0,1,2,4]);for(const bad of ['', '0','5-1','1-10001','1-10000,10001'])assert.throws(()=>chapterIndices(bad));
 // A companion checkout allows the exact leased payload to execute through
 // the actual adapter/content packager, with source HTTP replaced by fixtures.
 let files=[{path:'generated/'+leased.id+'.epub',name:leased.id+'.epub',size:2048}];
 if(process.env.MEDIA_ADAPTER_SOURCE){
  const r=spawnSync('python3',[new URL('./test-account-packager.py',import.meta.url).pathname,process.env.MEDIA_ADAPTER_SOURCE],{input:JSON.stringify(leased),encoding:'utf8'});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.status,'complete');assert.equal(result.text_only,true);assert.equal(result.compact_layout,true);files=result.files;
 }
 let r=await request('/agent/report',{body:{id:leased.id,status:'running',completed:1,total:2,title:'契约测试小说'},token:agentToken});assert.equal(r.status,200);
 let row=(await client.read('/jobs')).jobs[0];assert.equal(progressText(row),'1 / 2 章');
 r=await request('/agent/report',{body:{id:leased.id,status:'complete',completed:files[0].size,total:files[0].size,files},token:agentToken});assert.equal(r.status,200);
 client.dispose();const restored=createAccountConnection(clientOptions);assert.equal((await restored.refresh()).status,'approved');
 row=(await restored.read('/jobs')).jobs[0];assert.equal(row.status,'complete');assert.equal(row.progress_unit,'bytes');assert.ok(row.source_expires_at>row.updated);
 assert.equal((await restored.read('/jobs/files?id='+row.id)).files[0].size,files[0].size);
 assert.equal((await request('/app-api/download-ticket',{cookie,body:{id:row.id,path:files[0].path}})).status,503);
 // Rebuild clones the server-owned canonical spec, consumes a new allowance,
 // replays duplicate clicks and never accepts a foreign or running source.
 assert.equal((await request('/app-api/jobs',{cookie,body:{retry_of:row.id,request_key:'e'.repeat(32)}})).status,409);
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='expired' WHERE id=?").bind(row.id).run();
 const rebuild=await restored.submit({retry_of:row.id});assert.notEqual(rebuild.id,row.id);assert.equal((await restored.submit({retry_of:row.id})).id,rebuild.id);
 const rebuildRow=await DB.prepare('SELECT request_json FROM mv_hybrid_jobs WHERE id=?').bind(rebuild.id).first();assert.deepEqual(JSON.parse(rebuildRow.request_json),spec);
 assert.equal((await request('/app-api/jobs',{cookie,body:{retry_of:'f'.repeat(24),request_key:'f'.repeat(32)}})).status,404);
 assert.equal((await request('/app-api/jobs',{cookie,body:{...spec,layout:{indent:99},request_key:'c'.repeat(32)}})).status,400);
 await restored.read('/jobs/cancel',{id:rebuild.id});await restored.logout();assert.equal((await request('/app-auth/session',{cookie})).status,403);restored.dispose();
 const base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8')),pilot={...env,...configureAccountWindow(base,'account-submit-on').vars};
 async function paired(){const p=await request('/app-auth/pair',{body:{},environment:pilot}),data=await p.json(),c=p.headers.get('Set-Cookie').split(';')[0];assert.ok(Number(p.headers.get('Set-Cookie').match(/Max-Age=(\d+)/)[1])<=1800);const g=await request('/app-auth/approve',{body:{code:data.pair_code},token,environment:pilot});assert.equal(g.status,200);assert.equal((await g.json()).ticket_limit,0);return c;}
 const devices=await Promise.all([paired(),paired()]);
 const submit=(spec,key,c=devices[0])=>request('/app-api/jobs',{body:{...spec,request_key:key},cookie:c,environment:pilot});
 assert.equal((await submit({kind:'video',url:'https://example.com/unapproved.mp4'},'0'.repeat(32))).status,403);
 assert.equal((await request('/app-api/novel/catalog?url='+encodeURIComponent(spec.url),{cookie:devices[0],environment:pilot})).status,403);
 const candidates=await Promise.all(PILOT_PRESETS.flatMap((p,i)=>[submit(p.spec,String(i+1).repeat(32)),submit(p.spec,String(i+5).repeat(32),devices[1])]));
 assert.equal(candidates.filter(r=>r.status===202).length,4);assert.equal(candidates.filter(r=>r.status===429).length,4,'one recipe each across all devices, atomically');
 for(const c of devices){const d=await (await request('/app-auth/session',{cookie:c,environment:pilot})).json();assert.equal(d.jobs_remaining,0);assert.equal(d.can_download,false);assert.equal(d.ticket_limit,0);assert.equal(d.presets.length,4);}
 const pilotJobs=(await (await request('/app-api/jobs',{cookie:devices[0],environment:pilot})).json()).jobs;assert.equal(pilotJobs.length,4,'no Owner or old account task imported');
 assert.equal((await request('/app-api/download-ticket',{cookie:devices[0],environment:{...pilot,ENABLE_DIRECT_STREAM:'true'},body:{id:pilotJobs[0].id,path:'generated/a.epub'}})).status,403,'no file ticket even if streaming accidentally flips on');
 const originalNow=Date.now;try{Date.now=()=>Number(pilot.MEDIA_APP_SUBMISSION_TEST_UNTIL);assert.equal((await request('/app-auth/session',{cookie:devices[0],environment:pilot})).status,404);}finally{Date.now=originalNow;}
 // Metadata lookup strips source URLs/unknown fields, stops at upstream errors,
 // and has its own durable global rate bucket, independent of file tickets.
 const catalog=await novelCatalog(spec.url,env,async(url,o)=>{assert.match(url,/^https:\/\/pt-universe-api\./);assert.equal(o.redirect,'manual');assert.ok(!o.headers.Authorization&&!o.headers.Cookie);return new Response(JSON.stringify({title:'目录',chapters:[{title:'一',url:'private chapter',secret:'drop'}]}));});
 assert.deepEqual(catalog.chapters,[{index:0,title:'一'}]);
 let fetches=0;await assert.rejects(novelCatalog('https://localhost/x',env,async()=>{fetches++;}),e=>e.status===400);assert.equal(fetches,0);
 await assert.rejects(novelCatalog(spec.url,env,async()=>new Response('',{status:429})),e=>e.status===429);
 for(let i=0;i<4;i++)assert.equal((await relay.fetch(new Request('https://private/catalog-permit'))).status,204);
 assert.equal((await relay.fetch(new Request('https://private/catalog-permit'))).status,429);assert.equal((await relay.fetch(new Request('https://private/ticket-permit'))).status,204);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_tickets').first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_transfer_usage').first()).n,0);
 console.log('PASS account journey: actual client/form -> Worker/SQLite -> lease -> progress/completion -> reload/files -> explicit rebuild/cancel/logout; no transfer');
 console.log('PASS bounded four-source pilot: concurrent devices, per-recipe/account cap, no imported tasks, no tickets, deadline closure; fixed metadata catalog and independent durable limiter');
}finally{dbProcess.stdin.end();lines.close();}
