import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {handle} from './src/index.js';
import {configureAccountWindow} from './account-window-config.mjs';
import {appEnabled} from './src/account-auth.js';
import {OBSERVATION_DURATION,OBSERVATION_SETUP} from './src/account-observation-scope.js';
import {streamingEnabled} from './src/limits.js';
import {verifyAcceptanceReady} from './live-acceptance-ready.mjs';
const child=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']}),responses=new Map();let serial=0;
const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=responses.get(r.id);responses.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
const sql=(ops,batch=false)=>new Promise((resolve,reject)=>{const id=++serial;responses.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops,batch})+'\n');});
function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
const DB={prepare,batch:ops=>sql(ops,true)},origin='https://observation.invalid';
const clock=Date.now;let now=clock();Date.now=()=>now;
const base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
const env={DB,MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64),...configureAccountWindow(base,'account-observation-on',now).vars};
async function request(path,{body,cookie,token,environment=env}={}){return handle(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),environment);}
async function pair(environment=env){const r=await request('/app-auth/pair',{body:{},environment});assert.equal(r.status,201);return {...await r.json(),cookie:r.headers.get('Set-Cookie').split(';')[0]};}
const approve=(p,environment=env)=>request('/app-auth/approve',{body:{code:p.pair_code},token:env.MEDIA_OWNER_TOKEN,environment});
try{
 assert.ok(appEnabled(env));assert.equal(streamingEnabled({...env,ENABLE_DIRECT_STREAM:'true'}),false);
 assert.equal(Number(env.MEDIA_APP_OBSERVATION_PAIR_UNTIL)-now,OBSERVATION_SETUP);
 assert.equal(Number(env.MEDIA_APP_OBSERVATION_UNTIL)-now,OBSERVATION_SETUP+OBSERVATION_DURATION);
 assert.match(await (await request('/app/')).text(),/24 小时只读会话观察/);
 const a=await pair(),b=await pair();now+=120000;
 const approvals=await Promise.all([approve(a),approve(b)]);assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
 const approved=approvals[0].status===200?a:b,grant=await approvals.find(r=>r.status===200).json();
 assert.equal(grant.scope,'long-session-read-only');assert.equal(grant.job_limit,0);assert.equal(grant.ticket_limit,0);
 assert.equal(grant.observation_started_at,now);assert.equal(grant.expires_at,now+OBSERVATION_DURATION,'approval starts a complete 24 hours after setup');
 let state=await (await request('/app-auth/session',{cookie:approved.cookie})).json();
 assert.equal(state.read_only,true);assert.equal(state.can_submit,false);assert.equal(state.can_download,false);assert.equal(state.jobs_remaining,0);assert.equal(state.tickets_remaining,0);
 assert.deepEqual((await (await request('/app-api/jobs',{cookie:approved.cookie})).json()).jobs,[]);
 for(const [path,body] of [['/app-api/jobs',{kind:'video',url:'https://source.invalid/a.mp4',request_key:'1'.repeat(32)}],['/app-api/jobs/cancel',{id:'1'.repeat(24)}],['/app-api/download-ticket',{id:'1'.repeat(24),path:'a.mp4'}]])assert.equal((await request(path,{body,cookie:approved.cookie})).status,403);
 for(const path of ['/app-api/jobs/files?id='+'1'.repeat(24),'/app-api/novel/catalog?url=https://source.invalid'])assert.equal((await request(path,{cookie:approved.cookie})).status,403);
 const allowed=new Set(['/quota','/health','/app-auth/session','/app-api/jobs','/app-api/quota','/app-api/download-ticket']);
 const ledger=await verifyAcceptanceReady({owner:env.MEDIA_OWNER_TOKEN,agent:env.MEDIA_AGENT_TOKEN,pause:async()=>{},fetcher:async(url,opts)=>{assert.ok(allowed.has(new URL(url).pathname));assert.equal(new Headers(opts.headers).has('Cookie'),false);return handle(new Request(url,opts),env);}});
 assert.deepEqual(ledger,{transferred_bytes:0,reserved_bytes:0});
 await assert.rejects(verifyAcceptanceReady({owner:env.MEDIA_OWNER_TOKEN,agent:env.MEDIA_AGENT_TOKEN,pause:async()=>{},fetcher:async url=>new Response(JSON.stringify(new URL(url).pathname==='/health'?{ok:true,streaming:'not-live'}:{reserved_bytes:0,transferred_bytes:0}))}),/unexpectedly allowed/);
 for(const patch of [{ENABLE_APP_SUBMISSION:'true'},{ENABLE_DIRECT_STREAM:'true'},{MEDIA_APP_OBSERVATION_UNTIL:String(Number(env.MEDIA_APP_OBSERVATION_UNTIL)+1)},{MEDIA_APP_OBSERVATION_START:'NaN'},{MEDIA_APP_ACCOUNT_ID:'submit-test-'+'1'.repeat(32)},{MEDIA_APP_LOGIN_TEST_UNTIL:'1'}])assert.equal((await request('/app-auth/session',{cookie:approved.cookie,environment:{...env,...patch}})).status,404);
 now=grant.observation_started_at+12*3600000;
 state=await (await request('/app-auth/session',{cookie:approved.cookie})).json();assert.equal(state.expires_at,grant.expires_at,'reads do not slide expiry');
 assert.equal((await request('/app-auth/pair',{body:{}})).status,403,'setup ends independently of approved access');
 now=grant.expires_at;
 assert.equal((await request('/app-auth/session',{cookie:approved.cookie})).status,403,'absolute expiry rejects the cookie without a deployment');
 const reopened={...env,...configureAccountWindow(base,'account-observation-on',now).vars,MEDIA_APP_ACCOUNT_ID:env.MEDIA_APP_ACCOUNT_ID};
 assert.equal((await request('/app-auth/session',{cookie:approved.cookie,environment:reopened})).status,403,'changing window config cannot revive an expired session');
 assert.equal((await approve(await pair(reopened),reopened)).status,409,'same realm cannot reset the one approved observation through pairing');
 const fresh={...env,...configureAccountWindow(base,'account-observation-on',now).vars};
 const c=await pair(fresh);assert.equal((await approve(c,fresh)).status,200);
 assert.equal((await request('/app-auth/revoke',{body:{session_id:c.session_id},token:env.MEDIA_OWNER_TOKEN,environment:fresh})).status,200);
 assert.equal((await request('/app-auth/session',{cookie:c.cookie,environment:fresh})).status,403);
 assert.equal((await approve(await pair(fresh),fresh)).status,409,'revocation also preserves observation history');
 for(const table of ['mv_hybrid_jobs','mv_hybrid_tickets','mv_hybrid_app_tickets'])assert.equal((await DB.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
 for(const op of ['account-observation-off','account-novel-off','account-rc-off']){const vars=configureAccountWindow(base,op).vars;assert.equal(appEnabled(vars),false);for(const key of ['MEDIA_APP_OBSERVATION_START','MEDIA_APP_OBSERVATION_PAIR_UNTIL','MEDIA_APP_OBSERVATION_UNTIL'])assert.equal(vars[key],'0');}
 console.log('PASS real SQLite 24h read-only scope: full duration starts at approval, one approved session ever, no mutation/file/ticket access, no sliding/revival/re-pair reset, natural expiry/revocation boundary fixtures; metadata-only readiness never fetches HTML/assets. Clock tests are not real elapsed acceptance.');
}finally{Date.now=clock;child.stdin.end();lines.close();}
