import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../apps/knowledge-garden/backend.mjs',import.meta.url),'utf8');
const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let assigned='',replaced='',called;
globalThis.location={origin:'https://ximinhu66.github.io',pathname:'/PT-Universe/apps/knowledge-garden/',search:'',hash:'',assign:v=>assigned=v};
globalThis.history={replaceState:(_,__,url)=>replaced=url};globalThis.document={dispatchEvent(){},querySelectorAll:()=>[]};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),dummyToken='header.'+encode({exp:Math.floor(Date.now()/1000)+3600})+'.signature';
const first=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#unconnected');
assert.equal(first.hasConnection(),false);assert.equal(assigned,'','Importing the transport alone must not navigate');location.search='?source=pr5t0fcc6kyc9tx8rdl372dz';assert.equal(first.connectBackend({automatic:true}),true);assert.equal(first.connectBackend({automatic:true}),false,'Do not start a second automatic round trip');assert.ok(assigned.startsWith('https://pt-vps-tools.h1nano.chatgpt.site/__pt_knowledge_connect?nonce='));
const nonce=storage.get('pt.knowledge.connect.nonce');location.search='';location.hash='#knowledge='+dummyToken+'&backend='+dummyToken+'&nonce='+nonce;
const connected=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#callback');assert.equal(connected.hasConnection(),true);assert.equal(replaced,'/PT-Universe/apps/knowledge-garden/?source=pr5t0fcc6kyc9tx8rdl372dz');assert.equal(connected.connectBackend({automatic:true}),false,'A valid capability needs no bridge visit');assert.equal(storage.has('pt.knowledge.connect.nonce'),false);
globalThis.fetch=async(url,init)=>{called={url,init};return Response.json({ok:true})};
await connected.backendFetch('/karakeep/api/v1/bookmarks');assert.equal(called.url,connected.API+'/knowledge/karakeep/api/v1/bookmarks');assert.equal(called.init.headers.get('authorization'),'Bearer '+dummyToken);assert.equal(called.init.credentials,'omit');
await connected.backendFetch('/__pt_knowledge/chat',{method:'POST',headers:{'content-type':'application/json','x-pt-knowledge':'1'},body:JSON.stringify({provider:'gemini',messages:[]})});assert.equal(called.url,connected.API+'/anythingllm/chat');assert.equal(JSON.parse(called.init.body).backendSession,dummyToken);assert.equal(called.init.headers.get('authorization'),null);assert.equal(called.init.headers.has('x-pt-knowledge'),false);
await connected.backendFetch('/__pt_knowledge/models',{method:'POST',body:JSON.stringify({provider:'gemini'})});assert.equal(called.url,connected.API+'/anythingllm/models?provider=gemini');assert.equal(called.init.body,undefined);
await assert.rejects(()=>connected.backendFetch('https://evil.example'),/Unsupported/);

// A provider's 401 must not log the user out of their knowledge library.
globalThis.fetch=async()=>Response.json({error:'provider key required'},{status:401});
await connected.backendFetch('/__pt_knowledge/chat',{method:'POST',body:JSON.stringify({provider:'gemini'})});assert.equal(connected.hasConnection(),true);
await connected.backendFetch('/karakeep/api/v1/bookmarks');assert.equal(connected.hasConnection(),false);assert.equal(storage.has('pt.knowledge.connection'),false);
assert.equal(connected.connectBackend({automatic:true}),false,'A server rejection immediately after the bridge must stop instead of looping');assert.equal(connected.connectBackend(),true,'Manual retry remains possible');

const fresh=async name=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+name);
storage.clear();assigned='';location.hash='';location.search='';
const newTab=await fresh('new-tab');assert.equal(newTab.connectBackend({automatic:true}),true,'A new tab automatically reuses VPS identity');
// Simulate reopening after a failed bridge, still within the redirect budget.
location.hash='';const returnedWithoutGrant=await fresh('failed-return');assigned='';assert.equal(returnedWithoutGrant.connectBackend({automatic:true}),false);assert.equal(assigned,'');
storage.set('pt.knowledge.connect.automatic-at',String(Date.now()-61000));assert.equal(returnedWithoutGrant.connectBackend({automatic:true}),true,'A later visit may retry once');
// Even with no recent attempt, an unsolicited callback never starts a loop.
storage.clear();location.hash='#knowledge='+dummyToken+'&nonce=untrusted';
const invalid=await fresh('bad-nonce');assert.equal(invalid.hasConnection(),false);assert.equal(invalid.connectBackend({automatic:true}),false);assert.ok(!replaced.includes('#'),'Strip capabilities from the URL even when rejected');
storage.clear();storage.set('pt.knowledge.connect.nonce','expected');location.hash='#knowledge=header.'+encode({exp:1})+'.signature&nonce=expected';
const expired=await fresh('expired-callback');assert.equal(expired.hasConnection(),false);assert.equal(expired.connectBackend({automatic:true}),false);
assert.equal(expired.connectBackend(),true,'An expired or malformed callback permits manual recovery');
console.log('PASS: automatic VPS identity reuse, per-tab 60-second redirect budget, valid-session bypass, source-query restoration, nonce/expiry callback rejection, immediate fragment removal, provider isolation, 401 invalidation and manual recovery; fixed PT API/model routing unchanged.');

const {modelSettings,chooseModel,DEFAULT_MODEL}=await import('../../apps/knowledge-garden/model-choice.mjs');
const catalog=JSON.parse(await readFile(new URL('../../apps/anythingllm/providers.json',import.meta.url),'utf8'));
assert.ok(catalog.providers.find(p=>p.id==='gemini').models.includes(DEFAULT_MODEL),'The startup default is in the existing verified PT catalog');
for(const saved of [undefined,null,[],{}, {provider:'gemini',model:''},{provider:'gemini',model:'<invalid>'}])assert.equal(modelSettings(saved).model,DEFAULT_MODEL,'Cold startup never sends an empty Gemini model');
assert.equal(modelSettings({provider:'gemini',model:'gemini-2.5-flash'}).model,'gemini-2.5-flash','Keep a valid explicit model preference');
assert.equal(modelSettings({provider:'groq'}).model,'','Never silently switch providers or invent another provider model');
assert.equal(chooseModel([],DEFAULT_MODEL,'gemini'),DEFAULT_MODEL,'Slow or failed discovery retains a usable startup model');
assert.equal(chooseModel([{id:'gemini-2.5-flash'}],DEFAULT_MODEL,'gemini'),'gemini-2.5-flash','A completed discovery repairs a removed model');
assert.equal(chooseModel([{id:DEFAULT_MODEL},{id:'gemini-2.5-flash'}],'gemini-2.5-flash','gemini'),'gemini-2.5-flash');
console.log('PASS: cold-start model readiness, corrupted/empty preferences, explicit model preservation, slow-discovery fallback, removed-model recovery and provider isolation.');

const {readCompletion}=await import('../../apps/knowledge-garden/completion.mjs');
let cancelled=0;
const streamResponse=events=>new Response(new ReadableStream({start(controller){for(const event of events)controller.enqueue(new TextEncoder().encode(event));},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});
const delta=JSON.stringify({model:'test-model',choices:[{delta:{content:'{"title":"中文回答"}'}}]});
const complete=await Promise.race([readCompletion(streamResponse(['data: '+delta+'\n\n','data: [DONE]\n'])),new Promise((_,reject)=>setTimeout(()=>reject(Error('Completion waited for EOF')),500))]);
assert.equal(JSON.parse(complete.content).title,'中文回答');assert.equal(complete.model,'test-model');assert.equal(cancelled,1,'Close the reader after DONE even if the provider keeps SSE open');
const finish=JSON.stringify({choices:[{delta:{content:[{text:'{"ok":true}'}]},finish_reason:'stop'}]});
assert.equal(JSON.parse((await readCompletion(streamResponse(['data: '+finish+'\r\n\r\n']))).content).ok,true);
await assert.rejects(()=>readCompletion(streamResponse(['data: {"error":{"message":"quota exhausted"}}\n\n'])),/quota exhausted/);
assert.equal((await readCompletion(Response.json({choices:[{message:{content:'{"ok":true}'}}]}))).content,'{"ok":true}');
console.log('PASS: SSE DONE/finish markers complete without EOF, source-reader cancellation, array content, upstream stream errors and JSON response compatibility.');
