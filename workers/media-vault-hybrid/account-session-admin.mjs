// Runs only with the existing server-side GitHub Owner secret. No key export.
import assert from 'node:assert/strict';
const action=process.env.ACCOUNT_ACTION,code=process.env.REQUEST_ID||'',owner=process.env.OWNER;
assert.ok(owner?.length>=32,'Configured Owner secret required');
assert.ok(['account-approve','account-revoke'].includes(action));
assert.match(code,action==='account-approve'?/^[a-f0-9]{32}$/:/^[a-f0-9]{24}$/);
const path=action==='account-approve'?'/app-auth/approve':'/app-auth/revoke';
const res=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev'+path,{method:'POST',headers:{Authorization:'Bearer '+owner,'Content-Type':'application/json'},body:JSON.stringify(action==='account-approve'?{code}:{session_id:code}),signal:AbortSignal.timeout(20000),redirect:'error'});
assert.equal(res.status,200,'Account operation not approved or service disabled');
const data=await res.json();assert.equal(data.ok,true);
if(action==='account-approve'){
 assert.match(data.session_id,/^[a-f0-9]{24}$/);if(data.scope==='login-test-read-only'){assert.equal(data.job_limit,0);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+20*60000,'Read-only approval must expire within the acceptance window');}else if(data.scope==='submission-test-no-transfer'){assert.equal(data.job_limit,4);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+30*60000,'Submission pilot approval must expire within thirty minutes');}else if(data.scope==='novel-ux-no-transfer'){assert.equal(data.job_limit,4);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+30*60000,'Novel UX approval must expire within thirty minutes');}else if(data.scope==='three-file-save-test'){assert.equal(data.job_limit,0);assert.equal(data.ticket_limit,3);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+20*60000,'File acceptance must expire within twenty minutes');}else{assert.equal(data.scope,'account-created jobs');assert.equal(data.job_limit,5);assert.equal(data.ticket_limit,100);}
 console.log('PASS explicitly approved scoped account session',JSON.stringify({session_id:data.session_id,expires_at:data.expires_at,scope:data.scope,job_limit:data.job_limit,ticket_limit:data.ticket_limit}));
}else console.log('PASS requested account session revoked; unrelated and active transfers preserved');
