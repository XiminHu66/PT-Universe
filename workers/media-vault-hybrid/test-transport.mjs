import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {handle} from './src/index.js';
import {transportRoute} from './src/transport.js';
import {MediaRelay} from './src/relay.js';
import {relayContext} from './test-state.mjs';
import {transferBudget} from './src/limits.js';

const process=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let sequence=0,failAt=null;
const lines=createInterface({input:process.stdout});
lines.on('line',line=>{const value=JSON.parse(line),handler=pending.get(value.id);pending.delete(value.id);value.error?handler.reject(new Error(value.error)):handler.resolve(value.results)});
function sql(ops,batch=false,fail_at=null){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});process.stdin.write(JSON.stringify({id,ops,batch,fail_at})+'\n')})}
function statement(query,args=[]){return {sql:query,args,bind(...args){return statement(query,args)},async run(){return (await sql([this]))[0]},async first(){return (await sql([this]))[0].results[0]||null},async all(){return (await sql([this]))[0]}}}
const DB={prepare:statement,async batch(ops){const inject=failAt;failAt=null;return sql(ops,true,inject)}};
const id='a'.repeat(24),path='video/ptmv-'+id+' [中文样本].mp4',period=new Date().toISOString().slice(0,7);
const env={DB,ENABLE_DIRECT_STREAM:'true',MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64),MEDIA_TRANSFER_MONTHLY_LIMIT_GIB:'5',RELAY:{idFromName(){return 'test'},get(){return {fetch:async url=>url.endsWith('/ticket-permit')?new Response(null,{status:204}):new Response('offline',{status:503})}}}};
const base='https://unit.invalid';
function request(route,body,token=env.MEDIA_OWNER_TOKEN,environment=env){return transportRoute(new Request(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),environment)}
async function ticket(){const r=await request('/download-ticket',{id,path});return {status:r.status,...await r.json()}}
async function usage(){return DB.prepare('SELECT * FROM mv_hybrid_transfer_usage WHERE month=?').bind(period).first()}
async function reset(size=4){await sql([{sql:'DELETE FROM mv_hybrid_tickets'},{sql:'DELETE FROM mv_hybrid_transfer_usage'},{sql:'DELETE FROM mv_hybrid_files'},{sql:'INSERT INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,?)',args:[id,path,'sample.epub',size]}],true)}
try{
 await DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,'novel','{}','complete',0,0)").bind(id).run();
 // Real SQLite expiry: no early deletion, pending/active protection,
 // transaction rollback, idempotency, and issuance/expiry serialization.
 async function expire(token=env.MEDIA_AGENT_TOKEN,job=id){return handle(new Request(base+'/agent/expire',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:job})}),env)}
 await reset();
 assert.equal((await expire(env.MEDIA_OWNER_TOKEN)).status,401);
 assert.equal((await expire('',id)).status,401);
 assert.equal((await expire(env.MEDIA_AGENT_TOKEN,'invalid')).status,400);
 assert.equal((await expire(env.MEDIA_AGENT_TOKEN,'f'.repeat(24))).status,404);
 await DB.prepare("UPDATE mv_hybrid_jobs SET updated_at=? WHERE id=?").bind(Date.now(),id).run();
 assert.equal((await expire()).status,409,'24-hour cloud age floor must hold');
 await DB.prepare("UPDATE mv_hybrid_jobs SET updated_at=0 WHERE id=?").bind(id).run();
 let live=await ticket();assert.equal(live.status,200);
 assert.equal((await expire()).status,409,'Unredeemed valid ticket retains source');
 await DB.prepare("UPDATE mv_hybrid_tickets SET status='active'").run();
 assert.equal((await expire()).status,409,'Active transfer retains source');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM mv_hybrid_files').first()).n,1);
 await DB.prepare("UPDATE mv_hybrid_tickets SET status='new',expires_at=0").run();
 failAt=1;assert.equal((await expire()).status,500,'Injected D1 failure must roll back expiry');
 assert.equal((await DB.prepare('SELECT status FROM mv_hybrid_jobs WHERE id=?').bind(id).first()).status,'complete');
 assert.equal((await usage()).reserved_bytes,4);
 const other='e'.repeat(24);
 await DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,'novel','{}','complete',0,0)").bind(other).run();
 await DB.prepare("INSERT INTO mv_hybrid_tickets(digest,job_id,relative_path,bytes,month,expires_at,status) VALUES(?,?,?,2,?,?,'new')").bind('e'.repeat(64),other,'generated/other.epub',period,Date.now()+60000).run();
 await DB.prepare('UPDATE mv_hybrid_transfer_usage SET reserved_bytes=6,transferred_bytes=7').run();
 const expirations=await Promise.all(Array.from({length:8},()=>expire()));assert.ok(expirations.every(r=>r.status===200));
 assert.equal((await usage()).reserved_bytes,2,'Release only selected expired tickets once');assert.equal((await usage()).transferred_bytes,7);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM mv_hybrid_files WHERE job_id=?').bind(id).first()).n,0);
 assert.equal((await ticket()).status,409,'Expired job cannot issue tickets');
 assert.equal((await handle(new Request(base+'/agent/report',{method:'POST',headers:{Authorization:'Bearer '+env.MEDIA_AGENT_TOKEN},body:JSON.stringify({id,status:'complete',files:[{path,size:4}]})}),env)).status,409,'Late completion cannot revive expired metadata');
 await DB.prepare('DELETE FROM mv_hybrid_tickets WHERE job_id=?').bind(other).run();await DB.prepare('DELETE FROM mv_hybrid_jobs WHERE id=?').bind(other).run();
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='complete',updated_at=0 WHERE id=?").bind(id).run();await reset();
 const [racedTicket,racedExpiry]=await Promise.all([ticket(),expire()]);
 assert.ok(!(racedTicket.status===200&&racedExpiry.status===200),'Issuance and expiry cannot both win');
 assert.ok([200,409].includes(racedExpiry.status));
 if(racedExpiry.status===200)assert.equal((await usage())?.reserved_bytes||0,0);
 else assert.equal((await usage()).reserved_bytes,4);
 await DB.prepare("UPDATE mv_hybrid_jobs SET status='complete',updated_at=0 WHERE id=?").bind(id).run();
 console.log('PASS real SQLite retention: 24-hour floor, active/pending protection, atomic metadata invalidation, rollback, idempotent exact reservation release and issuance race');
 await reset(20*1024*1024);
 const window={...env,MEDIA_STREAM_TEST_UNTIL:String(Date.now()+60000)};
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,window)).status,413);
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,{...window,MEDIA_STREAM_TEST_LARGE_JOB:'b'.repeat(24)})).status,413);
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,{...window,MEDIA_STREAM_TEST_UNTIL:'1',MEDIA_STREAM_TEST_LARGE_JOB:id})).status,503);
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,{...window,MEDIA_STREAM_TEST_LARGE_JOB:id})).status,200);
 await reset(32*1024*1024+1);
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,{...window,MEDIA_STREAM_TEST_LARGE_JOB:id})).status,413);
 await reset();
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_AGENT_TOKEN)).status,401);
 assert.equal((await request('/download-ticket',{id,path},env.MEDIA_OWNER_TOKEN,{...env,ENABLE_DIRECT_STREAM:'false'})).status,503);
 assert.equal(await usage(),null,'OFF gate must not mutate ledger');
 let t=await ticket();assert.equal(t.status,200);assert.equal((await usage()).reserved_bytes,4);
 assert.equal((await request('/download?ticket='+t.ticket)).status,503);
 assert.equal((await usage()).reserved_bytes,0,'offline agent releases reservation');
 assert.equal((await request('/download?ticket='+t.ticket)).status,403,'one-use ticket cannot retry');
 await reset();t=await ticket();await DB.prepare('DELETE FROM mv_hybrid_files').run();
 assert.equal((await request('/download?ticket='+t.ticket)).status,404);
 assert.equal((await usage()).reserved_bytes,0,'missing metadata releases reservation');
 await reset();t=await ticket();await DB.prepare('UPDATE mv_hybrid_tickets SET expires_at=0').run();
 assert.equal((await request('/download?ticket='+t.ticket)).status,403);
 const expired=await Promise.all(Array.from({length:8},()=>ticket()));
 assert.equal(expired.filter(x=>x.status===200).length,6);assert.equal(expired.filter(x=>x.status===429).length,2);assert.equal((await usage()).reserved_bytes,24,'concurrent expiry releases once');
 await reset();
 // Expiry batch runs first; inject a failure into issuance's second statement.
 const originalBatch=DB.batch;let calls=0;
 DB.batch=async ops=>{if(++calls===2)failAt=1;return originalBatch(ops)};
 t=await ticket();assert.equal(t.status,503);DB.batch=originalBatch;
 assert.equal((await usage()).reserved_bytes,0,'failed batch rolls back reservation');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM mv_hybrid_tickets').first()).n,0);
 await reset(transferBudget(env));
 const concurrent=await Promise.all([ticket(),ticket()]);
 assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,429]);
 assert.equal((await usage()).reserved_bytes,transferBudget(env),'concurrent issuance stays within budget');
 await reset();
 const agent={readyState:1,sent:[],send(raw){this.sent.push(JSON.parse(raw))}};
 const relay=new MediaRelay(relayContext(agent),{DB});
 env.RELAY.get=()=>({fetch:url=>relay.fetch(new Request(url))});
 t=await ticket();const response=await request('/download?ticket='+t.ticket);assert.equal(response.status,200);
 assert.equal((await request('/download?ticket='+t.ticket)).status,403);
 const reader=response.body.getReader(),transfer=agent.sent[0].id;
 const write=relay.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(transfer),80,75,3,4]).buffer);
 assert.deepEqual([...(await reader.read()).value],[80,75,3,4]);await write;
 const end=relay.webSocketMessage(agent,JSON.stringify({type:'end',id:transfer}));assert.equal((await reader.read()).done,true);await end;
 await relay.settle(transfer,true);await relay.webSocketClose(agent);
 assert.equal((await usage()).transferred_bytes,4);assert.equal((await usage()).reserved_bytes,0);
 assert.equal((await DB.prepare('SELECT status FROM mv_hybrid_tickets').first()).status,'complete');
 await reset();t=await ticket();
 const interrupted=await request('/download?ticket='+t.ticket),cancelReader=interrupted.body.getReader();
 const interruptedId=agent.sent.at(-1).id;
 const partial=relay.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(interruptedId),80,75]).buffer);
 assert.equal((await cancelReader.read()).value.length,2);await partial;
 await cancelReader.cancel();
 await relay.settle(interruptedId,false);
 assert.equal((await usage()).transferred_bytes,2,'interrupted transfer bills only delivered bytes');
 assert.equal((await usage()).reserved_bytes,0);
 assert.equal((await DB.prepare('SELECT status FROM mv_hybrid_tickets').first()).status,'failed');
 await reset();t=await ticket();
 const retry=await request('/download?ticket='+t.ticket),retryReader=retry.body.getReader(),retryId=agent.sent.at(-1).id;
 const retryWrite=relay.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(retryId),80,75,3,4]).buffer);
 await retryReader.read();await retryWrite;
 failAt=1;
 await assert.rejects(relay.settle(retryId,true),/Injected database failure/);
 assert.ok(relay.transfers.has(retryId),'failed settlement retains state for retry');
 assert.equal((await usage()).transferred_bytes,0);assert.equal((await usage()).reserved_bytes,4);
 const retryEnd=Promise.all([relay.settle(retryId,true),relay.settle(retryId,true)]);
 assert.equal((await retryReader.read()).done,true);await retryEnd;
 assert.equal((await usage()).transferred_bytes,4);assert.equal((await usage()).reserved_bytes,0);
 // Process loss after a confirmed chunk: boot from metadata, no old writer.
 await reset();
 let context=relayContext(agent),current=new MediaRelay(context,{DB});
 env.RELAY.get=()=>({fetch:url=>current.fetch(new Request(url))});
 t=await ticket();let crashResponse=await request('/download?ticket='+t.ticket),crashReader=crashResponse.body.getReader(),crashId=agent.sent.at(-1).id;
 let frame=current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75]).buffer);
 await crashReader.read();await frame;
 const saved=context.values.get('transfer-counts');
 assert.equal(saved.bytes,2);assert.equal(saved.attempted,2);
 assert.deepEqual(Object.keys(saved).sort(),['attempted','bytes','deadline','digest','id','period','size'].sort(),'persistent checkpoint stores only identifiers and counters');
 current=new MediaRelay(relayContext(agent,context.values),{DB});await current.ready;
 assert.equal((await usage()).transferred_bytes,2);assert.equal((await usage()).reserved_bytes,0);
 assert.equal((await request('/download?ticket='+t.ticket)).status,403);
 await crashReader.cancel();
 // Loss during a pending write charges at most its one unconfirmed frame.
 await reset();context=relayContext(agent);let lost=new MediaRelay(context,{DB});current=lost;
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 frame=lost.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75]).buffer);
 for(let n=0;n<100&&context.values.get('transfer-counts')?.attempted!==2;n++)await new Promise(r=>setTimeout(r,1));
 assert.equal(context.values.get('transfer-counts').bytes,0);
 current=new MediaRelay(relayContext(agent,context.values),{DB});await current.ready;
 assert.equal((await usage()).transferred_bytes,2,'unconfirmed attempted bytes use conservative bound');assert.equal((await usage()).reserved_bytes,0);
 await crashReader.cancel();await frame;
 assert.equal((await usage()).transferred_bytes,2,'late failure does not double-credit');
 // A claim/save crash has no checkpoint: count its reserved upper bound once.
 await reset();t=await ticket();await DB.prepare("UPDATE mv_hybrid_tickets SET status='active'").run();
 current=new MediaRelay(relayContext(agent),{DB});await current.ready;
 assert.equal((await usage()).transferred_bytes,4);assert.equal((await usage()).reserved_bytes,0);
 current=new MediaRelay(relayContext(agent),{DB});await current.ready;assert.equal((await usage()).transferred_bytes,4);
 // No chunks or close event: durable alarm aborts the idle writer.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 current.transfers.get(crashId).deadline=0;await current.alarm();
 await assert.rejects(crashReader.read());assert.equal((await usage()).reserved_bytes,0);assert.equal((await usage()).transferred_bytes,0);
 // Real consumer cancellation propagates through write failure, without manual settle.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 await crashReader.cancel();await current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75]).buffer);
 assert.equal((await usage()).reserved_bytes,0);assert.equal((await usage()).transferred_bytes,0);
 // D1 outage followed by object loss preserves the terminal success decision.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 frame=current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75,3,4]).buffer);await crashReader.read();await frame;
 failAt=1;await assert.rejects(current.settle(crashId,true),/Injected database failure/);assert.ok(context.alarmAt);
 current=new MediaRelay(relayContext(agent,context.values),{DB});await current.ready;
 assert.equal((await usage()).transferred_bytes,4);assert.equal((await usage()).reserved_bytes,0);
 assert.equal((await DB.prepare('SELECT status FROM mv_hybrid_tickets').first()).status,'complete');await crashReader.cancel();
 // Concurrent redemption is claimed atomically inside the recovered relay.
 await reset();current=new MediaRelay(relayContext(agent),{DB});t=await ticket();
 const claims=await Promise.all([request('/download?ticket='+t.ticket),request('/download?ticket='+t.ticket)]);
 assert.deepEqual(claims.map(r=>r.status).sort(),[200,403]);
 crashId=agent.sent.at(-1).id;await claims.find(r=>r.status===200).body.cancel();await current.webSocketClose(agent);
 assert.equal((await usage()).reserved_bytes,0);
 // Slow-reader ACK withholding, a competing download, and reservation isolation.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});agent.sent=[];
 const duplicateAgent=await current.fetch(new Request('https://private/agent-connect',{headers:{Upgrade:'websocket'}}));assert.equal(duplicateAgent.status,409);assert.equal(duplicateAgent.headers.get('Retry-After'),'5');
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 frame=current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75]).buffer);
 for(let n=0;n<100&&context.values.get('transfer-counts')?.attempted!==2;n++)await new Promise(r=>setTimeout(r,1));
 assert.ok(!agent.sent.some(x=>x.type==='ack'),'slow reader must withhold ACK');
 const busyTicket=await ticket(),busyResponse=await request('/download?ticket='+busyTicket.ticket);
 assert.equal(busyResponse.status,429);assert.equal(busyResponse.headers.get('Retry-After'),'2');
 assert.equal((await usage()).reserved_bytes,4,'busy redemption releases only its own reservation');
 assert.equal((await request('/download?ticket='+busyTicket.ticket)).status,403);
 await crashReader.read();await frame;assert.equal(agent.sent.at(-1).type,'ack');
 await crashReader.cancel();await current.webSocketClose(agent);
 assert.equal((await usage()).transferred_bytes,2);assert.equal((await usage()).reserved_bytes,0);
 // A premature second frame cannot build an unbounded writable queue.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});agent.sent=[];
 t=await ticket();crashResponse=await request('/download?ticket='+t.ticket);crashReader=crashResponse.body.getReader();crashId=agent.sent.at(-1).id;
 frame=current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),80,75]).buffer);
 for(let n=0;n<100&&context.values.get('transfer-counts')?.attempted!==2;n++)await new Promise(r=>setTimeout(r,1));
 const violation=current.webSocketMessage(agent,new Uint8Array([...new TextEncoder().encode(crashId),3,4]).buffer);
 for(let n=0;n<100&&!current.transfers.get(crashId)?.outcome;n++)await new Promise(r=>setTimeout(r,1));
 assert.ok(!context.values.has('transfer-counts')||context.values.get('transfer-counts').attempted===2,'second frame must not overwrite the pending bound');
 await crashReader.cancel();await violation;await frame;
assert.equal((await usage()).reserved_bytes,0);
 assert.ok(!agent.sent.some(x=>x.type==='ack'),'protocol violation cannot ACK queued frames');
 // Rate permits are serialized and survive a fresh object, while the pending cap
 // is conditional SQL in the same issuance transaction as the reservation.
 await reset();context=relayContext(agent);current=new MediaRelay(context,{DB});
 const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
 try{
  const burst=await Promise.all(Array.from({length:20},()=>ticket()));
  assert.equal(burst.filter(x=>x.status===200).length,6);assert.equal(burst.filter(x=>x.status===429).length,14);
  assert.equal((await usage()).reserved_bytes,24);assert.equal(context.values.get('ticket-permits').length,12);
  current=new MediaRelay(relayContext(agent,context.values),{DB});await current.ready;
  const limited=await request('/download-ticket',{id,path});assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  clock+=60001;assert.equal((await current.fetch(new Request('https://private/ticket-permit'))).status,204);
  await DB.prepare("UPDATE mv_hybrid_tickets SET expires_at=0 WHERE status='new'").run();
  const refreshed=await Promise.all(Array.from({length:8},()=>ticket()));assert.equal(refreshed.filter(x=>x.status===200).length,6);
  assert.equal((await usage()).reserved_bytes,24,'new window and concurrent expiry do not double-release');
 }finally{Date.now=originalNow;}
 // Metadata job capacity also stays at five under concurrent submission.
 const jobs=await Promise.all(Array.from({length:12},()=>handle(new Request(base+'/jobs',{method:'POST',headers:{Authorization:'Bearer '+env.MEDIA_OWNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices:[0]})}),env)));
 assert.equal(jobs.filter(x=>x.status===202).length,5);assert.equal(jobs.filter(x=>x.status===429).length,7);
 console.log('PASS flow-control fault tests: slow ACK, busy isolation, premature-frame rejection, twelve-per-minute durable rate cap, six pending tickets, atomic five-job capacity');
 console.log('PASS real SQLite recovery fault injection: confirmed/in-flight process loss, orphan claims, idle alarms, automatic cancel, durable terminal retry, concurrent redemption; metadata only');
 console.log('PASS real SQLite ticket transactions: OFF gate, token isolation, one-use, expiry concurrency, rollback, budget race, offline/missing-file release, exact-once stream accounting');
}finally{process.stdin.end();lines.close()}
