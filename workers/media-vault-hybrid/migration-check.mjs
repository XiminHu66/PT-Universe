// GitHub runner only: hashes metadata in memory; never prints rows or credentials.
import assert from 'node:assert/strict';
import {novelUxWindowValid} from './src/account-novel-scope.js';
import {observationWindowValid,OBSERVATION_DURATION,OBSERVATION_SETUP} from './src/account-observation-scope.js';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const phase=process.argv[2];assert.ok(['before','after','idempotent','ready','ready-submission','ready-novel','ready-observation','release'].includes(phase));
const token=process.env.D1_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert.ok(token&&account,'Configured D1 credentials required');
const database='86805c79-d903-46cd-b0e2-c079c1a7fc1a';
const checkpoint=new URL('./off-migration-check.json',import.meta.url);
const legacy={mv_hybrid_jobs:'id',mv_hybrid_files:'job_id,relative_path',mv_hybrid_transfer_usage:'month',mv_hybrid_tickets:'digest',mv_hybrid_browser_sessions:'digest',mv_hybrid_browser_tickets:'digest'};
let realm='';const readiness=['ready','ready-submission','ready-novel','ready-observation'].includes(phase);
if(readiness||phase==='release'){
 const config=JSON.parse(await readFile(new URL('./account-window.json',import.meta.url),'utf8'));
 for(const flag of ['ENABLE_DIRECT_STREAM','ENABLE_ACCEPTANCE_UI'])assert.equal(config.vars[flag],'false');
 if(phase==='release'){
  for(const flag of ['ENABLE_APP_ACCESS','ENABLE_APP_SUBMISSION'])assert.equal(config.vars[flag],'false');
  assert.equal(config.vars.MEDIA_APP_ACCOUNT_ID,'');assert.equal(config.vars.MEDIA_APP_TEST_MODE,'closed');
 }else{
  const observing=phase==='ready-observation',novel=phase==='ready-novel',submission=phase==='ready-submission'||novel;assert.equal(config.vars.ENABLE_APP_ACCESS,'true');assert.equal(config.vars.ENABLE_APP_SUBMISSION,submission?'true':'false');
  realm=config.vars.MEDIA_APP_ACCOUNT_ID;assert.match(realm,observing?/^observe-test-[a-f0-9]{32}$/:novel?/^novel-test-[a-f0-9]{32}$/:submission?/^submit-test-[a-f0-9]{32}$/:/^login-test-[a-f0-9]{32}$/);
  const until=Number(config.vars[observing?'MEDIA_APP_OBSERVATION_UNTIL':novel?'MEDIA_APP_NOVEL_TEST_UNTIL':submission?'MEDIA_APP_SUBMISSION_TEST_UNTIL':'MEDIA_APP_LOGIN_TEST_UNTIL']);
  if(observing)assert.ok(observationWindowValid(config.vars),'Single-device observation must remain bounded and read-only');
  if(novel)assert.ok(novelUxWindowValid(config.vars),'Novel scope must remain bounded and transfer disabled');
  assert.ok(until>Date.now()&&until<=Date.now()+(observing?OBSERVATION_DURATION+OBSERVATION_SETUP:submission?1800000:1200000));
 }
}
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
  const where=!readiness?'':table==='mv_hybrid_app_tickets'?" WHERE session_digest IN(SELECT digest FROM mv_hybrid_app_sessions WHERE account_id='"+realm+"')":" WHERE account_id='"+realm+"'";
  if(phase!=='release'){const count=await query('SELECT COUNT(*) AS n FROM '+table+where);assert.equal(count[0].n,0,'Unexpected live account data: stop before account activation');}
 }
}
if(phase==='before')await writeFile(checkpoint,JSON.stringify(snapshot),{mode:0o600});
else if(!readiness&&phase!=='release'){
 const before=JSON.parse(await readFile(checkpoint,'utf8'));
 assert.deepEqual(snapshot,before,'Existing metadata changed across additive schema execution');
}
if(phase!=='before'){const indices=await query("SELECT name FROM sqlite_master WHERE type='index' AND name='mv_hybrid_account_job_scope'");assert.equal(indices.length,1,'Account scope index missing');}
console.log(phase==='release'?'PASS closed release readiness: existing metadata schema retained; account history allowed; all feature gates OFF; no migration':readiness?'PASS isolated login readiness: schema matches; generated account realm has no sessions, jobs or tickets; no row data logged':'PASS OFF metadata migration '+phase+': existing table fingerprints preserved; account tables '+(phase==='before'?'absent or empty':'present and empty')+'; no row data logged');
