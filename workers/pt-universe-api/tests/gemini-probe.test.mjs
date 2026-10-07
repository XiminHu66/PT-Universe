import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const built=await build({entryPoints:['src/gemini-probe.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {geminiProbeRoute}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const records=new Map();
const DB={prepare(sql){let args=[];return {bind(...x){args=x;return this},async run(){
  if(sql.startsWith('INSERT')){if(records.has(args[0]))return {meta:{changes:0}};records.set(args[0],null)}
  if(sql.startsWith('UPDATE'))records.set(args[1],args[0]);
  return {meta:{changes:1}};
},async first(){return records.has(args[0])?{result:records.get(args[0])}:null}}}};
const token='a'.repeat(64),env={DB,GEMINI_API_KEY:'AQ.private-test-placeholder-key',RESEARCH_PROBE_AUTH:JSON.stringify({token,expiresAt:Date.now()+600000})};
const req=(body,auth=token,method='POST')=>new Request('https://worker/api/workbench/gemini-probe',{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
const originalFetch=globalThis.fetch;let modelCalls=0;
try{
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.startsWith('https://generativelanguage.googleapis.com/')){
      assert.equal(init.headers['x-goog-api-key'],env.GEMINI_API_KEY);assert.equal(init.redirect,'manual');
      if(!init.body)return Response.json({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent'],inputTokenLimit:1048576},{name:'models/paid-only-pro',supportedGenerationMethods:['generateContent']}]});
      modelCalls++;const body=JSON.parse(init.body);assert.equal(body.generationConfig.maxOutputTokens,4096);
      return Response.json({usageMetadata:{promptTokenCount:12345,candidatesTokenCount:250,totalTokenCount:12595},candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({fields:{idea:{value:'图检索方法',quote:'Graph retrieval supports global questions.',paragraphId:'p1'},results:{value:'Unverified score',quote:'Invented evidence',paragraphId:'p1'}}})}]}}]});
    }
    if(url.includes('export.arxiv.org/api/query'))return new Response('<feed><entry><id>http://arxiv.org/abs/2404.16130v2</id><title>GraphRAG</title><summary>Graph retrieval supports global questions.</summary><published>2024-04-24</published></entry></feed>');
    if(url==='https://arxiv.org/html/2404.16130v2')return new Response('<article><h2>Introduction</h2><p>Graph retrieval supports global questions.</p></article>');
    throw Error('Unexpected upstream');
  };
  assert.equal((await geminiProbeRoute(req({phase:'connection'},'wrong'),env)).status,401);
  assert.equal((await geminiProbeRoute(req({phase:'connection'}),{...env,RESEARCH_PROBE_AUTH:JSON.stringify({token,expiresAt:Date.now()-1})})).status,401);
  assert.equal((await geminiProbeRoute(req({},token,'GET'),env)).status,405);
  assert.equal((await geminiProbeRoute(req({phase:'connection'}),{...env,GEMINI_API_KEY:undefined})).status,503);
  assert.equal((await geminiProbeRoute(req({phase:'connection'}),{...env,GEMINI_API_KEY:'"'+env.GEMINI_API_KEY+'"'})).body.status,'INVALID_KEY_VALUE');
  assert.equal((await geminiProbeRoute(req({phase:'extract',model:'paid-only-pro'}),env)).status,400);
  assert.equal((await geminiProbeRoute(req({phase:'extract',model:'gemini-2.5-flash',extra:'x'.repeat(1000)}),env)).status,413);
  const connection=(await geminiProbeRoute(req({phase:'connection'}),env)).body;
  assert.equal(connection.models.length,1);assert.ok(!JSON.stringify(connection).includes(env.GEMINI_API_KEY));
  const extraction=(await geminiProbeRoute(req({phase:'extract',model:'gemini-2.5-flash'}),env)).body;
  assert.equal(extraction.usage.promptTokenCount,12345);assert.equal(extraction.jsonValid,true);
  assert.deepEqual(extraction.evidence,{populatedFields:2,exactQuoteMatches:1,totalFields:15,semanticCorrectness:'requires manual review'});
  const reused=(await geminiProbeRoute(req({phase:'extract',model:'gemini-2.5-flash'}),env)).body;
  assert.equal(reused.reused,true);assert.equal(modelCalls,1);
  const token2='b'.repeat(64),env2={...env,RESEARCH_PROBE_AUTH:JSON.stringify({token:token2,expiresAt:Date.now()+600000})};
  globalThis.fetch=async()=>Response.json({error:{status:'RESOURCE_EXHAUSTED',message:'must not expose upstream raw text private-test-key',details:[{violations:[{quotaMetric:'generate_requests_per_model_per_day',quotaId:'FreeTier',quotaDimensions:{model:'gemini-2.5-flash'},quotaValue:'20'}]},{retryDelay:'42s'}]}},{status:429});
  const failure=(await geminiProbeRoute(req({phase:'connection'},token2),env2)).body;
  assert.equal(failure.httpStatus,429);assert.equal(failure.quota[0].value,'20');assert.equal(failure.retryAfter,'42s');assert.ok(!JSON.stringify(failure).includes(env.GEMINI_API_KEY));
  globalThis.fetch=async()=>{throw new Error('Unsupported redirect mode; '+env.GEMINI_API_KEY)};
  const token3='c'.repeat(64),env3={...env,RESEARCH_PROBE_AUTH:JSON.stringify({token:token3,expiresAt:Date.now()+600000})};
  const network=(await geminiProbeRoute(req({phase:'connection'},token3),env3)).body;
  assert.equal(network.status,'GOOGLE_FETCH_FAILED');assert.ok(!JSON.stringify(network).includes(env.GEMINI_API_KEY));
}finally{globalThis.fetch=originalFetch}
console.log('Gemini deployment probe passed: expiring authentication, fixed samples/models, atomic replay protection, token/evidence statistics and sanitized quota errors');
