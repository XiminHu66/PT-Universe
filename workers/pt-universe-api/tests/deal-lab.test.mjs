import assert from 'node:assert/strict';
import {loadLab,makeEnv,makeAuth,req} from './deal-lab-harness.mjs';
const {dealLabRoute,retrySeconds,sanitizeMcpArgs,parseSteam,budgets}=await loadLab(),{publicKey,token}=await makeAuth();
let checks=0;function check(v,message){assert.ok(v,message);checks++;}
const call=async(env,body,path='query',auth=token,origin)=>dealLabRoute(req(auth,body,path,origin),env,publicKey),query={provider:'cheapshark',operation:'games',args:{title:'Hades',limit:20}};
let env=makeEnv(),calls=0;
globalThis.fetch=async()=>{calls++;return Response.json([{gameID:'1',external:'Hades',cheapest:'0.00'}]);};
check((await call(env,query,'query','')).status===401,'owner required');check(calls===0);
check((await call(env,query,'query',token,'https://evil.example')).status===403);
const publicStatus=await (await call(env,null,'status','')).json();check(publicStatus.authorized===false);check(calls===0);
for(const provider of ['serpapi','itad']){const r=await call(env,{provider,operation:provider==='itad'?'search':'search',args:{q:'test',title:'test'}});check(r.status===503);check((await r.json()).code==='key_missing');}check(calls===0);
check((await call(env,{provider:'shopsavvy',operation:'product_schedule',args:{}})).status===403);
check((await call(env,{provider:'cheapshark',operation:'https://evil.example',args:{}})).status===400);
check((await call(env,{...query,args:{title:'x',url:'http://localhost'}})).status===400);check(calls===0);
let r=await call(env,query),packet=await r.json();check(r.status===200);check(packet.cache==='miss');check(calls===1);
packet=await (await call(env,{...query,args:{limit:'20',title:'Hades'}})).json();check(packet.cache==='hit');check(calls===1);
const usage=await (await call(env,null,'status')).json();check(usage.sources.cheapshark.usage.month===1);check(usage.sources.cheapshark.health.state==='success');
r=await call(env,{...query,args:{title:'Portal'}});check(r.status===429);check(Number(r.headers.get('retry-after'))>0);check((await r.json()).retryAfter>0);check(calls===1);
await call(env,query,'clear');env.sqlite.exec('DELETE FROM deal_lab_usage');
globalThis.fetch=async()=>{calls++;return Response.json({error:'limited'},{status:429,headers:{'retry-after':'7200'}});};
r=await call(env,query);packet=await r.json();check(r.status===429);check(packet.lastGood.data.length===1);check(packet.retryAfter===7200);check(Number(env.kv.get('deal-lab/backoff/cheapshark'))>Date.now()+7190_000);
const count=calls;r=await call(env,query);check(r.status===429);check(calls===count);
check(retrySeconds(new Date(Date.now()+120_000).toUTCString())>=119);check(retrySeconds('invalid',1800)===1800);
// Atomic INSERT...SELECT against actual SQLite, with concurrent requests and rolling cap.
env=makeEnv();globalThis.fetch=async()=>Response.json([]);const parallel=await Promise.all(Array.from({length:12},(_,i)=>call(env,{...query,args:{title:'Game '+i}})));check(parallel.filter(r=>r.status===200).length===1);check(env.sqlite.prepare('SELECT COUNT(*) n FROM deal_lab_usage').get().n===1);
env.sqlite.exec('DELETE FROM deal_lab_usage');const insert=env.sqlite.prepare('INSERT INTO deal_lab_usage VALUES(?,?,?,?)');for(let i=0;i<budgets.cheapshark.month;i++)insert.run('row'+i,'cheapshark',Date.now()-2*86400000,'success');
r=await call(env,query);check(r.status===429,'rolling cap blocks despite empty current day');
// MCP schema alternatives, allowed fields, primitive types, discovery, session propagation, SSE and errors.
const schema={type:'object',properties:{identifier:{type:'string'},start:{type:'string'},end:{type:'string'},limit:{type:'number'}},required:['identifier'],anyOf:[{required:['start','end']}]};
assert.throws(()=>sanitizeMcpArgs({identifier:'x'},schema));checks++;
assert.throws(()=>sanitizeMcpArgs({identifier:'x',start:'2026-01-01',end:'2026-02-01',limit:'4'},schema));checks++;
check(sanitizeMcpArgs({identifier:'x',start:'2026-01-01',end:'2026-02-01'},schema).identifier==='x');
env=makeEnv();const methods=[];
globalThis.fetch=async(url,init)=>{check(url==='https://api.shopsavvy.com/mcp');const b=JSON.parse(init.body);methods.push(b.method);if(b.method==='initialize')return Response.json({jsonrpc:'2.0',id:b.id,result:{protocolVersion:'2025-06-18'}},{headers:{'mcp-session-id':'test-session'}});check(init.headers['mcp-session-id']==='test-session');if(b.method==='notifications/initialized')return new Response(null,{status:202});if(b.method==='tools/list')return Response.json({jsonrpc:'2.0',id:b.id,result:{tools:[{name:'product_search',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},{name:'product_schedule',inputSchema:{}}]}});return new Response('data: '+JSON.stringify({jsonrpc:'2.0',id:b.id,result:{content:[{type:'text',text:'Real-shape fixture'}]}})+'\n\n',{headers:{'content-type':'text/event-stream'}});};
r=await call(env,{provider:'shopsavvy',operation:'product_search',args:{query:'mouse'}});check(r.status===200);check(methods.join(',')==='initialize,notifications/initialized,tools/list,tools/call');
env.sqlite.exec('DELETE FROM deal_lab_usage');globalThis.fetch=async()=>{throw Error('network timeout');};
r=await call(env,{provider:'cheapshark',operation:'games',args:{title:'x'}});check(r.status===502);check((await r.json()).error==='network timeout');
// Paid provider errors inside HTTP 200 are failures, secrets never echo.
env=makeEnv();env.SERPAPI_KEY='test-only-sensitive-key';globalThis.fetch=async()=>Response.json({error:'Failed with '+env.SERPAPI_KEY});
r=await call(env,{provider:'serpapi',operation:'search',args:{q:'mouse'}});const text=await r.text();check(r.status===502);check(!text.includes(env.SERPAPI_KEY));
env=makeEnv();globalThis.fetch=async()=>new Response('x'.repeat(850001));r=await call(env,query);check(r.status===502);
// Fail closed before any outbound requests if accounting is unavailable.
env=makeEnv();env.DB.prepare=()=>{throw Error('D1 unavailable');};let sent=false;globalThis.fetch=async()=>{sent=true;return Response.json([]);};check((await call(env,query)).status===503);check(!sent);
check(parseSteam('<html>blocked</html>').length===0);
console.log(`PASS: ${checks} Deal Lab checks. Fixture tests: auth, no-key, allowlists, cache normalization, stale fallback, atomic and rolling quotas, MCP handshake/SSE/Schema, 429, timeout, size and key redaction.`);
