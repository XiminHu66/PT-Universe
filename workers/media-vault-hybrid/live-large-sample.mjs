import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const headers={Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'};
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,'Metadata HTTP '+r.status);return r.json()}
assert.equal((await api('/health')).streaming,'not-live');
let id=process.env.LARGE_JOB_ID||'';
if(id)assert.match(id,/^[a-f0-9]{24}$/);
else {id=(await api('/jobs',{kind:'video',url:'https://samplelib.com/mp4/sample-30s.mp4'})).id;console.log('LARGE_JOB_ID='+id)}
let complete=false;
try{
 for(let i=0;i<100;i++){
  const job=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(job);
  if(job.status==='complete'){complete=true;break}
  assert.ok(!['error','cancelled'].includes(job.status),'Selected source preparation failed');
  await new Promise(r=>setTimeout(r,3000));
 }
 assert.ok(complete,'Selected source preparation timeout');
 const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);assert.ok(files[0].size>10*1024*1024&&files[0].size<=32*1024*1024);
 console.log('LARGE_SOURCE '+JSON.stringify({id,...files[0]}));
 console.log('PASS one selected larger video prepared; streaming remains OFF');
}finally{
 if(!complete)await api('/jobs/cancel',{id}).catch(()=>{});
}
