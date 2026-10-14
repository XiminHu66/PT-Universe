import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const headers={Authorization:'Bearer '+process.env.OWNER,Origin:'https://ximinhu66.github.io','Content-Type':'application/json'};
const agent={Authorization:'Bearer '+process.env.AGENT,'Content-Type':'application/json'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(route,method='GET',body,auth=headers){
 const r=await fetch(base+route,{method,headers:auth,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json();return {status:r.status,data};
}
async function row(id){
 const r=await call('/jobs');assert.equal(r.status,200);
 const job=r.data.jobs.find(x=>x.id===id);assert.ok(job,'Acceptance job is missing');return job;
}
async function create(indices){
 const r=await call('/jobs','POST',{kind:'novel',url:'https://www.wenku8.net/book/3551.htm',indices,skip_images:true,layout:{indent:0,lineHeight:1.5,paragraphGap:.5}});
 assert.equal(r.status,202,JSON.stringify(r.data));return r.data.id;
}
async function wait(id,states,seconds=240){
 const deadline=Date.now()+seconds*1000;let previous='';
 while(Date.now()<deadline){
  const job=await row(id);
  if(previous!==job.status){console.log('TASK',id,job.status);previous=job.status;}
  if(states.includes(job.status))return job;
  if(['error','cancelled','complete'].includes(job.status))throw Error('Unexpected task terminal state '+job.status+' '+JSON.stringify(job.error));
  await delay(2000);
 }
 throw Error('Acceptance task timed out');
}
async function files(id){
 const r=await call('/jobs/files?id='+id);assert.equal(r.status,200);return r.data.files;
}
const initial=await call('/health');assert.equal(initial.status,200);assert.equal(initial.data.streaming,'not-live');
assert.equal((await call('/health','GET',undefined,{})).status,401);
assert.equal((await call('/jobs','GET',undefined,agent)).status,401);
assert.equal((await call('/agent/lease','POST',{},headers)).status,401);
assert.equal((await call('/health','GET',undefined,{...headers,Origin:'https://untrusted.example'})).status,403);
const before=await call('/quota');assert.equal(before.data.tracking,'not_active');
const previous=process.env.PREVIOUS_JOB_IDS||'';
if(previous)assert.match(previous,/^[a-f0-9]{24}(,[a-f0-9]{24}){3}$/);
const ids=previous?previous.split(','):[];
try {
 if(!previous){
 const queued=await create([1]);ids.push(queued);
 assert.equal((await call('/jobs/cancel','POST',{id:queued})).status,200);
 assert.equal((await row(queued)).status,'cancelled');assert.equal((await files(queued)).length,0);
 console.log('PASS queued cancellation',queued);
 const success=await create([1]);ids.push(success);
 const done=await wait(success,['complete']);assert.ok(done.completed>0);
 const fs=await files(success);assert.equal(fs.length,1);assert.ok(fs[0].name.endsWith('.epub'));assert.ok(fs[0].size>1000);
 assert.equal((await call('/download-ticket','POST',{id:success,path:fs[0].path})).status,503);
 console.log('PASS real enqueue/lease/adapter/completion/file metadata; streaming ticket blocked',success,fs[0].size);
 const error=await create([100000]);ids.push(error);
 const failed=await wait(error,['error']);assert.ok(failed.error);
 assert.equal((await files(error)).length,0);console.log('PASS actual background failure reported',error);
 const cancel=await create([1,2]);ids.push(cancel);
 await wait(cancel,['running']);assert.equal((await call('/jobs/cancel','POST',{id:cancel})).status,200);
 await delay(25000);assert.equal((await row(cancel)).status,'cancelled');
 assert.equal((await files(cancel)).length,0);console.log('PASS running cancellation persisted',cancel);
 }
 // Eight politely spaced chapter reads give the operator a real restart window.
 // Completion timing is independently checked against Docker StartedAt on VPS.
 const restart=await create([1,2,3,4,5,6,7,8]);ids.push(restart);
 await wait(restart,['running']);
 console.log('RESTART_WINDOW_OPEN',restart);
 console.log('Restart ONLY the metadata agent with Oracle acceptance operation=restart now.');
 await delay(90000);
 const recovered=await wait(restart,['complete']);
 assert.ok(recovered.completed>1000);assert.equal((await files(restart)).length,1);
 console.log('PASS job completion after restart window',restart);
 const after=await call('/quota');assert.equal(after.data.tracking,'not_active');
 for(const key of ['transferred_bytes','reserved_bytes'])assert.equal(after.data[key],before.data[key]);
 assert.equal((await call('/health')).data.streaming,'not-live');
 console.log('ACCEPTANCE_JOB_IDS='+ids.join(','));
 console.log('PASS real metadata task lifecycle, quota unchanged and streaming OFF; verify these IDs on VPS to confirm local cancellation and restart.');
} finally {
 for(const id of ids){
  try{const job=await row(id);if(['queued','running','waiting','active'].includes(job.status))await call('/jobs/cancel','POST',{id});}catch{}
 }
}

