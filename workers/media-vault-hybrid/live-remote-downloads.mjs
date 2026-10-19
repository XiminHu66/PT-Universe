import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.match(process.env.FIXTURE_REF||'',/^[a-f0-9]{40}$/);
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});assert.ok(r.ok,'Metadata HTTP '+r.status);return r.json();}
assert.equal((await api('/health')).streaming,'not-live');const before=await api('/quota');assert.equal(before.reserved_bytes,0);
const recipes=[{kind:'torrent',url:'https://raw.githubusercontent.com/XiminHu66/PT-Universe/'+process.env.FIXTURE_REF+'/workers/media-vault-hybrid/fixtures/owned-webseed.torrent'},{kind:'video',url:'https://download.samplelib.com/mp4/sample-5s.mp4'}];
const created=[];
try{
 for(const recipe of recipes){
  const id=(await api('/jobs',recipe)).id;created.push(id);assert.match(id,/^[a-f0-9]{24}$/);console.log('REMOTE_DOWNLOAD_JOB',recipe.kind,id);
  const until=Date.now()+240000;let job;
  while(Date.now()<until){job=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(job);if(job.status==='complete')break;assert.ok(!['error','cancelled'].includes(job.status),'VPS source job failed; inspect metadata');await new Promise(r=>setTimeout(r,3000));}
  assert.equal(job.status,'complete','VPS source job timed out');
  const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);assert.ok(files[0].size>0&&files[0].size<=3*1024*1024);
  console.log('PASS VPS download completed',recipe.kind,files[0].size,'bytes; metadata only, no browser transfer');
 }
 const after=await api('/quota');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);assert.equal((await api('/health')).streaming,'not-live');
 console.log('PASS one controlled BitTorrent WebSeed and one public 5-second MP4 completed on VPS; no new ports or transfer ledger change');
}finally{
 for(const id of created){const j=(await api('/jobs')).jobs.find(j=>j.id===id);if(j&&['queued','running','active','waiting'].includes(j.status))await api('/jobs/cancel',{id});}
}
