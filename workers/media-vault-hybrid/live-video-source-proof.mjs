// Fixed licensed sources only. Exercise real video-page and trackerless P2P
// execution to completed payloads, followed by actual one-use file delivery.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.ok(process.env.OWNER?.length>=32);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ids=[];
async function api(path,body){
 for(let attempt=0;;attempt++){
  const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)}),data=await r.json();
  if(path==='/download-ticket'&&[429,503].includes(r.status)&&data.ticket_issued===false&&attempt<5){await sleep(2500);continue;}
  assert.ok(r.ok,'Metadata HTTP '+r.status);return data;
 }
}
async function submit(kind,url){const {id}=await api('/jobs',{kind,url});assert.match(id,/^[a-f0-9]{24}$/);ids.push(id);return id;}
async function wait(id,seconds){
 let last='';
 for(const end=Date.now()+seconds*1000;Date.now()<end;){
  const j=(await api('/jobs')).jobs.find(j=>j.id===id);assert.ok(j);
  const stamp=[j.status,j.phase,j.completed,j.total,j.peers].join(':');
  if(stamp!==last){console.log('SOURCE_JOB',JSON.stringify({id,status:j.status,phase:j.phase,completed:j.completed,total:j.total,peers:j.peers}));last=stamp;}
  if(j.status==='complete')return j;
  assert.ok(!['error','cancelled','expired'].includes(j.status),'Fixed source execution failed');await sleep(3000);
 }
 throw Error('Fixed source execution deadline');
}
async function deliver(id,f,container){
 assert.ok(f.size>0&&f.size<=160*1024**2,'Bounded source file');
 let ticket,response;
 for(let attempt=0;;attempt++){
  ({ticket}=await api('/download-ticket',{id,path:f.path}));
  response=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(180000)});
  if(response.status===503&&!response.headers.get('Content-Disposition')&&attempt<2){await response.body?.cancel();await sleep(2500);continue;}
  assert.equal(response.status,200);break;
 }
 assert.match(response.headers.get('Content-Disposition'),/^attachment;/);
 let count=0,head=Buffer.alloc(0);const hash=createHash('sha256');
 for await(const chunk of response.body){count+=chunk.length;assert.ok(count<=f.size);hash.update(chunk);if(head.length<256)head=Buffer.concat([head,Buffer.from(chunk)]).subarray(0,256);}
 assert.equal(count,f.size);
 if(container==='webm')assert.equal(head.subarray(0,4).toString('hex'),'1a45dfa3');
 else assert.ok(head.includes(Buffer.from('ftyp')),'Expected MP4 container');
 const replay=await fetch(base+'/download?ticket='+ticket,{redirect:'error',signal:AbortSignal.timeout(25000)});assert.equal(replay.status,403);await replay.body?.cancel();
 return {id,bytes:count,sha256:hash.digest('hex'),container,single_use_ticket:true};
}
try{
 assert.equal((await api('/health')).streaming,'enabled');
 // Public CC BY 4.0 page, not a pre-resolved media fixture.
 const video=await submit('video','https://commons.wikimedia.org/wiki/File:Die_Temperaturkurve_der_Erde_(ZDF,_Terra_X)_720p_HD_50FPS.webm');
 await wait(video,180);
 const vf=(await api('/jobs/files?id='+video)).files;assert.equal(vf.length,1);assert.ok(vf[0].size<64*1024**2);
 console.log('PASS REAL VIDEO PAGE DELIVERY',JSON.stringify(await deliver(video,vf[0],'webm')));
 // Official Creative Commons Sintel swarm: deliberately NO Tracker/WebSeed.
 // Completion is required; metadata or the first payload bytes do not pass.
 const bt=await submit('torrent','magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10');
 const done=await wait(bt,480);assert.equal(done.total,129302391);assert.equal(done.completed,done.total);
 const files=(await api('/jobs/files?id='+bt)).files;const mp4=files.filter(f=>/\.mp4$/i.test(f.name));assert.equal(mp4.length,1);assert.ok(mp4[0].size>120*1024**2);
 console.log('PASS REAL TRACKERLESS BT DELIVERY',JSON.stringify({...await deliver(bt,mp4[0],'mp4'),torrent_bytes:done.total,files:files.length}));
}finally{
 for(const id of ids){const j=(await api('/jobs')).jobs.find(j=>j.id===id);if(j&&['queued','running','active','waiting'].includes(j.status))await api('/jobs/cancel',{id});}
}
