// Explicit manual real-upstream test through a local route; not a production deployment claim.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadLab,makeEnv,makeAuth,req} from './deal-lab-harness.mjs';
import {productMatches,productDetails,productOffers,retainedGiveaways} from '../../../apps/deal-lab/data.mjs';
const {dealLabRoute}=await loadLab(),{token,publicKey}=await makeAuth(),env=makeEnv(),report=[];
for(const [provider,operation,args] of [
 ['steamstore','search',{term:'Hades'}],['steamstore','price',{appid:'1145360',country:'CN'}],['steamstore','price',{appid:'1145360',country:'US'}],
 ['fx','latest',{}],['cheapshark','deals',{steamAppID:'1145360',pageSize:40}],
 ['gamerpower','filter',{platform:'steam+epic-games-store',type:'game','sort-by':'date'}],
 ['steam','leaderboard',{page:0}],['steam','leaderboard',{page:1}],['steam','trends',{days:30}],
 ['shopsavvy','product_search',{query:'Sennheiser HD 490 Pro',limit:5}],
 ['shopsavvy','product_lookup',{identifier:'products/01d8bf98-247b-a295-1217-08d8e8990e3f'}],
 ['shopsavvy','product_offers',{identifier:'products/01d8bf98-247b-a295-1217-08d8e8990e3f'}]
]){
 try{env.sqlite.exec('DELETE FROM deal_lab_usage');}catch{}
 const response=await dealLabRoute(req(token,{provider,operation,args}),env,publicKey),packet=await response.json();
 const row={provider,operation,http:response.status,cache:packet.cache,error:packet.error||null};
 if(response.ok){
  if(provider==='shopsavvy')row.count=operation==='product_search'?productMatches(packet).length:operation==='product_offers'?productOffers(packet).length:productDetails(packet).model;
  else if(provider==='steam'&&operation==='leaderboard'){row.count=packet.data.items.length;row.total=packet.data.total;row.firstRank=packet.data.items[0].rank;row.snapshotStored=packet.data.snapshotStored;assert.equal(row.firstRank,Number(args.page)*100+1);}
  else if(provider==='steamstore'&&operation==='price'){row.currency=packet.data.game?.price_overview?.currency;row.price=packet.data.game?.price_overview?.final;assert.equal(row.currency,args.country==='CN'?'CNY':'USD');}
  else if(provider==='gamerpower')row.count=retainedGiveaways(packet.data,'').length;
  else if(provider==='fx'){row.date=packet.data.date;assert.ok(packet.data.rates.CNY);}
  else if(operation==='trends'){row.observedDays=packet.data.observedDays;assert.equal(packet.data.monthlyAddCountsAvailable,false);}
  else row.count=packet.data.items?.length||packet.data.length;
  const cached=await(await dealLabRoute(req(token,{provider,operation,args}),env,publicKey)).json();assert.equal(cached.cache,operation==='trends'?'local':'hit');row.repeat=cached.cache;
 }
 report.push(row);console.log(JSON.stringify(row));await writeFile('/tmp/deal-lab-poc-live.json',JSON.stringify(report,null,2));
}
for(const provider of ['serpapi','itad']){const r=await dealLabRoute(req(token,{provider,operation:'search',args:{title:'Hades'}}),env,publicKey);assert.equal(r.status,provider==='serpapi'?410:503);}
console.log('Real local-route upstream results saved to /tmp/deal-lab-poc-live.json');
