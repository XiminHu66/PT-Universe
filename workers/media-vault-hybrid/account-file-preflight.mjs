// Metadata-only preflight; no mutations, media fetches, cookies or approvals.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {FILE_TEST_JOBS,fileTestManifest,FILE_TEST_BYTES} from './src/account-file-scope.js';
const token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert.ok(token&&account,'Existing server-side D1 credentials required');
async function query(sql,params=[]){
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(30000)});
 const d=await res.json();assert.ok(res.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false,'D1 read-only preflight failed');return d.result[0].results;
}
const rows=await query('SELECT j.id,j.kind,j.status,a.account_id,f.relative_path AS path,f.name,f.bytes AS size,j.updated_at FROM mv_hybrid_jobs j JOIN mv_hybrid_account_jobs a ON a.job_id=j.id JOIN mv_hybrid_files f ON f.job_id=j.id WHERE j.id IN (?,?,?)',FILE_TEST_JOBS);
assert.equal(rows.length,3,'Retained selected files missing; do not create replacement jobs');
const files=FILE_TEST_JOBS.map((id,i)=>{const f=rows.find(f=>f.id===id);assert.ok(f&&f.kind===['novel','manga','video'][i]&&f.status==='complete'&&Number.isSafeInteger(f.updated_at)&&f.updated_at>Date.now()-23*3600000,'Selected source too old or incomplete');return {id:f.id,path:f.path,size:f.size};});
assert.equal(fileTestManifest({MEDIA_APP_FILE_TEST_FILES:JSON.stringify(files)}).length,3,'Selected file metadata is outside bounded scope');
const realm=rows[0].account_id;assert.match(realm,/^submit-test-[a-f0-9]{32}$/);assert.ok(rows.every(r=>r.account_id===realm),'Selected files must share their existing account');
const sessions=await query("SELECT COUNT(*) n FROM mv_hybrid_app_sessions WHERE account_id=? AND status='approved' AND expires_at>?",[realm,Date.now()]);assert.equal(sessions[0].n,0,'Close prior approved account sessions before file acceptance');
const used=await query('SELECT COUNT(*) n FROM mv_hybrid_app_tickets a JOIN mv_hybrid_app_sessions s ON s.digest=a.session_digest WHERE s.account_id=?',[realm]);assert.equal(used[0].n,0,'Unexpected prior account tickets; do not reset the acceptance budget');
await writeFile(new URL('./account-file-selection.json',import.meta.url),JSON.stringify({account_id:realm,files}),{mode:0o600});
console.log('FILE_SAVE_SCOPE',JSON.stringify(rows.map(({account_id,updated_at,status,...f})=>f)));
console.log('PASS retained three-file account metadata; zero approved sessions/tickets; no D1 writes or source requests; bytes',files.reduce((n,f)=>n+f.size,0),'limit',FILE_TEST_BYTES);
