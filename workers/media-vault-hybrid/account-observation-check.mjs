// Server-side metadata only. Never reads cookie/digest/pair_code or user files.
import assert from 'node:assert/strict';
import {OBSERVATION_DURATION} from './src/account-observation-scope.js';
const id=process.env.REQUEST_ID,token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,owner=process.env.OWNER;
assert.match(id||'',/^[a-f0-9]{24}$/);assert.ok(token&&account&&owner?.length>=32);
async function query(sql,params){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const d=await r.json();assert.ok(r.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false);return d.result[0].results;
}
const rows=await query('SELECT id,account_id,status,created_at,expires_at,created_jobs,issued_tickets FROM mv_hybrid_app_sessions WHERE id=?',[id]);assert.equal(rows.length,1);
const s=rows[0];assert.match(s.account_id,/^observe-test-[a-f0-9]{32}$/);assert.equal(s.created_jobs,0);assert.equal(s.issued_tickets,0);
assert.ok(s.expires_at-s.created_at>=OBSERVATION_DURATION&&s.expires_at-s.created_at<=OBSERVATION_DURATION+5*60000,'Approved 24h observation required');
const [counts]=await query('SELECT (SELECT COUNT(*) FROM mv_hybrid_account_jobs WHERE account_id=?) AS jobs,(SELECT COUNT(*) FROM mv_hybrid_app_tickets t JOIN mv_hybrid_app_sessions s ON s.digest=t.session_digest WHERE s.account_id=?) AS tickets',[s.account_id,s.account_id]);assert.equal(counts.jobs,0);assert.equal(counts.tickets,0);
async function metadata(path){const r=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev'+path,{headers:{Authorization:'Bearer '+owner},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();}
assert.equal((await metadata('/health')).streaming,'not-live');const quota=await metadata('/quota');assert.equal(quota.reserved_bytes,0);
const now=Date.now(),start=s.expires_at-OBSERVATION_DURATION;
console.log('OBSERVATION_METADATA',JSON.stringify({session_id:id,checked_at:now,started_at:start,expires_at:s.expires_at,approved_minimum_ms:OBSERVATION_DURATION,status:s.status,effective_status:s.status==='approved'&&now>=s.expires_at?'expired':s.status,elapsed_ms:Math.max(0,now-start),minimum_elapsed_reached:now>=s.expires_at,unrevoked_at_check:s.status==='approved',jobs:0,tickets:0,transferred_bytes:quota.transferred_bytes,reserved_bytes:0}));
console.log('PASS read-only observation metadata; actual browser restart, restoration, expiry and revocation observations still require user evidence; this check grants nothing and does not accept a release gate');
