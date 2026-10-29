import assert from 'node:assert/strict';
import {loadLab,makeEnv,makeAuth,req} from './deal-lab-harness.mjs';
const {dealLabRoute,retrySeconds,parseSteam,budgets}=await loadLab(),{publicKey,token}=await makeAuth();
let checks=0;function check(v,message){assert.ok(v,message);checks++;}
const call=async(env,body,path='query',auth=token,origin)=>dealLabRoute(req(auth,body,path,origin),env,publicKey),query={provider:'cheapshark',operation:'games',args:{title:'Hades',limit:20}};
let env=makeEnv(),calls=0;
globalThis.fetch=async()=>{calls++;return Response.json([{gameID:'1',external:'Hades',cheapest:'0.00'}]);};
check((await call(env,query,'query','')).status===401,'owner required');check(calls===0);
check((await call(env,query,'query',token,'https://evil.example')).status===403);
const publicStatus=await (await call(env,null,'status','')).json();check(publicStatus.authorized===false);check(calls===0);
{const r=await call(env,{provider:'serpapi',operation:'search',args:{q:'x'}});check(r.status===503);check((await r.json()).code==='key_missing');}
{const r=await call(env,{provider:'itad',operation:'search',args:{title:'x'}});check(r.status===503);check((await r.json()).code==='key_missing');}check(calls===0);
check((await call(env,{provider:'shopsavvy',operation:'product_schedule',args:{}})).status===410);
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
env.sqlite.exec('DELETE FROM deal_lab_usage');globalThis.fetch=async()=>{throw Error('network timeout');};
r=await call(env,{provider:'cheapshark',operation:'games',args:{title:'x'}});check(r.status===502);check((await r.json()).error==='network timeout');
// Paid provider errors inside HTTP 200 are failures, secrets never echo.
env=makeEnv();env.ITAD_API_KEY='test-only-sensitive-key';globalThis.fetch=async()=>Response.json({error:'Failed with '+env.ITAD_API_KEY});
r=await call(env,{provider:'itad',operation:'search',args:{title:'Hades'}});const text=await r.text();check(r.status===502);check(!text.includes(env.ITAD_API_KEY));
env=makeEnv();globalThis.fetch=async()=>new Response('x'.repeat(850001));r=await call(env,query);check(r.status===502);
// Fail closed before any outbound requests if accounting is unavailable.
env=makeEnv();env.DB.prepare=()=>{throw Error('D1 unavailable');};let sent=false;globalThis.fetch=async()=>{sent=true;return Response.json([]);};check((await call(env,query)).status===503);check(!sent);
check(parseSteam('<html>blocked</html>').length===0);
check((await call(makeEnv(),{provider:'gamerpower',operation:'giveaways',args:{platform:'ps5',type:'game'}})).status===400);
check((await call(makeEnv(),{provider:'steamstore',operation:'price',args:{appid:'1',country:'XX'}})).status===400);
check((await call(makeEnv(),{provider:'steam',operation:'leaderboard',args:{page:999}})).status===400);
console.log(`PASS: ${checks} Deal Lab checks. Fixture tests: auth, no-key, allowlists, cache normalization, stale fallback, atomic and rolling quotas, 429, timeout, size and key redaction.`);

// SerpApi fixtures: these are protocol/guard tests, not real price verification.
const free={account_status:'Active',plan_name:'Free',plan_monthly_price:0,plan_searches_left:250,searches_per_month:250,account_rate_limit_per_hour:50};
function serpMock(account=free){const seen=[];globalThis.fetch=async(input)=>{const u=new URL(input);assert.equal(u.origin,'https://serpapi.com');assert.equal(u.searchParams.get('api_key'),'fixture-secret-key');seen.push(u);if(u.pathname==='/account.json')return Response.json({...account,api_key:'fixture-secret-key',account_email:'private@example.com'});assert.equal(u.pathname,'/search.json');assert.ok(['google_shopping','google_immersive_product'].includes(u.searchParams.get('engine')));return Response.json({search_metadata:{status:'Success',processed_at:'2026-10-29 20:00:00 UTC'},shopping_results:[{title:'Fixture',product_id:'1'}],product_results:{title:'Fixture',stores:[]},debug:'fixture-secret-key',api_key:'fixture-secret-key'});};return seen;}
const serpQuery={provider:'serpapi',operation:'search',args:{q:'Headphones'}};
env=makeEnv();env.SERPAPI_KEY='fixture-secret-key';let seen=serpMock();r=await call(env,serpQuery);packet=await r.json();check(r.status===200);check(seen.length===2);check(seen[1].searchParams.get('gl')==='us');check(!JSON.stringify(packet).includes(env.SERPAPI_KEY));check(![...env.kv.values()].join('').includes('private@example.com'));check(![...env.kv.values()].join('').includes(env.SERPAPI_KEY));
check((await(await call(env,serpQuery)).json()).cache==='hit');check(seen.length===2);
for(const args of [{q:'x',api_key:'bad'},{q:'x',url:'https://evil.example'},{q:'x',engine:'google'},{q:'x',no_cache:true},{q:'x',sort_by:3}])check((await call(env,{...serpQuery,args})).status===400);
check(seen.length===2);const a=await(await call(env,{provider:'serpapi',operation:'account',args:{}})).json();check(a.data.freePlanVerified);check(!JSON.stringify(a).includes('private@example.com'));check(!JSON.stringify(a).includes(env.SERPAPI_KEY));check(seen.length===2);
env.sqlite.exec('DELETE FROM deal_lab_usage');check((await call(env,{...serpQuery,force:true})).status===200);check(seen.at(-1).searchParams.get('no_cache')==='true');
for(const account of [{...free,plan_name:'Starter',plan_monthly_price:25},{...free,plan_searches_left:75}]){env=makeEnv();env.SERPAPI_KEY='fixture-secret-key';seen=serpMock(account);r=await call(env,serpQuery);check(r.status=== (account.plan_monthly_price?403:429));check(seen.length===1,'no search is sent for paid plans or reserved official balance');}
env=makeEnv();env.SERPAPI_KEY='fixture-secret-key';seen=serpMock();await call(env,{provider:'serpapi',operation:'account',args:{}});globalThis.fetch=async()=>{throw Error('Network error https://serpapi.com/search.json?api_key=fixture-secret-key');};r=await call(env,serpQuery);check(r.status===502);check(!(await r.text()).includes(env.SERPAPI_KEY));check(![...env.kv.values()].join('').includes(env.SERPAPI_KEY));
env=makeEnv();env.SERPAPI_KEY='fixture-secret-key';seen=serpMock();await call(env,{provider:'serpapi',operation:'account',args:{}});globalThis.fetch=async()=>Response.json({error:'Bad key fixture-secret-key'},{status:200});r=await call(env,serpQuery);check(r.status===502);check(!(await r.text()).includes(env.SERPAPI_KEY));
console.log(`PASS: ${checks} backend assertions including SerpApi missing-key, owner auth, fixed hosts/engines, free-plan guard, official reserve, cache, force refresh and secret-safe responses/cache/errors.`);
