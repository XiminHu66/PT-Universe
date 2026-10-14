import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {get} from 'node:https';
process.on('uncaughtException',error=>{console.error('::error::Large acceptance failed',error.name,error.name==='AssertionError'?error.message.replace(/[a-f0-9]{64}/g,'[digest]'):'network or runtime error');process.exit(1)});
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev',id=process.env.LARGE_JOB_ID,expected=process.env.EXPECTED_SHA256;
assert.match(id,/^[a-f0-9]{24}$/);assert.match(expected,/^[a-f0-9]{64}$/);
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,'Metadata HTTP '+r.status);return r.json()}
async function settled(){for(let i=0;i<40;i++){const q=await api('/quota');if(q.reserved_bytes===0)return q;await pause(500)}throw Error('Ledger settlement timeout')}
function download(ticket){return new Promise((resolve,reject)=>{const req=get(base+'/download?ticket='+ticket,{headers:{'User-Agent':'PTUniverseBoundedLargeAcceptance/0.1'}},resolve);req.on('error',reject);req.setTimeout(120000,()=>req.destroy(new Error('Download idle timeout')))});}
const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const file=files[0];assert.ok(file.size>10*1024*1024&&file.size<=32*1024*1024);
const before=await settled();const baseline=process.memoryUsage().rss;let peak=baseline,total=0;
for(const slow of [false,true]){
 const {ticket}=await api('/download-ticket',{id,path:file.path});
 const start=Date.now(),response=await download(ticket);assert.equal(response.statusCode,200);assert.equal(response.headers['content-length'],String(file.size));
 const hash=createHash('sha256');let bytes=0,reads=0,next=60000;
 const deadline=setTimeout(()=>response.destroy(new Error('Bounded test duration exceeded')),600000);
 try {
  for await(const chunk of response){
   // Hash bounded slices without collecting the file or writing media artifacts.
   for(let off=0;off<chunk.length;off+=65536){const part=chunk.subarray(off,off+65536);hash.update(part);bytes+=part.length;reads++;peak=Math.max(peak,process.memoryUsage().rss);if(slow)await pause(600)}
   if(Date.now()-start>=next){console.log('LARGE_PROGRESS '+JSON.stringify({case:slow?'slow':'normal',received:bytes,elapsed_ms:Date.now()-start,rss_bytes:process.memoryUsage().rss}));next+=60000}
  }
 }finally{clearTimeout(deadline)}
 assert.equal(bytes,file.size);assert.equal(hash.digest('hex'),expected);const elapsed=Date.now()-start;
 if(slow)assert.ok(elapsed>=180000,'Slow-consumer test must last at least three minutes');
 total+=bytes;const q=await settled();assert.equal(q.transferred_bytes-before.transferred_bytes,total);
 const replay=await download(ticket);assert.equal(replay.statusCode,403);replay.resume();
 console.log('LARGE_PROOF '+JSON.stringify({case:slow?'long-paced-consumer':'larger-file',id,size:bytes,reads,elapsed_ms:elapsed,source_hash_match:true,reserved_bytes:0,one_use_replay_http:403}));
 await pause(500);
}
assert.ok(peak-baseline<96*1024*1024,'Receiver RSS growth exceeds bounded acceptance limit');
const after=await settled();assert.equal(after.transferred_bytes-before.transferred_bytes,2*file.size);
console.log('LARGE_LEDGER '+JSON.stringify({before:before.transferred_bytes,after:after.transferred_bytes,delta:total,reserved_bytes:0,receiver_baseline_rss:baseline,receiver_peak_rss:peak}));
console.log('PASS selected larger file and three-minute-plus paced receiver; two full source hashes; exact transfer ledger; no media archive');
