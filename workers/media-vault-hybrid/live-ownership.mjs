import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.match(process.env.FIXTURE_REF||'',/^[a-f0-9]{40}$/);
const source='https://raw.githubusercontent.com/XiminHu66/PT-Universe/'+process.env.FIXTURE_REF+'/workers/media-vault-hybrid/fixtures/owned-webseed.torrent';
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});assert.ok(r.ok,'Metadata HTTP '+r.status);return r.json()}
assert.equal((await api('/health')).streaming,'not-live');const before=await api('/quota');assert.equal(before.reserved_bytes,0);
let id=(await api('/jobs')).jobs.find(j=>j.url===source)?.id;
if(!id)id=(await api('/jobs',{kind:'torrent',url:source})).id;
console.log('OWNED_TORRENT_JOB_ID='+id);
let done=false;
try{
 for(let i=0;i<60;i++){const job=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(job);if(job.status==='complete'){done=true;break}assert.ok(!['error','cancelled','expired'].includes(job.status),'Controlled torrent did not complete');await new Promise(r=>setTimeout(r,2000))}
 assert.ok(done,'Controlled torrent timeout');const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);assert.equal(files[0].path,'aria/ptmv-'+id+'/package.json');assert.equal(files[0].size,168);
 const after=await api('/quota');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);assert.equal(after.tracking,'not_active');assert.equal((await api('/health')).streaming,'not-live');
 console.log('PASS controlled BitTorrent WebSeed payload completed in its own job namespace; metadata child followed; streaming OFF; transfer ledger unchanged');
}finally{if(!done)await api('/jobs/cancel',{id}).catch(()=>{})}
