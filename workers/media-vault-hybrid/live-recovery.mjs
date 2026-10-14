// Real interruption acceptance. Media is hashed in memory, never persisted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.on('uncaughtException',error=>{console.error('::error::Recovery acceptance failed',error.name,error.name==='AssertionError'?error.message.replace(/[a-f0-9]{64}/g,'[digest]'):'network or runtime error');process.exit(1)});
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const ids=(process.env.SAMPLE_JOB_IDS||'').split(',');assert.equal(ids.length,3);assert.ok(ids.every(x=>/^[a-f0-9]{24}$/.test(x)));
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});assert.ok(r.ok,'Acceptance API HTTP '+r.status);return r.json();}
async function settled(){for(let n=0;n<90;n++){const q=await api('/quota');if(q.reserved_bytes===0)return q;await pause(1000)}throw Error('Interrupted transfer did not settle');}
const id=ids[2],{files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const f=files[0];assert.match(f.name,/\.mp4$/);assert.equal(f.size,2848208);
const expected='05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5';
const baseline=await api('/quota');console.log('RECOVERY_BASELINE '+JSON.stringify({transferred_bytes:baseline.transferred_bytes,reserved_bytes:baseline.reserved_bytes}));assert.equal(baseline.reserved_bytes,0);let full=0,partial=0;
async function open(){
 for(let n=0;n<20;n++){
  const {ticket}=await api('/download-ticket',{id,path:f.path});
  const r=await fetch(base+'/download?ticket='+ticket,{signal:AbortSignal.timeout(180000),headers:{'User-Agent':'PTUniverseAcceptance/0.1'}});
  if(r.status===200)return {r,ticket};await r.body?.cancel();assert.equal(r.status,503);await pause(2000);
 }
 throw Error('Recovered outbound agent unavailable');
}
async function noReplay(ticket){const r=await fetch(base+'/download?ticket='+ticket,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,403);await r.body?.cancel();}
// VPS watcher kills the agent after precisely the first acknowledged WS frame.
let {r,ticket}=await open(),bytes=0,failed=false;
try{for await(const chunk of r.body){bytes+=chunk.length}}catch{failed=true;}
console.log('FAULT_OBSERVATION '+JSON.stringify({failed,received_bytes:bytes,expected_bytes:f.size}));
assert.ok(failed&&bytes<f.size,'Expected a truncated HTTP transfer from process loss');
let q=await settled();assert.equal(q.transferred_bytes-baseline.transferred_bytes,262144,'Process-loss ledger must match the acknowledged frame');partial+=262144;await noReplay(ticket);
console.log('RECOVERY_PROOF '+JSON.stringify({case:'agent-process-loss',received_bytes:bytes,charged_bytes:262144,reserved_bytes:0,replay_http:403}));
async function retryHash(label){
 const stream=await open(),h=createHash('sha256');let size=0;
 for await(const chunk of stream.r.body){h.update(chunk);size+=chunk.length}
 assert.equal(size,f.size);assert.equal(h.digest('hex'),expected);full+=size;
 const q=await settled();assert.equal(q.transferred_bytes-baseline.transferred_bytes,full+partial);await noReplay(stream.ticket);
 console.log('RECOVERY_PROOF '+JSON.stringify({case:label,size,sha256:expected,reserved_bytes:0,replay_http:403}));
}
await retryHash('retry-after-process-loss');
// Abort the consumer while the source is paced; no manual settlement endpoint.
({r,ticket}=await open());const reader=r.body.getReader(),first=await reader.read();assert.ok(first.value?.length>0);await reader.cancel();
q=await settled();const delta=q.transferred_bytes-baseline.transferred_bytes-full-partial;assert.ok(delta>0&&delta<f.size,'Cancelled stream must release its unused reservation');assert.equal(delta%262144,0,'Cancelled stream credits acknowledged full frames');partial+=delta;await noReplay(ticket);
console.log('RECOVERY_PROOF '+JSON.stringify({case:'consumer-cancel',received_bytes:first.value.length,charged_bytes:delta,reserved_bytes:0,replay_http:403}));
await retryHash('retry-after-consumer-cancel');
q=await settled();assert.equal(q.transferred_bytes-baseline.transferred_bytes,full+partial);
console.log('RECOVERY_LEDGER '+JSON.stringify({before:baseline.transferred_bytes,after:q.transferred_bytes,delta:full+partial,complete_bytes:full,interrupted_bytes:partial,reserved_bytes:q.reserved_bytes}));
console.log('PASS real process-loss and consumer-cancel recovery; full retry hashes match; exact checkpoint-based accounting; no cloud media persistence');
