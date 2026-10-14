import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
async function call(route,token=process.env.OWNER,method='GET',body){const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()}}
assert.equal((await call('/health')).data.streaming,'enabled');
assert.equal((await call('/quota')).data.tracking,'active');
assert.equal((await call('/download-ticket',process.env.AGENT,'POST',{id:'0'.repeat(24),path:'generated/test.epub'})).status,401);
assert.equal((await call('/agent/ws',process.env.OWNER)).status,401);
console.log('PASS temporary stream gate active; owner/agent role isolation preserved');
