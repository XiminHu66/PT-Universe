import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,rm} from 'node:fs/promises';
const configFile=new URL('./test-window.json',import.meta.url),checkpoint=new URL('./off-migration-check.json',import.meta.url);
const root=new URL('.',import.meta.url);
const ids=['a','b','c'].map(x=>x.repeat(24)).join(',');
try{
 for(const operation of ['deploy','prepare','stream-on','stream-off','large-on']){
  const r=spawnSync(process.execPath,['test-window-config.mjs'],{cwd:root,env:{...process.env,OPERATION:operation,TEST_JOB_IDS:operation==='large-on'?'a'.repeat(24):ids},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const {vars}=JSON.parse(await readFile(configFile,'utf8'));
  assert.equal(vars.ENABLE_APP_ACCESS,'false');assert.equal(vars.ENABLE_APP_SUBMISSION,'false');
  assert.equal(vars.ENABLE_DIRECT_STREAM,['stream-on','large-on'].includes(operation)?'true':'false');
  assert.equal(vars.ENABLE_ACCEPTANCE_UI,operation==='stream-on'?'true':'false');
  if(operation!=='stream-on')assert.equal(vars.MEDIA_ACCEPTANCE_UNTIL,'0');
 }
 const empty=spawnSync(process.execPath,['test-window-config.mjs'],{cwd:root,env:{...process.env,OPERATION:'prepare',TEST_JOB_IDS:''},encoding:'utf8'});assert.equal(empty.status,0);assert.equal(JSON.parse(await readFile(configFile,'utf8')).vars.ENABLE_ACCEPTANCE_UI,'false');
}finally{await rm(configFile,{force:true});}
const child=spawn('python3',[new URL('./test-sqlite.py',import.meta.url).pathname],{stdio:['pipe','pipe','inherit']});
const responses=new Map();let seq=0;
const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=responses.get(r.id);responses.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
function sql(query){return new Promise((resolve,reject)=>{const id=++seq;responses.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops:[{sql:query,args:[]}]})+'\n');});}
const originalFetch=globalThis.fetch,originalArgv=process.argv,originalToken=process.env.D1_TOKEN,originalAccount=process.env.CLOUDFLARE_ACCOUNT_ID;
process.env.D1_TOKEN='test-only-d1-token';process.env.CLOUDFLARE_ACCOUNT_ID='test-only-account';
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/test-only-account/d1/database/86805c79-d903-46cd-b0e2-c079c1a7fc1a/query');assert.equal(options.redirect,'error');
 const query=JSON.parse(options.body).sql;assert.match(query,/^(SELECT|PRAGMA)/,'migration checker is read-only');
 const result=await sql(query);return new Response(JSON.stringify({success:true,result:[{success:true,results:result[0].results}]}));
};
let serial=0;async function check(phase){process.argv=['node','migration-check.mjs',phase];await import('./migration-check.mjs?test='+ ++serial);}
try{
 await sql("INSERT INTO mv_hybrid_jobs(id,kind,request_json,created_at,updated_at) VALUES('fixture','video','{}',1,1)");
 await check('before');
 // The full additive schema can execute again without modifying metadata.
 const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
 for(const phase of ['after','idempotent']){for(const statement of schema.replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await sql(statement);await check(phase);}
 await sql("UPDATE mv_hybrid_jobs SET detail='unexpected concurrent change' WHERE id='fixture'");
 await assert.rejects(check('after'),/Existing metadata changed/);
 await sql("UPDATE mv_hybrid_jobs SET detail='' WHERE id='fixture'");
 await sql("INSERT INTO mv_hybrid_app_sessions(digest,id,pair_code,created_at,expires_at) VALUES('test','test','test',1,2)");
 await assert.rejects(check('before'),/Unexpected live account data/);
 await sql("DELETE FROM mv_hybrid_app_sessions WHERE digest='test'");
 await check('after');
 await sql('ALTER TABLE mv_hybrid_app_sessions ADD COLUMN unexpected TEXT');
 await assert.rejects(check('after'),/Account schema columns differ/);
 console.log('PASS OFF preparation and real SQLite migration proofs: independent disabled gates, additive/idempotent schema, data-drift rejection, unexpected grants and schema-shape rejection');
}finally{
 globalThis.fetch=originalFetch;process.argv=originalArgv;
 if(originalToken===undefined)delete process.env.D1_TOKEN;else process.env.D1_TOKEN=originalToken;
 if(originalAccount===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=originalAccount;
 child.stdin.end();lines.close();await rm(checkpoint,{force:true});
}
