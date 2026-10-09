import assert from 'node:assert/strict';
import fs from 'node:fs';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev/api/hub/';
const checks=[{q:'hd 490 pro',mode:'product',re:/hd[ \-]*490/i},{q:'华为刹车会被踩断',mode:'claim',re:/刹车|制动|踏板/}];
const report=[];
for(const check of checks){
 let body,response;
 for(let attempt=0;attempt<3;attempt++){
  const query=new URLSearchParams({q:check.q,mode:check.mode});if(attempt)query.set('refresh','1');
  response=await fetch(api+'check/search?'+query,{headers:{origin:'https://ximinhu66.github.io','user-agent':'PT-Universe deployment verification'},signal:AbortSignal.timeout(35000)});body=await response.json();
  if(response.ok&&body.providers&&body.items?.length)break;
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,4000));
 }
 assert.equal(response.status,200,body.error);assert.ok(body.providers,'updated search release must expose provider states');assert.ok(body.items?.length,'empty result for '+check.q+': '+JSON.stringify(body.errors));assert.ok(body.items.filter(x=>check.re.test(x.title+' '+x.excerpt)).length>=Math.ceil(body.items.length*.6),'mostly irrelevant results for '+check.q);assert.ok(body.items.some(x=>x.readable),'need at least one readable original source');
 report.push({query:check.q,count:body.items.length,providers:body.providers,checked_at:body.checked_at,cached:body.cached,stale:body.stale,urls:body.items.map(x=>x.url)});console.log(check.q,body.items.length,'relevant candidates');
}
fs.writeFileSync('/tmp/check-search-live.json',JSON.stringify(report,null,2));
