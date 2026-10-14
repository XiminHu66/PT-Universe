import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const owner=process.env.OWNER,agent=process.env.AGENT;
assert.ok(owner?.length>=32&&agent?.length>=32,'Configured credentials required');
async function call(route,method='GET',token=owner,body){
 const res=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','User-Agent':'PTUniverseAcceptance/0.1'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 return {status:res.status,body:await res.json()};
}
const health=await call('/health');assert.equal(health.status,200);assert.equal(health.body.streaming,'not-live');
const before=await call('/quota');assert.equal(before.status,200);assert.equal(before.body.tracking,'not_active');
assert.equal((await call('/download-ticket','POST',owner,{id:'0'.repeat(24),path:'generated/nonexistent.epub'})).status,503);
assert.equal((await call('/download?ticket='+'0'.repeat(64))).status,503);
assert.equal((await call('/agent/ws','GET',agent)).status,503);
const after=await call('/quota');assert.equal(after.status,200);
assert.equal(after.body.transferred_bytes,before.body.transferred_bytes);
assert.equal(after.body.reserved_bytes,before.body.reserved_bytes);
console.log('PASS live streaming OFF: health, ticket/download/WebSocket gates; transfer ledger unchanged');
