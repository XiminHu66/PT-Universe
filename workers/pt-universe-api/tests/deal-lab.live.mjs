// Explicit on-demand live upstream verification; never runs in routine CI.
// A local route with real SQLite/KV adapters calls real public providers.
// This does NOT claim deployed Worker authentication or browser verification.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadLab,makeEnv,makeAuth,req} from './deal-lab-harness.mjs';
import {normalize} from '../../../apps/deal-lab/data.mjs';
const {dealLabRoute}=await loadLab(),{token,publicKey}=await makeAuth(),env=makeEnv();
const report={startedAt:new Date().toISOString(),mode:'local route, actual public upstream HTTP; no mocks',results:[]};
for(const [provider,operation,args] of [
 ['cheapshark','games',{title:'Hades',limit:2}],
 ['gamerpower','giveaways',{platform:'steam',type:'game'}],
 ['steam','leaderboard',{}],
 ['shopsavvy','tools',{}],
 ['shopsavvy','product_search',{query:'Logitech G Pro X Superlight 2',limit:3}],
 ['shopsavvy','product_offers',{identifier:'products/60b5447e-750a-73ef-b8de-94174e08d816'}]
]){
 // Reset only this isolated test DB between cases; production cooldown is unit-tested separately.
 try{
  env.sqlite.exec('DELETE FROM deal_lab_usage');
 }catch{}
 const start=Date.now(),response=await dealLabRoute(req(token,{provider,operation,args}),env,publicKey),packet=await response.json();
 const items=normalize({...packet,args});
 const entry={provider,operation,httpStatus:response.status,cache:packet.cache,count:operation==='tools'?packet.data?.tools?.length:items.length,durationMs:Date.now()-start,error:packet.error||null};
 report.results.push(entry);console.log(JSON.stringify(entry));
 if(response.status===200){
  assert.ok(entry.count>0,provider+' must return real entries');
  const cached=await (await dealLabRoute(req(token,{provider,operation,args}),env,publicKey)).json();assert.equal(cached.cache,'hit');entry.repeatCache='hit';
  if(provider==='steam'){assert.ok(packet.data.items.every(x=>x.rank&&x.appid&&x.url));assert.ok(packet.data.metric.includes('not wishlist counts'));}
  if(operation==='tools'){assert.ok(packet.data.tools.find(t=>t.name==='product_search')?.inputSchema);assert.ok(!packet.data.tools.some(t=>t.name==='product_schedule'));}
 }
 await writeFile('/tmp/deal-lab-live-report.json',JSON.stringify(report,null,2));
}
for(const provider of ['serpapi','itad']){const response=await dealLabRoute(req(token,{provider,operation:'search',args:{q:'mouse',title:'Hades'}}),env,publicKey),packet=await response.json();assert.equal(packet.code,'key_missing');report.results.push({provider,httpStatus:response.status,result:'key_missing, no outbound request'});}
report.finishedAt=new Date().toISOString();await writeFile('/tmp/deal-lab-live-report.json',JSON.stringify(report,null,2));
console.log('Live verification saved: /tmp/deal-lab-live-report.json');
