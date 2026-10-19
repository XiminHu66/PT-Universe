// Metadata/auth only. Never fetch the browser-policy-blocked HTML or assets.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export async function verifyAcceptanceReady({owner,agent,fetcher=fetch,pause=()=>new Promise(r=>setTimeout(r,2000)),attempts=20}){
 assert.ok(owner?.length>=32&&agent?.length>=32);
 const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
 async function get(path){const r=await fetcher(base+path,{headers:{Authorization:'Bearer '+owner},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();}
 const before=await get('/quota');assert.equal(before.reserved_bytes,0);
 let stable=0;
 for(let attempt=0;attempt<attempts;attempt++){
  const health=await get('/health');assert.equal(health.ok,true);assert.equal(health.streaming,'not-live');
  const statuses=[];
  for(const token of [undefined,owner,agent])for(const [method,path] of [['GET','/app-auth/session'],['GET','/app-api/jobs'],['GET','/app-api/quota'],['POST','/app-api/jobs'],['POST','/app-api/download-ticket']]){
   const r=await fetcher(base+path,{method,headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   await r.body?.cancel();assert.ok([403,404].includes(r.status),'Unapproved account access unexpectedly allowed');statuses.push(r.status);
  }
  stable=statuses.every(status=>status===403)?stable+1:0;
  if(stable>=2)break;
  if(attempt<attempts-1)await pause();
 }
 assert.ok(stable>=2,'Enabled account denial did not settle');
 const after=await get('/quota');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);
 console.log('PASS bounded acceptance metadata/auth readiness; streaming OFF, unapproved browser/Owner/Agent denied; no HTML/assets, cookie, ticket, job or media');
 return {transferred_bytes:after.transferred_bytes,reserved_bytes:after.reserved_bytes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('ACCEPTANCE_LEDGER',JSON.stringify(await verifyAcceptanceReady({owner:process.env.OWNER,agent:process.env.AGENT})));
