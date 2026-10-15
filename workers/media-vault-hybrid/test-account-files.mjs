import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {handle} from './src/index.js';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
import {configureAccountWindow} from './account-window-config.mjs';
import {validateDeviceFileHistory} from './device-file-history.mjs';
import {FILE_TEST_JOBS,FILE_TEST_BYTES,fileTestManifest} from './src/account-file-scope.js';
const dbProcess=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']}),responses=new Map();let seq=0;
const lines=createInterface({input:dbProcess.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=responses.get(r.id);responses.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
const sql=(ops,batch=false)=>new Promise((resolve,reject)=>{const id=++seq;responses.set(id,{resolve,reject});dbProcess.stdin.write(JSON.stringify({id,ops,batch})+'\n');});
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,batch:ops=>sql(ops,true)},origin='https://journey.invalid';
const env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'false',MEDIA_APP_ACCOUNT_ID:'submit-test-'+'b'.repeat(32),MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64)};
let channelMode='ready';
const channelAgent={readyState:1,send(raw){const m=JSON.parse(raw);if(m.type==='probe'&&channelMode!=='silent')queueMicrotask(()=>relay.webSocketMessage(this,JSON.stringify({type:channelMode==='busy'?'probe-busy':'probe-ok',id:m.id})));}};
const relay=new MediaRelay(relayContext(channelAgent),env);env.RELAY={idFromName:()=>'',get:()=>({fetch:url=>relay.fetch(new Request(url))})};
async function request(path,{body,cookie,token,environment=env}={}){return handle(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),environment);}

const base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
const files=FILE_TEST_JOBS.map((id,i)=>({id,path:i<2?'generated/'+id+(i===0?'.epub':'.cbz'):'video/ptmv-'+id+'.sample-5s [sample-5s].mp4',size:(i+1)*1024}));
const start=Date.now()-1000,selection={account_id:env.MEDIA_APP_ACCOUNT_ID,files};
Object.assign(env,configureAccountWindow(base,'account-files-on',start,selection).vars);
const token=env.MEDIA_OWNER_TOKEN;
async function pair(){const r=await request('/app-auth/pair',{body:{}});assert.equal(r.status,201);return {...await r.json(),cookie:r.headers.get('Set-Cookie').split(';')[0]};}
const approve=p=>request('/app-auth/approve',{body:{code:p.pair_code},token});
const ticket=(p,f,environment=env)=>request('/app-api/download-ticket',{cookie:p.cookie,body:{id:f.id,path:f.path},environment});
try{
 assert.equal(fileTestManifest(env).length,3,'video filename brackets and spaces supported');
 assert.throws(()=>configureAccountWindow(base,'account-files-on',start));
 assert.throws(()=>configureAccountWindow(base,'account-files-on',start,{...selection,files:files.map(f=>({...f,size:FILE_TEST_BYTES}))}));
 for(const operation of ['account-files-off','account-rc-off']){const v=configureAccountWindow(base,operation).vars;assert.equal(v.ENABLE_DIRECT_STREAM,'false');assert.equal(v.MEDIA_APP_FILE_TEST_FILES,'');assert.equal(v.MEDIA_APP_FILE_TEST_UNTIL,'0');}
 for(const [i,f] of files.entries()){
  await DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,?,?,'complete',?,?)").bind(f.id,['novel','manga','video'][i],'{}',start,start).run();
  await DB.prepare('INSERT INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,?)').bind(f.id,f.path,f.path.split('/').pop(),f.size).run();
  await DB.prepare('INSERT INTO mv_hybrid_account_jobs(job_id,account_id,request_key,request_hash,created_by_digest) VALUES(?,?,?,?,?)').bind(f.id,env.MEDIA_APP_ACCOUNT_ID,String(i).repeat(32),'hash','old-revoked').run();
 }
 const a=await pair(),b=await pair();assert.equal((await approve(a)).status,200);assert.equal((await approve(b)).status,409,'only one approved device');
 let state=await (await request('/app-auth/session',{cookie:a.cookie})).json();assert.equal(state.scope,'three-file-save-test');assert.equal(state.job_limit,0);assert.equal(state.ticket_limit,3);assert.equal(state.can_submit,false);assert.equal(state.can_download,true);
 const page=await request('/app/');assert.match(await page.text(),/20 分钟账号文件保存验收/);
 assert.equal((await request('/app-api/jobs',{body:{kind:'video',url:'https://example.com/a.mp4',request_key:'a'.repeat(32)},cookie:a.cookie})).status,403);
 assert.equal((await request('/app-api/jobs/cancel',{body:{id:files[0].id},cookie:a.cookie})).status,403);
 assert.equal((await request('/app-api/novel/catalog?url=https://www.wenku8.net/book/3551.htm',{cookie:a.cookie})).status,403);
 assert.equal((await request('/download-ticket',{body:{id:files[0].id,path:files[0].path},token})).status,403,'Owner cannot mint parallel tickets');
 assert.equal((await request('/app-api/jobs/files?id='+'f'.repeat(24),{cookie:a.cookie})).status,404);
 assert.equal((await ticket(a,{...files[0],path:'generated/unselected.epub'})).status,404);
 channelMode='busy';assert.equal((await ticket(a,files[0])).status,429);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_tickets').first()).n,0,'busy channel consumes no ticket');
 channelMode='silent';assert.equal((await ticket(a,files[0])).status,503);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_tickets').first()).n,0,'silent channel consumes no ticket');
 channelMode='ready';channelAgent.readyState=1;channelAgent.serializeAttachment({seen:Date.now(),retired:false});
 const competing=await Promise.all(Array.from({length:7},()=>ticket(a,files[0])));assert.equal(competing.filter(r=>r.status===200).length,1);assert.equal(competing.filter(r=>r.status===429).length,6,'atomic per-file single issuance');
 const first=await competing.find(r=>r.status===200).json();
 const other=await Promise.all(files.slice(1).map(f=>ticket(a,f)));assert.ok(other.every(r=>r.status===200));
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_tickets').first()).n,3);
 assert.equal((await DB.prepare('SELECT reserved_bytes FROM mv_hybrid_transfer_usage').first()).reserved_bytes,6144);
 state=await (await request('/app-auth/session',{cookie:a.cookie})).json();assert.equal(state.tickets_remaining,0);
 const clock=Date.now;try{Date.now=()=>Number(env.MEDIA_APP_FILE_TEST_UNTIL);assert.equal((await request('/app-auth/session',{cookie:a.cookie})).status,404);assert.equal((await request('/download?ticket='+first.ticket)).status,503);}finally{Date.now=clock;}
 assert.equal((await request('/app-auth/session',{cookie:a.cookie,environment:{...env,MEDIA_APP_FILE_TEST_FILES:'[]'}})).status,404);
 assert.equal((await request('/app-auth/session',{cookie:a.cookie,environment:{...env,ENABLE_APP_SUBMISSION:'true'}})).status,404,'accidental submission enabling fails closed');
 await request('/app-auth/logout',{cookie:a.cookie,body:{}});assert.equal((await DB.prepare('SELECT reserved_bytes FROM mv_hybrid_transfer_usage').first()).reserved_bytes,0);
 const c=await pair();assert.equal((await approve(c)).status,200);state=await (await request('/app-auth/session',{cookie:c.cookie})).json();assert.equal(state.tickets_remaining,0,'replacement session cannot reset account allowance');assert.equal((await ticket(c,files[0])).status,429);
 assert.equal((await request('/download?ticket='+first.ticket)).status,403,'logout invalidates unclaimed ticket');
 // A separately approved new round preserves all three prior rows and gets
 // exactly three more; changing browser sessions cannot extend either round.
 await request('/app-auth/logout',{cookie:c.cookie,body:{}});
 const clockRound=Date.now;try{
  Date.now=()=>clockRound()+30*60000;
  await DB.prepare("UPDATE mv_hybrid_tickets SET status='complete'").run();
  const history=await DB.prepare('SELECT t.job_id,t.relative_path,t.bytes,t.status,t.expires_at,s.status AS session_status,s.expires_at AS session_expires_at FROM mv_hybrid_app_tickets a JOIN mv_hybrid_tickets t ON t.digest=a.digest JOIN mv_hybrid_app_sessions s ON s.digest=a.session_digest').all();
  validateDeviceFileHistory(history.results,files,files.map(f=>({id:f.id,bytes:f.size})),Date.now());
  channelAgent.readyState=1;channelAgent.serializeAttachment({seen:Date.now(),retired:false});
  Object.assign(env,configureAccountWindow(base,'account-files-on',Date.now()-1000,selection).vars);
  const device=await pair();assert.equal((await approve(device)).status,200);
  const newTickets=await Promise.all(files.map(f=>ticket(device,f)));assert.ok(newTickets.every(r=>r.status===200));
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_tickets').first()).n,6,'old history is retained, not reset');
  assert.equal((await ticket(device,files[0])).status,429,'new round cannot issue a fourth ticket');
  await request('/app-auth/logout',{cookie:device.cookie,body:{}});
  const replacement=await pair();assert.equal((await approve(replacement)).status,200);
  assert.equal((await ticket(replacement,files[0])).status,429,'replacement device does not extend new round');
  const six=await DB.prepare('SELECT t.job_id,t.relative_path,t.bytes,t.status,t.expires_at,s.status AS session_status,s.expires_at AS session_expires_at FROM mv_hybrid_app_tickets a JOIN mv_hybrid_tickets t ON t.digest=a.digest JOIN mv_hybrid_app_sessions s ON s.digest=a.session_digest').all();
  assert.throws(()=>validateDeviceFileHistory(six.results,files,files.map(f=>({id:f.id,bytes:f.size})),Date.now()),'a third round is refused');
  await request('/app-auth/logout',{cookie:replacement.cookie,body:{}});
 }finally{Date.now=clockRound;}
 console.log('PASS actual SQLite distinct device round: original history retained, exactly three additional tickets, replacement-session cap, third-round refusal');
 console.log('PASS real SQLite three-file account window: retained ownership, one device, no task mutations, atomic per-file/account cap, replacement-session cap, expiry, no revival and precise logout release');
}finally{dbProcess.stdin.end();lines.close();}
