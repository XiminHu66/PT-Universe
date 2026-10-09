import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {build} from 'esbuild';
const b=await build({entryPoints:['src/check-ai.ts'],bundle:true,format:'esm',platform:'node',write:false});const {checkAiRoute,validateCheckOutput,checkOutputSchema}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const quote='This headphone is an open-back studio model. The original review describes its sound and comfort under the tested conditions.';
const source={id:'s1',url:'https://www.sennheiser.com/a',title:'Source A',paragraphs:[{id:'p1',text:quote}],specs:[]};
const output={summary:'基于测评原文的有限总结',verdict:'supported',reasoning:[{text:'来源介绍开放式结构',sourceIds:['s1']}],evidence:[{text:'结构',paragraphRef:'s1:p1'}],pros:[{text:'适合该来源描述的场景',sourceIds:['s1']}],cons:[],fit:'适合需要开放式结构的场景；不推测未给出的参数',unknowns:['其他版本参数未提供']};
assert.equal(validateCheckOutput(output,[source],'product').humanVerified,false);const schema=checkOutputSchema([source]);assert.deepEqual(schema.properties.reasoning.items.properties.sourceIds.items.enum,['s1']);assert.equal(schema.properties.reasoning.items.properties.sourceIds.minItems,1);assert.ok(schema.required.includes('unknowns'));assert.equal(schema.properties.evidence.items.additionalProperties,false);
assert.throws(()=>validateCheckOutput({...output,reasoning:[{text:'Fake',sourceIds:['invented']}]},[source],'claim'));
assert.throws(()=>validateCheckOutput({...output,evidence:[{text:'Bad',paragraphRef:'s1:p999'}]},[source],'claim'));
assert.throws(()=>validateCheckOutput({...output,evidence:[{text:'Bad',paragraphRef:'s2:p1'}]},[source],'claim'));
assert.deepEqual(schema.properties.evidence.items.properties.paragraphRef.enum,['s1:p1']);
assert.equal(schema.properties.evidence.items.properties.quote,undefined);
assert.equal(checkOutputSchema([{...source,paragraphs:[]}]).properties.evidence.maxItems,0);
const copied=validateCheckOutput({...output,evidence:[{text:'总结可中文化',paragraphRef:'s1:p1',quote:'A model paraphrase is never used'}]},[source],'claim');
assert.equal(copied.evidence[0].quote,quote);
assert.equal(copied.evidence[0].sourceId,'s1');
assert.equal(copied.evidence[0].paragraphId,'p1');
assert.equal(validateCheckOutput({...output,evidence:[]},[{...source,paragraphs:[]}],'claim').verdict,'insufficient');
function env(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE refresh_limits(limit_key TEXT PRIMARY KEY,last_requested_at TEXT)');return {GEMINI_API_KEY:'AQ.test-placeholder',DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async first(){return db.prepare(sql).get(...args)||null}}}},PT_UNIVERSE_DATA:{data:new Map(),async get(k){return this.data.get(k)||null},async put(k,v){this.data.set(k,JSON.parse(v))}},db};}
const owner='11111111-1111-4111-8111-111111111111',request=(mode='product',q='HD 490 Pro')=>new Request('https://worker/api/check/'+owner+'/analyze',{method:'POST',body:JSON.stringify({query:q,mode,urls:[source.url]})});
assert.equal((await checkAiRoute(request(),env(),async()=>false)).status,401);
assert.equal((await checkAiRoute(request(),{...env(),GEMINI_API_KEY:''},async()=>true)).status,503);
const original=fetch;let calls=0;const e=env();
try{
 globalThis.fetch=async(u,init)=>{if(String(u).includes('generativelanguage')){calls++;const p=JSON.parse(init.body);assert.equal(init.headers['x-goog-api-key'],e.GEMINI_API_KEY);assert.ok(p.generationConfig.maxOutputTokens<=4096);assert.deepEqual(p.generationConfig.responseJsonSchema.properties.pros.items.properties.sourceIds.items.enum,['s1']);assert.ok(p.contents[0].parts[0].text.includes('不是编号数字'));assert.ok(!p.tools,'ordinary summarization never silently invokes another search/model');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}],usageMetadata:{totalTokenCount:700}});}if(String(u)===source.url)return new Response('<title>Source A</title><p>'+quote+'</p>');return new Response('<rss/>');};
 const good=await checkAiRoute(request(),e,async()=>true);assert.equal(good.status,200);assert.equal(calls,1);assert.equal(good.body.sources[0].paragraphs[0].text,quote);assert.ok(!JSON.stringify(good).includes(e.GEMINI_API_KEY));
 const repeat=await checkAiRoute(request(),e,async()=>true);assert.equal(repeat.body.cached,true);assert.equal(calls,1,'same-day repeat must not spend quota');
 // Use real SQLite for the atomic reservation, not a mock that always grants.
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());e.db.exec('UPDATE check_ai_runs SET attempts=30');const denied=await checkAiRoute(request('claim','Another question'),e,async()=>true);assert.equal(denied.status,429);assert.equal(calls,1);
 const busy=env();busy.db.exec('CREATE TABLE check_ai_runs(owner TEXT,fingerprint TEXT,day TEXT,status TEXT,at INTEGER,attempts INTEGER,result TEXT,PRIMARY KEY(owner,fingerprint))');busy.db.prepare('INSERT INTO check_ai_runs VALUES(?,?,?,?,?,?,?)').run(owner,'other',day,'running',Date.now(),1,null);assert.equal((await checkAiRoute(request(),busy,async()=>true)).status,429);
 globalThis.fetch=async(u)=>String(u).includes('generativelanguage')?Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429}):String(u)===source.url?new Response('<title>A</title><p>'+quote+'</p>'):new Response('<rss/>');assert.equal((await checkAiRoute(request(),env(),async()=>true)).status,429);
 const invalid=new Request('https://worker/api/check/'+owner+'/analyze',{method:'POST',body:JSON.stringify({query:'test',mode:'claim',urls:['http://127.0.0.1/']})});assert.equal((await checkAiRoute(invalid,env(),async()=>true)).status,400);
 assert.equal(await checkAiRoute(new Request('https://worker/api/other'),e,async()=>true),null);
}finally{globalThis.fetch=original;}
console.log('Check AI passed: authentication, real atomic SQLite quota/in-flight guards, source-only prompt, exact quotes, citation IDs, cached repeats, snippet-only insufficiency, rate failure and no key exposure');
