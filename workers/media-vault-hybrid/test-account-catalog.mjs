import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {novelCatalog,catalogFailure,CATALOG_TIMEOUT_MS} from './src/account-catalog.js';
import {configureAccountWindow} from './account-window-config.mjs';
import {createAccountConnection} from '../../apps/media-vault/account-session.js';
const source='https://www.wenku8.net/book/3551.htm';
const env={RELAY:{idFromName:()=>'',get:()=>({fetch:async()=>new Response(null,{status:204})})}};
const base=JSON.parse(await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
assert.ok(base.compatibility_flags.includes('global_fetch_strictly_public'),'public fetch to sibling workers.dev requires explicit routing flag');
for(const op of ['account-novel-on','account-novel-off','account-observation-on','account-rc-off'])assert.ok(configureAccountWindow(base,op).compatibility_flags.includes('global_fetch_strictly_public'));
let calls=0;
const result=await novelCatalog(source,env,async(url,options)=>{
 calls++;assert.equal(new URL(url).origin,'https://pt-universe-api.summer07-nanjolno.workers.dev');assert.equal(new URL(url).pathname,'/api/media/novel');assert.equal(new URL(url).searchParams.get('url'),source);
 assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{Accept:'application/json'});assert.ok(options.signal instanceof AbortSignal);
 return new Response(JSON.stringify({title:'目录',secret:'drop',chapters:[{title:'一',url:'private',cookie:'drop'}]}));
});
assert.deepEqual(result,{title:'目录',total:1,chapters:[{index:0,title:'一'}],truncated:false});assert.equal(calls,1);
for(const [fetcher,code,status] of [
 [async()=>{throw Error('internal credential and URL');},'catalog_network',503],
 [async()=>new Response('private upstream error',{status:500}),'catalog_upstream_http',503],
 [async()=>new Response('too fast',{status:429}),'catalog_rate_limited',429],
 [async()=>new Response('<html>not JSON</html>'),'catalog_invalid_response',503],
 [async()=>new Response(JSON.stringify({error:'secret'})),'catalog_invalid_response',503],
 [async()=>new Response(JSON.stringify({chapters:[null]})),'catalog_invalid_response',503],
 [async()=>new Response('x'.repeat(5_000_001)),'catalog_too_large',503]
])await assert.rejects(novelCatalog(source,env,fetcher),e=>{assert.equal(e.code,code);assert.deepEqual(catalogFailure(e),{status,body:{error:'Catalog unavailable; verify source access and retry later',code}});return true;});
await assert.rejects(novelCatalog('https://localhost/x',env,()=>{throw Error('must not fetch');}),e=>e.status===400);
await assert.rejects(novelCatalog(source,{},()=>{throw Error('must not fetch');}),e=>e.code==='catalog_limiter_unavailable');
const denied={RELAY:{idFromName:()=>'',get:()=>({fetch:async()=>new Response('private',{status:503})})}};
await assert.rejects(novelCatalog(source,denied,()=>{throw Error('must not fetch');}),e=>e.code==='catalog_limiter_unavailable');
assert.equal(JSON.stringify(catalogFailure({code:'arbitrary-secret',message:'secret',status:401})).includes('secret'),false);
// Exercise the actual client: server codes must be mapped, never echo raw errors.
for(const [code,phrase] of [['catalog_upstream_http','来源服务'],['catalog_timeout','超时'],['catalog_invalid_response','有效小说目录'],['unknown-secret','目录暂不可用'],['__proto__','目录暂不可用'],['constructor','目录暂不可用']]){
 const client=createAccountConnection({origin:'https://account.invalid',storage:null,setTimeout:()=>1,clearTimeout(){},fetch:async url=>String(url).endsWith('/app-auth/session')?new Response(JSON.stringify({status:'approved',session_id:'a'.repeat(24),expires_at:Date.now()+60000,can_submit:true,jobs_remaining:4,tickets_remaining:0})):new Response(JSON.stringify({code,error:'never display upstream secret'}),{status:503})});
 await assert.rejects(client.read('/novel/catalog?'+new URLSearchParams({url:source})),e=>{assert.match(e.message,new RegExp(phrase));assert.ok(!e.message.includes('secret'));assert.equal(e.status,503);return true;});assert.equal(client.current().status,'approved');client.dispose();
}
// A body can stall AFTER successful headers: the total server deadline must fire
// before the browser's 15s deadline, cancel the reader, and perform no retries.
let cancelled=false,fetches=0;
const start=performance.now();
await assert.rejects(novelCatalog(source,env,async()=>{fetches++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}}));}),e=>e.code==='catalog_timeout');
assert.equal(CATALOG_TIMEOUT_MS,12000);assert.ok(performance.now()-start>=CATALOG_TIMEOUT_MS-100);assert.equal(cancelled,true);assert.equal(fetches,1);
console.log('PASS catalog: explicit public Worker routing, fixed metadata-only request, safe failure codes/client messages, bounded invalid/oversized payloads and actual stalled-body deadline/cancellation with no retry');
