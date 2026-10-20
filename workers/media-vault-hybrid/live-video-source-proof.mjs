// One fixed CC BY 4.0 video page through the actual adapter -> Agent -> Worker.
// No user source, new grant, credential upload, proxy or challenge bypass.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.ok(process.env.OWNER?.length>=32);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,body){
 for(let attempt=0;;attempt++){
  const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)}),data=await r.json();
  if(path==='/download-ticket'&&[429,503].includes(r.status)&&data.ticket_issued===false&&attempt<5){await sleep(2500);continue;}
  assert.ok(r.ok,'Metadata HTTP '+r.status);return data;
 }
}
let id;
try{
 assert.equal((await api('/health')).streaming,'enabled');
 ({id}=await api('/jobs',{kind:'video',url:'https://commons.wikimedia.org/wiki/File:Die_Temperaturkurve_der_Erde_(ZDF,_Terra_X)_720p_HD_50FPS.webm'}));
 assert.match(id,/^[a-f0-9]{24}$/);
 let ready=false;
 for(const end=Date.now()+180000;Date.now()<end;){
  const j=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(j);
  console.log('SOURCE_JOB',JSON.stringify({id,status:j.status,phase:j.phase,completed:j.completed,total:j.total}));
  if(j.status==='complete'){ready=true;break;}
  assert.ok(!['error','cancelled','expired'].includes(j.status),'CC source execution failed');await sleep(3000);
 }
 assert.ok(ready,'CC source execution deadline');
 const {files}=await api('/jobs/files?id='+id);assert.equal(files.length,1);const f=files[0];assert.ok(f.size>0&&f.size<=64*1024**2,'Bounded source file');
 let ticket,response;
 for(let attempt=0;;attempt++){
  ({ticket}=await api('/download-ticket',{id,path:f.path}));
  response=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(120000)});
  if(response.status===503&&!response.headers.get('Content-Disposition')&&attempt<2){await response.body?.cancel();await sleep(2500);continue;}
  assert.equal(response.status,200);break;
 }
 assert.match(response.headers.get('Content-Disposition'),/^attachment;/);
 let count=0,head=Buffer.alloc(0);const hash=createHash('sha256');
 for await(const chunk of response.body){count+=chunk.length;assert.ok(count<=f.size);hash.update(chunk);if(head.length<16)head=Buffer.concat([head,Buffer.from(chunk)]).subarray(0,16);}
 assert.equal(count,f.size);assert.equal(head.subarray(0,4).toString('hex'),'1a45dfa3','Expected complete WebM container');
 const replay=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(25000)});assert.equal(replay.status,403);await replay.body?.cancel();
 console.log('PASS REAL VIDEO PAGE DELIVERY',JSON.stringify({source:'wikimedia-cc-by',id,bytes:count,sha256:hash.digest('hex'),container:'webm',single_use_ticket:true}));
}finally{
 if(id){const j=(await api('/jobs')).jobs.find(j=>j.id===id);if(j&&['queued','running','active','waiting'].includes(j.status))await api('/jobs/cancel',{id});}
}
