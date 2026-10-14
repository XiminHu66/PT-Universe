// Bounded real flow acceptance. Hash existing files in memory; no media archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.on('uncaughtException',error=>{console.error('::error::Flow acceptance failed',error.name,error.name==='AssertionError'?error.message.replace(/[a-f0-9]{64}/g,'[digest]'):'network or runtime error');process.exit(1)});
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev',ids=(process.env.SAMPLE_JOB_IDS||'').split(',');assert.equal(ids.length,3);assert.ok(ids.every(x=>/^[a-f0-9]{24}$/.test(x)));
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,retry:Number(r.headers.get('Retry-After')||0),data:await r.json()};}
async function ok(route,body){const r=await api(route,body);assert.equal(r.status,200,'Metadata HTTP '+r.status);return r.data;}
async function quota(){return ok('/quota');}
async function settled(expected){for(let i=0;i<30;i++){const q=await quota();if(q.reserved_bytes===expected)return q;await pause(500)}throw Error('Flow ledger did not settle');}
async function download(ticket){return fetch(base+'/download?ticket='+ticket,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':'PTUniverseAcceptance/0.1'}});}
async function replay(ticket){const r=await download(ticket);assert.equal(r.status,403);await r.body?.cancel();}
const epub=(await ok('/jobs/files?id='+ids[0])).files[0],mp4=(await ok('/jobs/files?id='+ids[2])).files[0];assert.equal(epub.size,52742);assert.equal(mp4.size,2848208);
const before=await quota();assert.equal(before.reserved_bytes,0);let total=0;
const first=await ok('/download-ticket',{id:ids[2],path:mp4.path});
const pair=await Promise.all([download(first.ticket),download(first.ticket)]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,403],'Simultaneous redemption must admit exactly one consumer');await pair.find(r=>r.status===403).body.cancel();
const main=pair.find(r=>r.status===200);assert.equal(main.headers.get('Content-Length'),String(mp4.size));
const busyTicket=await ok('/download-ticket',{id:ids[0],path:epub.path});const busy=await download(busyTicket.ticket);assert.equal(busy.status,429,'Competing transfer must report busy');assert.equal(Number(busy.headers.get('Retry-After')),2);await busy.body.cancel();
const held=await quota();assert.equal(held.reserved_bytes,mp4.size,'Busy request must not release the active transfer');await replay(busyTicket.ticket);
console.log('FLOW_PROOF '+JSON.stringify({case:'concurrent-redemption-and-busy',redemption_http:[200,403],busy_http:429,retry_after:2,active_reserved_bytes:held.reserved_bytes}));
const h=createHash('sha256');let received=0,reads=0;const started=Date.now();for await(const chunk of main.body){h.update(chunk);received+=chunk.length;reads++;await pause(150)}
assert.equal(received,mp4.size);assert.equal(h.digest('hex'),'05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5');total+=received;
let q=await settled(0);assert.equal(q.transferred_bytes-before.transferred_bytes,total);await replay(first.ticket);
console.log('FLOW_PROOF '+JSON.stringify({case:'paced-consumer',size:received,reads,elapsed_ms:Date.now()-started,reserved_bytes:0,source_hash_match:true}));
// Existing small EPUB only. Six pending tickets at most; excess requests are 429.
const burst=await Promise.all(Array.from({length:14},()=>api('/download-ticket',{id:ids[0],path:epub.path})));
const issued=burst.filter(r=>r.status===200),denied=burst.filter(r=>r.status===429);assert.equal(issued.length,6);assert.equal(denied.length,8);assert.ok(denied.every(r=>r.retry>0&&r.retry<=60));assert.ok(denied.some(r=>r.data.error.includes('rate exceeded')),'Twelve-per-minute gate must activate');
q=await settled(6*epub.size);assert.equal(q.transferred_bytes-before.transferred_bytes,total);
console.log('FLOW_PROOF '+JSON.stringify({case:'bounded-issuance-burst',requests:14,issued:6,limited:8,pending_reserved_bytes:q.reserved_bytes,retry_after_present:true}));
// Redeem all six issued tickets to leave no unused reservations or media artifacts.
for(const item of issued){const r=await download(item.data.ticket);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Length'),String(epub.size));const hash=createHash('sha256');let bytes=0;for await(const chunk of r.body){hash.update(chunk);bytes+=chunk.length}assert.equal(bytes,epub.size);assert.equal(hash.digest('hex'),'2ab0a5e930c3ac62555feb089f1a95ffbc578743708265678e5681866bbb73cd');total+=bytes;await pause(300);await replay(item.data.ticket);}
q=await settled(0);assert.equal(q.transferred_bytes-before.transferred_bytes,total);assert.equal(total,3164660);
console.log('FLOW_LEDGER '+JSON.stringify({before:before.transferred_bytes,after:q.transferred_bytes,delta:total,reserved_bytes:0}));
console.log('PASS real concurrent redemption, busy isolation, paced consumer and bounded request burst; seven full hashes match; exact transfer ledger; no cloud media archive');
