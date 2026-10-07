import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev',id=randomUUID(),token=randomBytes(32).toString('base64url');
const headers={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',accept:'application/json',origin:'https://ximinhu66.github.io'};
const report={testedAt:new Date().toISOString(),results:[]};
async function sql(command){await new Promise((resolve,reject)=>{const child=spawn('npx',['wrangler','d1','execute','pt-universe-db','--remote','--command',command],{stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(Error('D1 smoke operation failed')))})}
async function request(path,body,auth=true){const r=await fetch(api+path,{method:body?'POST':'GET',headers:{...headers,...(auth?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(100000)});const data=await r.json();return {status:r.status,data}}
async function task(task,data){const r=await request('/api/workbench/ai/'+id,{task,...data});if(r.status!==200)throw Error(task+' failed HTTP '+r.status+': '+r.data.error);assert.ok(r.data.output);report.results.push({task,model:r.data.model,usage:r.data.usage,scope:r.data.scope,cached:r.data.cached});return r.data.output}
try{
 assert.equal((await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG'},false)).status,401);
 assert.equal((await request('/api/sync/register',{id,token})).status,201);
 assert.equal((await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG'})).status,403);
 await sql(`INSERT INTO research_ai_accounts(owner) VALUES('${id}')`);
 const health=await request('/api/workbench/ai/'+id);assert.equal(health.status,200);assert.equal(health.data.configured,true);
 const refined=await task('refine',{topic:'GraphRAG',goal:'比较评估可靠性与向量 RAG',from:'2024-01-01',to:'2024-12-31'});assert.ok(refined.directions.length);
 const search=await request('/api/workbench/discover?'+new URLSearchParams({q:'GraphRAG',from:'2024-01-01',to:'2024-12-31'}));assert.equal(search.status,200);assert.ok(search.data.items.length);assert.ok(search.data.items.every(x=>x.published>='2024-01-01'&&x.published<='2024-12-31'));report.search={count:search.data.items.length,total:search.data.total,dateRangeApplied:true};
 const papers=search.data.items.slice(0,3).map((p,i)=>({...p,id:'smoke-paper-'+i}));
 const screened=await task('screen',{topic:'GraphRAG',papers});assert.equal(screened.papers.length,papers.length);
 const synthesis=await task('synthesize',{topic:'GraphRAG',papers});assert.ok(synthesis.overview);assert.ok(synthesis.outline.length);report.synthesis={outlineSections:synthesis.outline.length,comparisonDimensions:synthesis.comparison.length,entities:synthesis.entities.length};
 const metadata=await request('/api/workbench/import?q=2404.16130v2'),full=await request('/api/workbench/fulltext?q=2404.16130v2');assert.equal(full.status,200);assert.ok(full.data.paragraphs.length>10);
 const deep=await task('deep',{topic:'GraphRAG',paper:{...metadata.data.paper,paragraphs:full.data.paragraphs}});report.deep={guideSections:deep.readingGuide.length,fields:Object.keys(deep.fields).length,matched:Object.values(deep.fields).filter(f=>f.matched).length,coverage:deep.coverage};assert.ok(deep.readingGuide.length);assert.ok(Object.values(deep.fields).some(f=>f.matched));
 const replay=await request('/api/workbench/ai/'+id,{task:'refine',topic:'GraphRAG',goal:'比较评估可靠性与向量 RAG',from:'2024-01-01',to:'2024-12-31'});assert.equal(replay.data.cached,true);report.replayCached=true;
 report.ok=true;
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1}
finally{try{await sql(`DELETE FROM research_ai_accounts WHERE owner='${id}';DELETE FROM research_ai_runs WHERE owner='${id}';DELETE FROM sync_blobs WHERE sync_id='${id}';DELETE FROM sync_accounts WHERE sync_id='${id}';`);report.temporaryAccountRemoved=true}catch{report.temporaryAccountRemoved=false;process.exitCode=1}await writeFile('/tmp/research-ai-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
