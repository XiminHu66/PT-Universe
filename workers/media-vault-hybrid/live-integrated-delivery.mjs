// Controlled public sample only. Incremental hashing; no stored media or login.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.ok(process.env.OWNER?.length>=32);
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});assert.ok(r.ok,'Metadata HTTP '+r.status);return r.json();}
assert.equal((await api('/health')).streaming,'enabled');const before=await api('/quota');assert.equal(before.reserved_bytes,0);
const {id}=await api('/jobs',{kind:'video',url:'https://download.samplelib.com/mp4/sample-5s.mp4'});assert.match(id,/^[a-f0-9]{24}$/);console.log('CONTROLLED_DELIVERY_JOB',id);
const until=Date.now()+240000;let job;
while(Date.now()<until){job=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(job);if(job.status==='complete')break;assert.ok(!['error','cancelled'].includes(job.status),'Controlled sample failed');await new Promise(r=>setTimeout(r,2500));}
assert.equal(job.status,'complete');const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const file=files[0];assert.equal(file.size,2848208);
const {ticket}=await api('/download-ticket',{id,path:file.path});assert.match(ticket,/^[a-f0-9]{64}$/);
const r=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(120000)});assert.equal(r.status,200);assert.match(r.headers.get('Content-Disposition'),/^attachment;/);
let bytes=0;const hash=createHash('sha256');for await(const chunk of r.body){bytes+=chunk.length;assert.ok(bytes<=file.size);hash.update(chunk);}assert.equal(bytes,file.size);const sha=hash.digest('hex');assert.equal(sha,'05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5');
let after;for(let n=0;n<20;n++){after=await api('/quota');if(!after.reserved_bytes&&after.transferred_bytes===before.transferred_bytes+bytes)break;await new Promise(r=>setTimeout(r,500));}
assert.equal(after.reserved_bytes,0);assert.equal(after.transferred_bytes-before.transferred_bytes,bytes);
const replay=await fetch(base+'/download?ticket='+ticket,{redirect:'error'});assert.equal(replay.status,403);await replay.body?.cancel();
console.log('PASS controlled VPS → outbound WSS → browser delivery transport',JSON.stringify({id,bytes,sha256:sha,ledger_delta:bytes,reserved_bytes:after.reserved_bytes,replay_http:403}));
console.log('Transport proof only; local browser fixtures separately validate the Media Vault interaction and native disk save.');
