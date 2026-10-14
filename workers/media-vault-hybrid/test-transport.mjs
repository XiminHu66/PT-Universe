import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
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
const env={DB,ENABLE_DIRECT_STREAM:'true',MEDIA_OWNER_TOKEN:'o'.repeat(64),MEDIA_AGENT_TOKEN:'a'.repeat(64),MEDIA_TRANSFER_MONTHLY_LIMIT_GIB:'5',RELAY:{idFromName(){return 'test'},get(){return {fetch:async()=>new Response('offline',{status:503})}}}};
const base='https://unit.invalid';
function request(route,body,token=env.MEDIA_OWNER_TOKEN,environment=env){return transportRoute(new Request(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),environment)}
async function ticket(){const r=await request('/download-ticket',{id,path});return {status:r.status,...await r.json()}}
async function usage(){return DB.prepare('SELECT * FROM mv_hybrid_transfer_usage WHERE month=?').bind(period).first()}
async function reset(size=4){await sql([{sql:'DELETE FROM mv_hybrid_tickets'},{sql:'DELETE FROM mv_hybrid_transfer_usage'},{sql:'DELETE FROM mv_hybrid_files'},{sql:'INSERT INTO mv_hybrid_files(job_id,relative_path,name,bytes) VALUES(?,?,?,?)',args:[id,path,'sample.epub',size]}],true)}
try{
 await DB.prepare("INSERT INTO mv_hybrid_jobs(id,kind,request_json,status,created_at,updated_at) VALUES(?,'novel','{}','complete',0,0)").bind(id).run();
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
 assert.ok(expired.every(x=>x.status===200));assert.equal((await usage()).reserved_bytes,32,'concurrent expiry releases once');
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
 console.log('PASS real SQLite recovery fault injection: confirmed/in-flight process loss, orphan claims, idle alarms, automatic cancel, durable terminal retry, concurrent redemption; metadata only');
 console.log('PASS real SQLite ticket transactions: OFF gate, token isolation, one-use, expiry concurrency, rollback, budget race, offline/missing-file release, exact-once stream accounting');
}finally{process.stdin.end();lines.close()}
