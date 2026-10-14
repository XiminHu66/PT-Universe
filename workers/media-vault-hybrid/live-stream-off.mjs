import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const owner=process.env.OWNER,agent=process.env.AGENT;
assert.ok(owner?.length>=32&&agent?.length>=32,'Configured credentials required');
async function call(route,method='GET',token=owner,body){
 const res=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 return {status:res.status,body:await res.json()};
}
const hiddenRoutes=['/acceptance','/acceptance/native-download.js','/acceptance/app/','/acceptance/app/app.js','/acceptance/app/scoped-session.js','/acceptance/session'];
async function hiddenStatus(path){
 const r=await fetch(base+path,{headers:{'User-Agent':'PTUniverseAcceptance/0.1'},cache:'no-store',signal:AbortSignal.timeout(30000)});
 await r.body?.cancel();return r.status;
}
let before,after,stable=0;
for(let i=0;i<20;i++){
 const [health,quota,ticket,download,ws,hidden]=await Promise.all([
  call('/health'),call('/quota'),
  call('/download-ticket','POST',owner,{id:'0'.repeat(24),path:'generated/nonexistent.epub'}),
  call('/download?ticket='+'0'.repeat(64)),call('/agent/ws','GET',agent),Promise.all(hiddenRoutes.map(hiddenStatus))
 ]);
 assert.equal(health.status,200);assert.equal(quota.status,200);
 if(!before)before=quota.body;
 const closed=health.body.streaming==='not-live'&&quota.body.tracking==='not_active'&&[ticket,download,ws].every(r=>r.status===503)&&hidden.every(s=>s===404);
 stable=closed?stable+1:0;after=quota.body;
 if(stable>=2)break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.ok(stable>=2,'All stream gates must remain OFF together after deployment propagation');
assert.equal(after.transferred_bytes,before.transferred_bytes);
assert.equal(after.reserved_bytes,before.reserved_bytes);
console.log('LEDGER_AFTER_OFF '+JSON.stringify({transferred_bytes:after.transferred_bytes,reserved_bytes:after.reserved_bytes,tracking:after.tracking}));
console.log('PASS live streaming OFF: health, ticket/download/WebSocket gates; transfer ledger unchanged');
console.log('PASS temporary acceptance pages, full preview assets and browser session lookup return 404');
