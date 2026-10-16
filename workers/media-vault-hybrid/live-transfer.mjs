// Real deployed relay acceptance. Hash incrementally; NEVER persist media bytes
// in Actions artifacts or workspace. This is NOT native-browser save acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const ids=(process.env.SAMPLE_JOB_IDS||'').split(',');
assert.equal(ids.length,3);assert.ok(ids.every(x=>/^[a-f0-9]{24}$/.test(x)));
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'};
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const d=await r.json();assert.ok(r.ok,'Acceptance API HTTP '+r.status);return d;}
assert.equal((await api('/health')).streaming,'enabled');
const before=await api('/quota');assert.equal(before.reserved_bytes,0,'Baseline must have no outstanding tickets');
let total=0;
for(const id of ids){
 const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const f=files[0];assert.ok(f.size>0&&f.size<=10*1024*1024);
 const {ticket}=await api('/download-ticket',{id,path:f.path});
 const res=await fetch(base+'/download?ticket='+ticket,{signal:AbortSignal.timeout(180000),headers:{'User-Agent':'PTUniverseAcceptance/0.1'}});
 assert.equal(res.status,200,'Relay download HTTP '+res.status);assert.match(res.headers.get('Content-Disposition'),/^attachment;/);
 const hash=createHash('sha256');let bytes=0;
 for await(const chunk of res.body){bytes+=chunk.length;assert.ok(bytes<=f.size);hash.update(chunk)}
 assert.equal(bytes,f.size);total+=bytes;
 // End-of-body and D1 settlement can be a short independent event boundary.
 let usage;for(let i=0;i<12;i++){usage=await api('/quota');if(usage.reserved_bytes===0)break;await new Promise(r=>setTimeout(r,500))}
 assert.equal(usage.reserved_bytes,0);assert.equal(usage.transferred_bytes-before.transferred_bytes,total);
 const replay=await fetch(base+'/download?ticket='+ticket,{signal:AbortSignal.timeout(10000)});assert.equal(replay.status,403);await replay.body.cancel();
 console.log('TRANSFER_PROOF '+JSON.stringify({id,name:f.name,size:bytes,sha256:hash.digest('hex'),replay_http:403,reserved_bytes:usage.reserved_bytes}));
}
console.log('PASS real VPS outbound WebSocket -> Cloudflare stream -> authenticated HTTP consumer; exact ledger delta',total,'bytes; no media bytes persisted');
console.log('Native browser save acceptance remains pending owner browser authentication.');
