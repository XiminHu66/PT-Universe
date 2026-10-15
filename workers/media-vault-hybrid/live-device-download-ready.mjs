// Metadata/auth readiness only. Never fetch the browser-policy-blocked app page
// or assets, pair a browser, mint tickets, fetch media, or claim real UI acceptance.
import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const owner=process.env.OWNER,agent=process.env.AGENT;
assert.ok(owner?.length>=32&&agent?.length>=32);
async function get(path){const r=await fetch(base+path,{headers:{Authorization:'Bearer '+owner},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();}
let stable=0;
for(let i=0;i<20;i++){
 const h=await get('/health');stable=h.ok===true&&h.streaming==='enabled'?stable+1:0;
 if(stable>=2)break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.ok(stable>=2,'Temporary stream configuration did not settle');
const before=await get('/quota');assert.equal(before.reserved_bytes,0);
for(const token of [undefined,owner,agent])for(const [method,path] of [['GET','/app-auth/session'],['GET','/app-api/jobs'],['GET','/app-api/quota'],['POST','/app-api/download-ticket']]){
 const r=await fetch(base+path,{method,headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 await r.body?.cancel();assert.equal(r.status,403,'Unapproved devices/server roles must not access account data or issue tickets');
}
const after=await get('/quota');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);
console.log('PASS temporary device download metadata/auth readiness; unapproved browser/Owner/Agent denied; no session, ticket or media; app HTML/assets not accessed');
console.log('DEVICE_WINDOW_LEDGER',JSON.stringify({transferred_bytes:after.transferred_bytes,reserved_bytes:after.reserved_bytes}));
