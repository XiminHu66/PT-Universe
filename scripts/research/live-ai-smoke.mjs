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
 const refined=await task('refine',{topic:'GraphRAG',goal:'比较评估可靠性与向量 RAG',from:'2024-01-01',to:'2024-12-31'});assert.ok(refined.directions.length);
 const search=await request('/api/workbench/discover?'+new URLSearchParams({q:'GraphRAG',from:'2024-01-01',to:'2024-12-31'}));assert.equal(search.status,200);assert.ok(search.data.items.length);assert.ok(search.data.items.every(x=>x.published>='2024-01-01'&&x.published<='2024-12-31'));report.search={count:search.data.items.length,total:search.data.total,dateRangeApplied:true};
 const papers=search.data.items.slice(0,3).map((p,i)=>({...p,id:'smoke-paper-'+i}));
 const screened=await task('screen',{topic:'GraphRAG',papers});assert.equal(screened.papers.length,papers.length);
 const synthesis=await task('synthesize',{topic:'GraphRAG',papers});assert.ok(synthesis.overview);assert.ok(synthesis.outline.length);report.synthesis={outlineSections:synthesis.outline.length,comparisonDimensions:synthesis.comparison.length,entities:synthesis.entities.length};
 const metadata=await request('/api/workbench/import?q=2404.16130v2'),full=await request('/api/workbench/fulltext?q=2404.16130v2');assert.equal(full.status,200);assert.ok(full.data.paragraphs.length>10);
 const deep=await task('deep',{topic:'GraphRAG',paper:{...metadata.data.paper,paragraphs:full.data.paragraphs}});report.deep={guideSections:deep.readingGuide.length,fields:Object.keys(deep.fields).length,matched:Object.values(deep.fields).filter(f=>f.matched).length,coverage:deep.coverage};assert.ok(deep.readingGuide.length);assert.ok(Object.values(deep.fields).some(f=>f.matched));
 const replay=await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG',goal:'比较评估可靠性与向量 RAG',from:'2024-01-01',to:'2024-12-31'});assert.equal(replay.data.cached,true);report.replayCached=true;
 }
 report.ok=true;
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1}
finally{
 if(granted){try{assert.equal((await admin('revoke-test')).status,200);report.temporaryAccountRemoved=true}catch{report.temporaryAccountRemoved=false;process.exitCode=1}}
 if(configured){try{await secret(['secret','delete','RESEARCH_PROBE_AUTH']);report.temporaryCredentialRemoved=true}catch{report.temporaryCredentialRemoved=false;process.exitCode=1}}
 await writeFile('/tmp/research-ai-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
