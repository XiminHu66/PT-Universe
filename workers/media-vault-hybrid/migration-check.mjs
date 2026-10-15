// GitHub runner only: hashes metadata in memory; never prints rows or credentials.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const phase=process.argv[2];assert.ok(['before','after','idempotent'].includes(phase));
const token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert.ok(token&&account,'Configured D1 credentials required');
const database='86805c79-d903-46cd-b0e2-c079c1a7fc1a';
const checkpoint=new URL('./off-migration-check.json',import.meta.url);
const legacy={mv_hybrid_jobs:'id',mv_hybrid_files:'job_id,relative_path',mv_hybrid_transfer_usage:'month',mv_hybrid_tickets:'digest',mv_hybrid_browser_sessions:'digest',mv_hybrid_browser_tickets:'digest'};
const added={mv_hybrid_app_sessions:['digest','id','pair_code','account_id','status','created_at','expires_at','created_jobs','issued_tickets'],mv_hybrid_account_jobs:['job_id','account_id','request_key','request_hash','created_by_digest'],mv_hybrid_app_tickets:['digest','session_digest']};
async function query(sql){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database/'+database+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql}),redirect:'error',signal:AbortSignal.timeout(30000)});
 let data;try{data=await response.json();}catch{throw Error('D1 returned non-JSON metadata response');}
 assert.ok(response.ok&&data.success===true&&Array.isArray(data.result)&&data.result.length===1&&data.result[0].success!==false,'D1 metadata query failed');
 assert.ok(Array.isArray(data.result[0].results),'D1 metadata rows missing');return data.result[0].results;
}
const names=new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name));
const snapshot={};
for(const [table,order] of Object.entries(legacy)){
 assert.ok(names.has(table),'Existing hybrid table missing');
 const rows=await query('SELECT * FROM '+table+' ORDER BY '+order+' LIMIT 10001');
 assert.ok(rows.length<=10000,'Metadata proof bound exceeded');
 const canonical=rows.map(row=>Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])));
 snapshot[table]={rows:rows.length,hash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
}
for(const [table,columns] of Object.entries(added)){
 if(phase!=='before')assert.ok(names.has(table),'Account schema table missing');
 if(names.has(table)){
  const info=await query('PRAGMA table_info('+table+')');
  assert.deepEqual(info.map(c=>c.name),columns,'Account schema columns differ');
  const count=await query('SELECT COUNT(*) AS n FROM '+table);
  assert.equal(count[0].n,0,'Unexpected live account data: stop before account activation');
 }
}
if(phase==='before')await writeFile(checkpoint,JSON.stringify(snapshot),{mode:0o600});
else{
 const before=JSON.parse(await readFile(checkpoint,'utf8'));
 assert.deepEqual(snapshot,before,'Existing metadata changed across additive schema execution');
 const indices=await query("SELECT name FROM sqlite_master WHERE type='index' AND name='mv_hybrid_account_job_scope'");assert.equal(indices.length,1,'Account scope index missing');
}
console.log('PASS OFF metadata migration '+phase+': existing table fingerprints preserved; account tables '+(phase==='before'?'absent or empty':'present and empty')+'; no row data logged');
