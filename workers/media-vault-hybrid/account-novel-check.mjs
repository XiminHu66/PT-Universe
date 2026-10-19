// Existing-account metadata only. Never reads auth digests, pair codes or media.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {NOVEL_UX_LAYOUTS,novelUxPermits} from './src/account-novel-scope.js';
export async function inspectNovel({id,query,metadata,now=Date.now()}){
 assert.match(id||'',/^[a-f0-9]{24}$/);
 const sessions=await query('SELECT id,account_id,status,created_at,expires_at,created_jobs,issued_tickets FROM mv_hybrid_app_sessions WHERE id=?',[id]);assert.equal(sessions.length,1);
 const s=sessions[0];assert.match(s.account_id,/^novel-test-[a-f0-9]{32}$/);assert.equal(s.issued_tickets,0);assert.ok(s.expires_at>s.created_at&&s.expires_at-s.created_at<=30*60000);
 const jobs=await query('SELECT j.id,j.kind,j.status,j.request_json,j.created_at,j.updated_at,(SELECT COUNT(*) FROM mv_hybrid_files f WHERE f.job_id=j.id) AS file_count,(SELECT COALESCE(SUM(bytes),0) FROM mv_hybrid_files f WHERE f.job_id=j.id) AS file_bytes FROM mv_hybrid_jobs j JOIN mv_hybrid_account_jobs a ON a.job_id=j.id WHERE a.account_id=? ORDER BY j.created_at,j.id LIMIT 5',[s.account_id]);assert.ok(jobs.length<=4,'Account exceeded four-task scope');
 const [counts]=await query('SELECT (SELECT COUNT(*) FROM mv_hybrid_account_jobs WHERE account_id=?) AS jobs,(SELECT COUNT(*) FROM mv_hybrid_app_tickets t JOIN mv_hybrid_app_sessions s ON s.digest=t.session_digest WHERE s.account_id=?) AS tickets',[s.account_id,s.account_id]);assert.equal(counts.jobs,jobs.length);assert.equal(counts.tickets,0);
 const out=jobs.map(j=>{
  assert.match(j.id,/^[a-f0-9]{24}$/);assert.equal(j.kind,'novel');const spec=JSON.parse(j.request_json);assert.ok(novelUxPermits(spec),'Unexpected novel scope');
  const layout=Object.entries(NOVEL_UX_LAYOUTS).find(([,v])=>isDeepStrictEqual(v,spec.layout))?.[0];assert.ok(layout);
  assert.ok(['queued','running','waiting','active','complete','error','cancelled','expired'].includes(j.status));
  return {id:j.id,status:j.status,layout,indices:spec.indices,text_only:spec.text_only,created_at:j.created_at,updated_at:j.updated_at,file_count:j.file_count,file_bytes:j.file_bytes};
 });
 assert.equal((await metadata('/health')).streaming,'not-live');const quota=await metadata('/quota');assert.equal(quota.reserved_bytes,0);
 return {session_id:id,checked_at:now,session_status:s.status,expires_at:s.expires_at,jobs_used:jobs.length,jobs_remaining:4-jobs.length,tickets:0,transferred_bytes:quota.transferred_bytes,reserved_bytes:0,jobs:out};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,owner=process.env.OWNER;assert.ok(token&&account&&owner?.length>=32);
 async function query(sql,params){
  assert.ok(sql.startsWith('SELECT '));
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const d=await r.json();assert.ok(r.ok&&d.success===true&&d.result?.length===1&&d.result[0].success!==false);return d.result[0].results;
 }
 async function metadata(path){assert.ok(['/health','/quota'].includes(path));const r=await fetch('https://pt-media-hybrid.summer07-nanjolno.workers.dev'+path,{headers:{Authorization:'Bearer '+owner},redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();}
 console.log('NOVEL_METADATA',JSON.stringify(await inspectNovel({id:process.env.REQUEST_ID,query,metadata})));
 console.log('PASS read-only fixed novel parameters/status/quota; no grant, renewal, task, ticket, catalog/source or media request; real UI observations remain required');
}
