import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
globalThis.crypto||=webcrypto;
const built=await build({entryPoints:['src/research-ai.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {researchAIRoute,researchAIAdmin,researchPrompt,validateResearchOutput}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE research_ai_accounts(owner TEXT PRIMARY KEY)');
const owner='11111111-1111-4111-8111-111111111111';db.prepare('INSERT INTO research_ai_accounts VALUES(?)').run(owner);
const DB={async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}},prepare(sql){let args=[];return {bind(...a){args=a;return this},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},async first(){return db.prepare(sql).get(...args)||null}}}};
const env={DB,RESEARCH_PROBE_AUTH:JSON.stringify({token:'z'.repeat(64),expiresAt:Date.now()+600000}),GEMINI_API_KEY:'AQ.private-placeholder'},request=(body,options={})=>new Request('https://test/api/workbench/ai/'+(options.owner||owner),{method:options.method||'POST',headers:{authorization:'Bearer token'},...(options.method==='GET'?{}:{body:JSON.stringify(body)})});
let calls=0;const original=globalThis.fetch;const p={id:'paper-1',title:'Graph Retrieval',abstract:'We propose graph retrieval and evaluate on HotpotQA.',paragraphs:[{id:'p1',text:'We propose graph retrieval and evaluate on HotpotQA.'}]};
try{
 globalThis.fetch=async(url,opts)=>{calls++;assert.ok(String(url).includes('gemini-3.5-flash-lite'));assert.equal(opts.headers['x-goog-api-key'],env.GEMINI_API_KEY);const output={overview:'图检索研究',outline:['定义目标'],directions:[{name:'评估',question:'如何评估？',keywords:['GraphRAG'],include:'评估',exclude:'理论'}]};return Response.json({usageMetadata:{totalTokenCount:123},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]})};
 assert.equal((await researchAIRoute(request({task:'refine',topic:'GraphRAG'}),env,async()=>false)).status,401);
 assert.equal((await researchAIRoute(request({task:'refine',topic:'GraphRAG'},{owner:'22222222-2222-4222-8222-222222222222'}),env,async()=>true)).status,403);
 assert.equal(calls,0);
 const status=await researchAIRoute(request(null,{method:'GET'}),env,async()=>true);assert.equal(status.body.model,'gemini-3.5-flash-lite');
 const first=await researchAIRoute(request({task:'refine',topic:'GraphRAG'}),env,async()=>true);assert.equal(first.status,200);assert.equal(first.body.output.directions.length,1);
 const second=await researchAIRoute(request({task:'refine',topic:'GraphRAG'}),env,async()=>true);assert.equal(second.body.cached,true);assert.equal(calls,1);
 assert.equal((await researchAIRoute(request({task:'paid',topic:'GraphRAG'}),env,async()=>true)).status,400);
 const deep=researchPrompt({task:'deep',topic:'GraphRAG',paper:p});const output=validateResearchOutput('deep',{summary:'解读',fields:{idea:{value:'图检索',quote:'We propose graph retrieval',paragraphId:'p1'},results:{value:'虚构',quote:'99% accuracy',paragraphId:'p1'}}},deep.source);assert.equal(output.fields.idea.matched,true);assert.equal(output.fields.results.matched,false);assert.equal(output.fields.idea.confirmed,false);assert.equal(output.coverage.abstractOnly,true);
 const screened=researchPrompt({task:'screen',topic:'GraphRAG',papers:[p]});assert.throws(()=>validateResearchOutput('screen',{papers:[{id:'invented'}]},screened.source));
 const report=validateResearchOutput('synthesize',{overview:'总结',outline:[{title:'方法',paperIds:['paper-1','fake']}],comparison:[{dimension:'方法',items:[{paperId:'paper-1',value:'图',quote:'We propose graph retrieval'},{paperId:'fake'}]}],entities:[{name:'HotpotQA',type:'Dataset',paperIds:['paper-1']},{name:'Fake',type:'Paper',paperIds:['fake']}]},screened.source);assert.deepEqual(report.outline[0].paperIds,['paper-1']);assert.equal(report.comparison[0].items.length,1);assert.equal(report.entities.length,1);assert.equal(report.comparison[0].items[0].matched,true);
 globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'do not expose '+env.GEMINI_API_KEY}},{status:429})};
 const failed=await researchAIRoute(request({task:'refine',topic:'Other topic'}),env,async()=>true);assert.equal(failed.status,429);assert.ok(!JSON.stringify(failed).includes(env.GEMINI_API_KEY));
 await researchAIRoute(request({task:'refine',topic:'Other topic'}),env,async()=>true);const attempts=db.prepare("SELECT attempts FROM research_ai_runs WHERE status='failed'").get();assert.equal(attempts.attempts,2);
 db.prepare("UPDATE research_ai_runs SET attempts=100").run();const cap=await researchAIRoute(request({task:'refine',topic:'Quota test'}),env,async()=>true);assert.equal(cap.status,429);

 db.exec('CREATE TABLE sync_accounts(sync_id TEXT PRIMARY KEY);CREATE TABLE sync_blobs(sync_id TEXT,ciphertext TEXT)');
 const admin=(action,own=owner,token='z'.repeat(64))=>new Request('https://test/api/workbench/ai-admin',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({action,owner:own})});
 assert.equal((await researchAIAdmin(admin('bootstrap',owner,'bad'),env)).status,401);
 assert.equal((await researchAIAdmin(admin('bootstrap'),env)).status,200);
 const temporary='33333333-3333-4333-8333-333333333333';db.prepare('INSERT INTO sync_accounts VALUES(?)').run(temporary);
 assert.equal((await researchAIAdmin(admin('grant-test',temporary),env)).status,200);
 assert.equal((await researchAIAdmin(admin('revoke-test',owner),env)).status,403);
 assert.equal((await researchAIAdmin(admin('revoke-test',temporary),env)).status,200);
 assert.equal(db.prepare('SELECT * FROM sync_accounts WHERE sync_id=?').get(temporary),undefined);
 // Subsequent deployments cannot implicitly grant a newly registered account.
 db.prepare('INSERT INTO sync_blobs VALUES(?,?)').run(temporary,'x'.repeat(150));await researchAIAdmin(admin('bootstrap'),env);
 assert.equal(db.prepare('SELECT * FROM research_ai_accounts WHERE owner=?').get(temporary),undefined);
 console.log('Research AI passed: enrollment/authentication, fixed model, persistent deduplication, real SQL quota reservations/retries, evidence checks, ID validation and sanitized upstream failure');
}finally{globalThis.fetch=original;db.close()}
