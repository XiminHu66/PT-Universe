import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'};
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});const d=await r.json();assert.ok(r.ok,'Acceptance API HTTP '+r.status);return d;}
assert.equal((await api('/health')).streaming,'not-live');
const ids=['57c0885e6696bb0ddd206c4b'];
const samples=[{kind:'manga',title:'國防online 漫畫敘花蓮震災',files:['File:國防online漫畫敘花蓮震災 01.jpg','File:國防online漫畫敘花蓮震災 02.jpg']},{kind:'video',url:'https://download.samplelib.com/mp4/sample-5s.mp4'}];
try{
 for(const sample of samples){const created=await api('/jobs',sample);ids.push(created.id);console.log('CREATED_SAMPLE',sample.kind,created.id);const deadline=Date.now()+240000;let complete=false;while(Date.now()<deadline){const {jobs}=await api('/jobs');const job=jobs.find(x=>x.id===created.id);assert.ok(job);if(job.status==='complete'){complete=true;break}assert.ok(!['error','cancelled'].includes(job.status),'Sample '+sample.kind+' download failed: '+job.error);await new Promise(r=>setTimeout(r,3000))}assert.ok(complete,'Sample download timeout')}
 for(const id of ids){const d=await api('/jobs/files?id='+id);assert.equal(d.files.length,1);assert.ok(d.files[0].size>0&&d.files[0].size<=10*1024*1024);console.log('SAMPLE',id,d.files[0].name,d.files[0].size)}
 console.log('SAMPLE_JOB_IDS='+ids.join(','));
 console.log('PASS bounded EPUB/CBZ/MP4 samples ready; streaming still OFF');
}finally{for(const id of ids){try{const {jobs}=await api('/jobs');const j=jobs.find(x=>x.id===id);if(j&&['queued','running'].includes(j.status))await api('/jobs/cancel',{id})}catch{}}}
