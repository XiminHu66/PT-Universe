import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const ids=(process.env.RETENTION_JOB_IDS||'').split(',');assert.equal(ids.length,4);assert.ok(ids.every(id=>/^[a-f0-9]{24}$/.test(id)));
async function call(path,token=process.env.OWNER,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json()}}
async function ok(path){const r=await call(path);assert.equal(r.status,200);return r.data}
assert.equal((await ok('/health')).streaming,'not-live');const before=await ok('/quota');assert.equal(before.reserved_bytes,0);
const snapshot=[];
for(const id of ids){const f=await ok('/jobs/files?id='+id);assert.equal(f.files.length,1);snapshot.push(f)}
assert.equal((await call('/agent/expire',process.env.OWNER,{id:ids[0]})).status,401);
assert.equal((await call('/agent/expire','',{id:ids[0]})).status,401);
// These explicitly selected sources are still inside their 24-hour retention.
for(const id of ids)assert.equal((await call('/agent/expire',process.env.AGENT,{id})).status,409,'Early expiry must retain selected source');
for(let i=0;i<ids.length;i++)assert.deepEqual(await ok('/jobs/files?id='+ids[i]),snapshot[i]);
const after=await ok('/quota');assert.equal(after.transferred_bytes,before.transferred_bytes);assert.equal(after.reserved_bytes,0);assert.equal(after.tracking,'not_active');
assert.equal((await ok('/health')).streaming,'not-live');
console.log('PASS live retention age floor: four early-expiry requests refused; source metadata preserved; wrong/absent role refused; ledger unchanged; streaming OFF');
