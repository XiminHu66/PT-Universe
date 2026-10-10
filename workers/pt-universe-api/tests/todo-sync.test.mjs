import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
// Compile the actual production route in isolation; exercise its SQL against D1.
const source=await readFile('src/index.ts','utf8');
const segment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const snippets=segment('async function sha256(', '\nasync function getData(')+segment('async function authenticate(', '\nfunction median(')+segment('async function syncRoute(', '\nasync function enqueue(');
const helpers=`function reply(request,value,status=200){return new Response(JSON.stringify(value),{status})}function error(request,value,status=400){return reply(request,{error:value},status)}function now(){return new Date().toISOString()}`;
const built=await build({stdin:{contents:helpers+snippets+'\nexport {syncRoute};',loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const {syncRoute}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const mf=new Miniflare({workers:[{config:{type:'worker',name:'test',compatibilityDate:'2026-08-28',manifest:{mainModule:'index.mjs',modulesRoot:process.cwd(),modules:{'index.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}},env:{DB:{type:'d1',id:'todo-test'}}}}]});
const env=await mf.getBindings('test'),id='11111111-1111-4111-8111-111111111111',token='T'.repeat(43);
const call=async(method,scope,body,auth=token)=>{const url=new URL('https://test/api/sync/'+id+'/'+scope);return syncRoute(new Request(url,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,url)};
try{
await env.DB.prepare('CREATE TABLE sync_accounts(sync_id TEXT PRIMARY KEY,token_hash TEXT,created_at TEXT)').run();await env.DB.prepare('CREATE TABLE sync_blobs(sync_id TEXT,scope TEXT,ciphertext TEXT,revision INTEGER,updated_at TEXT,PRIMARY KEY(sync_id,scope))').run();const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');await env.DB.prepare('INSERT INTO sync_accounts VALUES(?,?,?)').bind(id,hash,new Date().toISOString()).run();
assert.equal((await call('GET','todo-dashboard',null,'wrong')).status,401);
assert.equal((await call('PUT','todo-dashboard',{ciphertext:'a',baseRevision:-1})).status,400);
assert.equal((await call('PUT','todo-dashboard',{ciphertext:'a',baseRevision:9})).status,409);
assert.equal((await call('PUT','todo-dashboard',{ciphertext:'a',baseRevision:0})).status,200);
const concurrent=await Promise.all([call('PUT','todo-dashboard',{ciphertext:'b',baseRevision:1}),call('PUT','todo-dashboard',{ciphertext:'c',baseRevision:1})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
const result=await (await call('GET','todo-dashboard')).json();assert.equal(result.revision,2);assert.ok(['b','c'].includes(result.ciphertext));assert.equal((await call('PUT','todo-dashboard',{ciphertext:'stale',baseRevision:0})).status,409);
// Preserve the existing preferences scope and isolate it from the new document.
assert.equal((await call('PUT','all',{ciphertext:'preferences'})).status,200);assert.equal((await (await call('GET','all')).json()).ciphertext,'preferences');assert.equal((await (await call('GET','todo-dashboard')).json()).revision,2);
assert.equal((await call('PUT','idea-notes',{ciphertext:'notes',baseRevision:0})).status,200);assert.equal((await call('PUT','idea-notes',{ciphertext:'stale',baseRevision:0})).status,409);
const noteRace=await Promise.all([call('PUT','idea-notes',{ciphertext:'note-a',baseRevision:1}),call('PUT','idea-notes',{ciphertext:'note-b',baseRevision:1})]);assert.deepEqual(noteRace.map(r=>r.status).sort(),[200,409]);assert.equal((await (await call('GET','todo-dashboard')).json()).revision,2);
// Food ledger reuses the isolated authenticated scope with atomic writes.
assert.equal((await call('GET','food-ledger',null,'wrong')).status,401);
assert.equal((await call('PUT','food-ledger',{ciphertext:'food',baseRevision:0})).status,200);
assert.equal((await call('PUT','food-ledger',{ciphertext:'stale',baseRevision:0})).status,409);
const foodRace=await Promise.all([call('PUT','food-ledger',{ciphertext:'food-a',baseRevision:1}),call('PUT','food-ledger',{ciphertext:'food-b',baseRevision:1})]);assert.deepEqual(foodRace.map(r=>r.status).sort(),[200,409]);
assert.equal((await (await call('GET','food-ledger')).json()).revision,2);assert.equal((await (await call('GET','all')).json()).ciphertext,'preferences');
// Recipe documents remain isolated from old food-ledger clients and use CAS.
assert.equal((await call('GET','food-recipes',null,'wrong')).status,401);
assert.equal((await call('PUT','food-recipes',{ciphertext:'recipe',baseRevision:0})).status,200);
const recipeRace=await Promise.all([call('PUT','food-recipes',{ciphertext:'recipe-a',baseRevision:1}),call('PUT','food-recipes',{ciphertext:'recipe-b',baseRevision:1})]);assert.deepEqual(recipeRace.map(r=>r.status).sort(),[200,409]);
assert.equal((await call('PUT','food-recipes',{ciphertext:'stale',baseRevision:0})).status,409);
assert.equal((await (await call('GET','food-ledger')).json()).revision,2);
// Shopping checklists merge independent item updates using an isolated CAS document.
assert.equal((await call('GET','food-shopping',null,'wrong')).status,401);
assert.equal((await call('PUT','food-shopping',{ciphertext:'shopping',baseRevision:0})).status,200);
const shoppingRace=await Promise.all([call('PUT','food-shopping',{ciphertext:'shopping-a',baseRevision:1}),call('PUT','food-shopping',{ciphertext:'shopping-b',baseRevision:1})]);assert.deepEqual(shoppingRace.map(r=>r.status).sort(),[200,409]);
assert.equal((await call('PUT','food-shopping',{ciphertext:'stale',baseRevision:0})).status,409);
assert.equal((await (await call('GET','food-recipes')).json()).revision,2);
// Research documents use the same isolated CAS protocol.
assert.equal((await call('GET','research-workbench',null,'wrong')).status,401);
assert.equal((await call('PUT','research-workbench',{ciphertext:'research',baseRevision:0})).status,200);
assert.equal((await call('PUT','research-workbench',{ciphertext:'stale',baseRevision:0})).status,409);
const researchRace=await Promise.all([call('PUT','research-workbench',{ciphertext:'research-a',baseRevision:1}),call('PUT','research-workbench',{ciphertext:'research-b',baseRevision:1})]);assert.deepEqual(researchRace.map(r=>r.status).sort(),[200,409]);
assert.equal((await (await call('GET','food-ledger')).json()).revision,2);
console.log('Todo / Idea Pad D1 sync passed: authorization, isolation, first-write races, stale revisions and atomic concurrent writes');
}finally{await mf.dispose()}
