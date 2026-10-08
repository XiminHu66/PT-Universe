import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev',id=randomUUID(),token=randomBytes(32).toString('base64url');
const headers={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',accept:'application/json',origin:'https://ximinhu66.github.io'};
const report={testedAt:new Date().toISOString(),results:[]};
const deployToken=randomBytes(32).toString('hex');let configured=false,granted=false;
async function secret(args,input=''){await new Promise((resolve,reject)=>{const c=spawn('npx',['wrangler',...args,'--name','pt-universe-api'],{stdio:['pipe','pipe','pipe']});c.stdout.resume();c.stderr.resume();c.stdin.end(input);c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(Error('Deployment secret operation failed')))})}
async function admin(action){const r=await fetch(api+'/api/workbench/ai-admin',{method:'POST',headers:{...headers,authorization:'Bearer '+deployToken,'content-type':'application/json'},body:JSON.stringify({action,owner:id}),signal:AbortSignal.timeout(30000)});const data=await r.json().catch(()=>null);return {status:r.status,data}}
async function request(path,body,auth=true){const r=await fetch(api+path,{method:body?'POST':'GET',headers:{...headers,...(auth?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(100000)});const data=await r.json();return {status:r.status,data}}
async function task(task,data){const r=await request('/api/workbench/ai/'+id,{task,...data});if(r.status!==200)throw Error(task+' failed HTTP '+r.status+': '+r.data.error);assert.ok(r.data.output);report.results.push({task,model:r.data.model,usage:r.data.usage,scope:r.data.scope,cached:r.data.cached});return r.data.output}
try{
 await secret(['secret','put','RESEARCH_PROBE_AUTH'],JSON.stringify({token:deployToken,expiresAt:Date.now()+15*60000}));configured=true;
 let initialized;for(let i=0;i<10;i++){initialized=await admin('bootstrap');if(initialized.status===200)break;await new Promise(r=>setTimeout(r,2000))}
 assert.equal(initialized.status,200);assert.equal(initialized.data.keyConfigured,true);report.bootstrap=initialized.data;
 if(process.env.RESEARCH_RUN_SMOKE!=='false'){
 assert.equal((await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG'},false)).status,401);
 assert.equal((await request('/api/sync/register',{id,token})).status,201);
 assert.equal((await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG'})).status,403);
 assert.equal((await admin('grant-test')).status,200);granted=true;
 const health=await request('/api/workbench/ai/'+id);assert.equal(health.status,200);assert.equal(health.data.configured,true);
 const search=await request('/api/workbench/discover?'+new URLSearchParams({q:'GraphRAG',from:'2024-01-01',to:'2024-12-31'}));assert.equal(search.status,200);assert.ok(search.data.items.length);assert.ok(search.data.items.every(x=>x.published>='2024-01-01'&&x.published<='2024-12-31'));report.search={count:search.data.items.length,total:search.data.total,dateRangeApplied:true};
 const metadata=await request('/api/workbench/import?q=2404.16130v2'),full=await request('/api/workbench/fulltext?q=2404.16130v2');assert.equal(full.status,200);assert.ok(full.data.paragraphs.length>10);
 const {keyPassages}=await import('../../apps/research-workbench/workflow.mjs');
 const papers=[{...metadata.data.paper,id:'smoke-paper-0',paragraphs:keyPassages(full.data.paragraphs,16000),sourceTotal:full.data.paragraphs.length,abstractOnly:false},...search.data.items.filter(p=>!p.arxivId?.startsWith('2404.16130')).slice(0,1).map(p=>({...p,id:'smoke-paper-1',paragraphs:[{id:'abstract',section:'Abstract',text:p.abstract}],sourceTotal:1,abstractOnly:true}))];
 const digest=await task('digest',{topic:'GraphRAG',goal:'总结最重要的 take home messages，比较可靠性、适用条件与成本',papers});assert.equal(digest.paperSummaries.length,papers.length);assert.ok(digest.outline.length);assert.ok(digest.paperSummaries.some(d=>d.evidence.some(e=>e.matched)));
 report.digest={papers:digest.paperSummaries.length,outlineSections:digest.outline.length,comparisonDimensions:digest.comparison.length,extracted:digest.paperSummaries.reduce((n,d)=>n+d.evidence.length,0),matched:digest.paperSummaries.reduce((n,d)=>n+d.evidence.filter(e=>e.matched).length,0),coverage:digest.paperSummaries.map(d=>d.coverage)};
 const round=await task('round',{topic:'GraphRAG',goal:'总结最重要的 take home messages，比较可靠性、适用条件与成本',papers:papers.map(p=>({...p,paragraphs:undefined,digest:digest.paperSummaries.find(d=>d.paperId===p.id)}))});assert.ok(round.overview);assert.ok(round.takeaways.length);report.round={takeaways:round.takeaways.length,comparisonDimensions:round.comparison.length};
 const replay=await request('/api/workbench/ai/'+id,{task:'digest',topic:'GraphRAG',goal:'总结最重要的 take home messages，比较可靠性、适用条件与成本',papers});assert.equal(replay.data.cached,true);report.replayCached=true;

 }
 report.ok=true;
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1}
finally{
 if(granted){try{assert.equal((await admin('revoke-test')).status,200);report.temporaryAccountRemoved=true}catch{report.temporaryAccountRemoved=false;process.exitCode=1}}
 if(configured){try{await secret(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;process.exitCode=1}}
 await writeFile('/tmp/research-ai-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
