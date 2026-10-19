// Metadata and authentication boundaries only. No browser page or new grant.
import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev',origin='https://ximinhu66.github.io';
assert.ok(process.env.OWNER?.length>=32);
let settled=false;
for(let n=0;n<20;n++){
 const r=await fetch(base+'/health',{headers:{Authorization:'Bearer '+process.env.OWNER},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);if((await r.json()).streaming==='enabled'){settled=true;break;}
 await new Promise(r=>setTimeout(r,1500));
}
assert.ok(settled,'Normal file delivery must be enabled');
for(const path of ['/vault-api/session','/vault-api/jobs','/vault-api/download-ticket','/vault-api/devices']){
 const r=await fetch(base+path,{method:path.endsWith('ticket')?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer '+process.env.OWNER,'Content-Type':'application/json'},body:path.endsWith('ticket')?'{}':undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,403,'Owner must not substitute for a device grant');assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);await r.body?.cancel();
}
const preflight=await fetch(base+'/vault-api/jobs',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization,Content-Type'},redirect:'error'});assert.equal(preflight.status,204);
const anonymous=await fetch(base+'/app-auth/session',{redirect:'error'});assert.equal(anonymous.status,403);await anonymous.body?.cancel();
// GET only: prove the retired issue/pairing routes cannot approve a device.
for(const path of ['/app-auth/pair','/app-auth/approve']){
 const r=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,410);await r.body?.cancel();
}
const proof=await fetch(base+'/media-vault-login/result',{headers:{Origin:origin,Authorization:'Bearer '+'0'.repeat(64)},redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(proof.status,202);assert.equal(proof.headers.get('Access-Control-Allow-Origin'),origin);assert.deepEqual(await proof.json(),{status:'pending'});
console.log('PASS normal personal delivery enabled; exact-origin preflight; anonymous and Owner denied device API; old issue/pairing paths closed; private login schema/result boundary ready; no account HTML, grant, cookie, ticket, job or media accessed');
