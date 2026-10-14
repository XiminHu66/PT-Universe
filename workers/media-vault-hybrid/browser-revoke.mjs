import assert from 'node:assert/strict';
const r=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev/acceptance/revoke',{method:'POST',headers:{Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
assert.equal(r.status,200);assert.ok((await r.json()).ok);
console.log('PASS temporary browser sessions revoked and unused scoped reservations released');
