// Runs only with the existing server-side GitHub Owner secret. No key export.
import assert from 'node:assert/strict';
const action=process.env.ACCOUNT_ACTION,owner=process.env.OWNER;
let code=process.env.REQUEST_ID||'';
assert.ok(owner?.length>=32,'Configured Owner secret required');
assert.ok(['account-approve','account-revoke'].includes(action));
assert.match(code,action==='account-approve'?/^(?:[a-f0-9]{24}|[a-f0-9]{32})$/:/^[a-f0-9]{24}$/);
if(action==='account-approve'&&code.length===24){
 // Accept the PUBLIC session ID, so users never send pairing/auth codes in chat.
 // Resolve the approval code inside existing server-side CI, never log/export it.
 const token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 assert.ok(token&&account,'Configured server-side D1 access required for session-ID approval');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql:"SELECT pair_code FROM mv_hybrid_app_sessions WHERE id=? AND status='pending' AND expires_at>?",params:[code,Date.now()]}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const d=await r.json();assert.ok(r.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false,'Session-ID lookup failed');
 const rows=d.result[0].results;assert.equal(rows.length,1,'Pending public session ID missing or expired');
 code=rows[0].pair_code;assert.match(code,/^[a-f0-9]{32}$/);
}
const path=action==='account-approve'?'/app-auth/approve':'/app-auth/revoke';
const res=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev'+path,{method:'POST',headers:{Authorization:'Bearer '+owner,'Content-Type':'application/json'},body:JSON.stringify(action==='account-approve'?{code}:{session_id:code}),signal:AbortSignal.timeout(20000),redirect:'error'});
assert.equal(res.status,200,'Account operation not approved or service disabled');
const data=await res.json();assert.equal(data.ok,true);
if(action==='account-approve'){
 assert.match(data.session_id,/^[a-f0-9]{24}$/);if(data.scope==='login-test-read-only'){assert.equal(data.job_limit,0);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+20*60000,'Read-only approval must expire within the acceptance window');}else if(data.scope==='submission-test-no-transfer'){assert.equal(data.job_limit,4);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+30*60000,'Submission pilot approval must expire within thirty minutes');}else if(data.scope==='novel-ux-no-transfer'){assert.equal(data.job_limit,4);assert.equal(data.ticket_limit,0);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+30*60000,'Novel UX approval must expire within thirty minutes');}else if(data.scope==='three-file-save-test'){assert.equal(data.job_limit,0);assert.equal(data.ticket_limit,3);assert.ok(data.expires_at>Date.now()&&data.expires_at<=Date.now()+20*60000,'File acceptance must expire within twenty minutes');}else{assert.equal(data.scope,'account-created jobs');assert.equal(data.job_limit,5);assert.equal(data.ticket_limit,100);}
 console.log('PASS explicitly approved scoped account session',JSON.stringify({session_id:data.session_id,expires_at:data.expires_at,scope:data.scope,job_limit:data.job_limit,ticket_limit:data.ticket_limit}));
}else console.log('PASS requested account session revoked; unrelated and active transfers preserved');
