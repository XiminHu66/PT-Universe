import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {handle} from './src/index.js';
const child=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let sequence=0;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const r=JSON.parse(line),wait=pending.get(r.id);pending.delete(r.id);r.error?wait.reject(new Error(r.error)):wait.resolve(r.results)});
function sql(ops,batch=false){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops,batch})+'\n')})}
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args)},async run(){return (await sql([this]))[0]},async first(){return (await sql([this]))[0].results[0]||null},async all(){return (await sql([this]))[0]}}}
const DB={prepare,batch:ops=>sql(ops,true)},ids=['a','b','c'].map(x=>x.repeat(24)),base='https://test.invalid';
const env={DB,MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'x'.repeat(64),ENABLE_ACCEPTANCE_UI:'true',MEDIA_ACCEPTANCE_UNTIL:String(Date.now()+1200000),MEDIA_STREAM_TEST_UNTIL:String(Date.now()+1200000),MEDIA_ACCEPTANCE_JOB_IDS:ids.join(','),ENABLE_DIRECT_STREAM:'true',RELAY:{idFromName(){return 'test'},get(){return{fetch:async url=>url.endsWith('/ticket-permit')?new Response(null,{status:204}):new Response('offline',{status:503})}}}};
async function request(path,{body,cookie,token,environment=env,origin=base}={}){return handle(new Request(base+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),environment)}
const usage=()=>DB.prepare('SELECT reserved_bytes FROM mv_hybrid_transfer_usage').first();
try{
 for(let i=0;i<ids.length;i++){
  const name=ids[i]+['.epub','.cbz','.mp4'][i];
  await DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,'novel','{}','complete',0,0)").bind(ids[i]).run();
  await DB.prepare('INSERT INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,4)').bind(ids[i],'generated/'+name,name).run();
 }
 assert.equal((await request('/acceptance/pair',{body:{},environment:{...env,ENABLE_ACCEPTANCE_UI:'false'}})).status,404);
 assert.equal((await request('/acceptance/pair',{body:{},origin:'https://foreign.invalid'})).status,403);
 const paired=await request('/acceptance/pair',{body:{}});assert.equal(paired.status,201);
 const cookie=paired.headers.get('Set-Cookie').split(';')[0],code=(await paired.json()).pair_code;
 assert.match(paired.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Strict/);
 const stored=await DB.prepare('SELECT digest FROM mv_hybrid_browser_sessions').first();
 assert.notEqual(stored.digest,cookie.split('=')[1],'D1 must never store raw cookie credentials');
 assert.equal((await request('/quota',{cookie})).status,401,'paired browser must not receive Owner access');
 assert.equal((await request('/agent/ws',{cookie})).status,401,'paired browser must not receive Agent access');
 assert.equal((await request('/acceptance/approve',{body:{code,ids},token:env.MEDIA_AGENT_TOKEN})).status,401);
 assert.equal((await request('/acceptance/approve',{body:{code,ids:[...ids.slice(0,2),'d'.repeat(24)]},token:env.MEDIA_OWNER_TOKEN})).status,403);
 assert.equal((await request('/acceptance/ticket',{cookie,body:{id:ids[0],path:'generated/'+ids[0]+'.epub'}})).status,403,'pending sessions cannot issue tickets');
 assert.equal((await request('/acceptance/approve',{body:{code,ids},token:env.MEDIA_OWNER_TOKEN})).status,200);
 const approved=await request('/acceptance/session',{cookie});assert.equal(approved.status,200);assert.equal((await approved.json()).files.length,3);
 assert.equal((await request('/acceptance/session',{cookie,environment:{...env,MEDIA_ACCEPTANCE_JOB_IDS:[...ids.slice(0,2),'d'.repeat(24)].join(',')}})).status,403);
 assert.equal((await request('/acceptance/ticket',{cookie,body:{id:'d'.repeat(24),path:'generated/x.epub'}})).status,403);
 const selected={cookie,body:{id:ids[0],path:'generated/'+ids[0]+'.epub'}};
 const first=await request('/acceptance/ticket',selected);assert.equal(first.status,200);const ticket=(await first.json()).ticket;
 assert.equal((await request('/download?ticket='+ticket)).status,503);
 assert.equal((await usage()).reserved_bytes,0);
 const competing=await Promise.all(Array.from({length:6},()=>request('/acceptance/ticket',selected)));
 assert.equal(competing.filter(x=>x.status===200).length,5);assert.equal(competing.filter(x=>x.status===429).length,1,'six-ticket session cap is atomic');
 const stillNew=(await competing.find(x=>x.status===200).json()).ticket;
 const own=await request('/download-ticket',{body:{id:ids[1],path:'generated/'+ids[1]+'.cbz'},token:env.MEDIA_OWNER_TOKEN});assert.equal(own.status,200);
 assert.equal((await usage()).reserved_bytes,24);
 assert.equal((await request('/acceptance/revoke',{body:{},token:env.MEDIA_AGENT_TOKEN})).status,401);
 assert.equal((await request('/acceptance/revoke',{body:{},token:env.MEDIA_OWNER_TOKEN})).status,200);
 assert.equal((await usage()).reserved_bytes,4,'revoke must preserve unrelated Owner ticket reservations');
 assert.equal((await request('/acceptance/session',{cookie})).status,403);
 assert.equal((await request('/download?ticket='+stillNew)).status,403,'revoked scoped ticket is unusable');
 // Browser logout must preserve another browser, an Owner ticket and any
 // already-active transfer reservation. Repetition cannot double-release.
 async function approvedBrowser(){
  const r=await request('/acceptance/pair',{body:{}}),cookie=r.headers.get('Set-Cookie').split(';')[0],code=(await r.json()).pair_code;
  assert.equal((await request('/acceptance/approve',{body:{code,ids},token:env.MEDIA_OWNER_TOKEN})).status,200);return cookie;
 }
 const cookieA=await approvedBrowser(),cookieB=await approvedBrowser();
 const ticketFor=cookie=>request('/acceptance/ticket',{cookie,body:{id:ids[0],path:'generated/'+ids[0]+'.epub'}});
 const browserA1=(await (await ticketFor(cookieA)).json()).ticket;
 const browserA2=(await (await ticketFor(cookieA)).json()).ticket;
 const browserB1=(await (await ticketFor(cookieB)).json()).ticket;
 const hashed=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),x=>x.toString(16).padStart(2,'0')).join('');
 await DB.prepare("UPDATE mv_hybrid_tickets SET status='active' WHERE digest=?").bind(await hashed(browserA1)).run();
 assert.equal((await usage()).reserved_bytes,16);
 assert.equal((await request('/acceptance/logout',{cookie:cookieA,body:{},origin:'https://foreign.invalid'})).status,403);
 assert.equal((await request('/acceptance/logout',{body:{},token:env.MEDIA_OWNER_TOKEN})).status,403);
 assert.equal((await request('/acceptance/logout',{cookie:cookieA})).status,405);
 const loggedOut=await request('/acceptance/logout',{cookie:cookieA,body:{},environment:{...env,ENABLE_ACCEPTANCE_UI:'false'}});
 assert.equal(loggedOut.status,200,'logout remains available after the window closes');assert.match(loggedOut.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal((await usage()).reserved_bytes,12,'only this browser unused ticket is released');
 assert.equal((await DB.prepare('SELECT status FROM mv_hybrid_tickets WHERE digest=?').bind(await hashed(browserA1)).first()).status,'active');
 assert.equal((await request('/acceptance/session',{cookie:cookieA})).status,403);
 assert.equal((await request('/acceptance/session',{cookie:cookieB})).status,200);
 assert.equal((await request('/download?ticket='+browserA2)).status,403);
 assert.equal((await request('/acceptance/logout',{cookie:cookieA,body:{}})).status,200);
 assert.equal((await usage()).reserved_bytes,12,'repeat logout is idempotent');
 assert.equal((await request('/download?ticket='+browserB1,{cookie:cookieB})).status,503);
 assert.equal((await usage()).reserved_bytes,8,'unrelated browser ticket still reaches normal offline release');
 assert.equal((await request('/acceptance/logout',{cookie:cookieB,body:{}})).status,200);
 console.log('PASS real SQLite single-browser logout: same-origin cookie scope, closed-window availability, idempotence, expired unused tickets, other browser/Owner and active reservations preserved');
 const flood=await Promise.all(Array.from({length:16},()=>request('/acceptance/pair',{body:{}})));
 assert.equal(flood.filter(x=>x.status===201).length,10);assert.equal(flood.filter(x=>x.status===429).length,6,'pending-session cap is atomic');
 const exp=flood.find(x=>x.status===201),expiredCookie=exp.headers.get('Set-Cookie').split(';')[0],expiredCode=(await exp.json()).pair_code;
 await DB.prepare('UPDATE mv_hybrid_browser_sessions SET expires_at=0').run();
 assert.equal((await request('/acceptance/session',{cookie:expiredCookie})).status,403);
 assert.equal((await request('/acceptance/approve',{body:{code:expiredCode,ids},token:env.MEDIA_OWNER_TOKEN})).status,409);
 console.log('PASS real SQLite scoped browser pairing: hashed HttpOnly cookie, Owner-only approval, fixed files, role/CSRF isolation, expiry, concurrent caps, narrow revocation and reservation release');
}finally{child.stdin.end();lines.close()}
