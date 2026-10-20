// Real small public fixtures only, through the existing Owner operational API.
// No device grant, user media, credentials, new public ports or disk archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.ok(process.env.OWNER?.length>=32);assert.match(process.env.FIXTURE_REF||'',/^[a-f0-9]{40}$/);
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});assert.ok(r.ok,'Metadata HTTP '+r.status);return r.json();}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),ids=[];const started=Date.now();
const before=await api('/quota');assert.equal((await api('/health')).streaming,'enabled');
async function submit(spec){const {id}=await api('/jobs',spec);ids.push(id);assert.match(id,/^[a-f0-9]{24}$/);return id;}
async function wait(id,until=Date.now()+180000){let prev;while(Date.now()<until){const j=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(j);const stamp=[j.status,j.phase,j.completed,j.total,j.peers].join(':');if(stamp!==prev){console.log('EXECUTION',JSON.stringify({id,kind:j.kind,status:j.status,phase:j.phase,completed:j.completed,total:j.total,peers:j.peers}));prev=stamp;}if(j.status==='complete')return j;assert.ok(!['error','cancelled','expired'].includes(j.status),'Source execution failed: '+j.kind);await sleep(2000);}throw Error('Execution timed out for controlled fixture');}
let delivered=0;
async function save(id,expected){const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const f=files[0];assert.equal(f.size,expected.bytes);const {ticket}=await api('/download-ticket',{id,path:f.path});assert.match(ticket,/^[a-f0-9]{64}$/);const r=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok){await r.body?.cancel();throw Error('Actual file stream HTTP '+r.status);}assert.match(r.headers.get('Content-Disposition'),/^attachment;/);let size=0;const h=createHash('sha256');for await(const chunk of r.body){size+=chunk.length;assert.ok(size<=f.size);h.update(chunk);}const sha=h.digest('hex');assert.equal(size,expected.bytes);assert.equal(sha,expected.sha);delivered+=size;console.log('VERIFIED_FILE',JSON.stringify({id,bytes:size,sha256:sha}));const replay=await fetch(base+'/download?ticket='+ticket,{redirect:'error'});assert.equal(replay.status,403);await replay.body?.cancel();}
try{
 const spec={kind:'video',url:'https://download.samplelib.com/mp4/sample-5s.mp4'};
 const cancelled=await submit(spec);await api('/jobs/cancel',{id:cancelled});assert.equal((await api('/jobs')).jobs.find(j=>j.id===cancelled).status,'cancelled');
 const video=await submit(spec);assert.notEqual(video,cancelled);await wait(video);await save(video,{bytes:2848208,sha:'05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5'});
 const owned='https://raw.githubusercontent.com/XiminHu66/PT-Universe/4b187cd5e4b2aa4b2442c2f43712082f841e1d56/workers/media-vault-hybrid/package.json';const source=await fetch(owned,{redirect:'error'});assert.ok(source.ok);const payload=new Uint8Array(await source.arrayBuffer());assert.equal(payload.length,168);
 const bt=await submit({kind:'torrent',url:'https://raw.githubusercontent.com/XiminHu66/PT-Universe/'+process.env.FIXTURE_REF+'/workers/media-vault-hybrid/fixtures/owned-webseed.torrent'});await wait(bt);await save(bt,{bytes:168,sha:createHash('sha256').update(payload).digest('hex')});
 // P2P smoke: official Creative Commons Sintel magnet, no WebSeed parameter.
 // Stop as soon as real payload progress is observed; do not fetch the film.
 const magnet='magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337';
 const peer=await submit({kind:'torrent',url:magnet});let observed=false;const end=Date.now()+150000;
 while(Date.now()<end){const j=(await api('/jobs')).jobs.find(j=>j.id===peer);assert.ok(j);console.log('P2P_PROGRESS',JSON.stringify({id:peer,status:j.status,phase:j.phase,bytes:j.completed,total:j.total,peers:j.peers}));if(j.completed>0&&j.total>1024*1024&&j.phase!=='metadata'){observed=true;break;}assert.ok(!['error','cancelled'].includes(j.status));await sleep(5000);}
 await api('/jobs/cancel',{id:peer});assert.equal((await api('/jobs')).jobs.find(j=>j.id===peer).status,'cancelled');assert.ok(observed,'Public magnet did not obtain payload bytes within bounded P2P smoke');
 // Exercise another save after the old ninety-second idle disconnect boundary.
 while(Date.now()-started<100000)await sleep(3000);
 await save(video,{bytes:2848208,sha:'05bd857af7f70bf51b6aac1144046973bf3325c9101a554bc27dc9607dbbd8f5'});
 let after;for(let i=0;i<20;i++){after=await api('/quota');if(after.reserved_bytes===0&&after.transferred_bytes===before.transferred_bytes+delivered)break;await sleep(500);}assert.equal(after.reserved_bytes,0);assert.equal(after.transferred_bytes-before.transferred_bytes,delivered);
 console.log('PASS REAL DOWNLOAD RELEASE',JSON.stringify({video_bytes:2848208,bt_webseed_bytes:168,p2p_payload_observed:observed,cancel_and_fresh_submission:true,delivery_after_90s:true,ledger_delta:delivered}));
}finally{for(const id of ids){const j=(await api('/jobs')).jobs.find(j=>j.id===id);if(j&&['queued','running','active','waiting'].includes(j.status))await api('/jobs/cancel',{id});}}
