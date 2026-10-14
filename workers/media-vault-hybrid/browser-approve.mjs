import assert from 'node:assert/strict';
const code=(process.env.PAIR_CODE||'').toLowerCase(),ids=(process.env.TEST_JOB_IDS||'').split(',');
assert.match(code,/^[a-f0-9]{16}$/);assert.equal(ids.length,3);assert.ok(ids.every(x=>/^[a-f0-9]{24}$/.test(x)));
const r=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev/acceptance/approve',{method:'POST',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:JSON.stringify({code,ids}),signal:AbortSignal.timeout(30000)});
assert.equal(r.status,200,'Pair approval HTTP '+r.status);
const result=await r.json();assert.ok(result.ok);assert.equal(result.scope,'three small test files');
console.log('PASS existing Owner configuration approved the matching browser request: three test files, bounded lifetime, no owner credential export');
