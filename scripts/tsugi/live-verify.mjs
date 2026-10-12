import fs from 'node:fs';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev',headers={'user-agent':'Mozilla/5.0 PT-Universe deployment verification',origin:'https://ximinhu66.github.io'};
const json=async(path,method='GET')=>{const r=await fetch(api+path,{method,headers,signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(path+': '+r.status+' '+JSON.stringify(d));return d};
const health=await json('/api/health');if(health.refresh_revision!=='2026-10-12-source-verification3')throw Error('Site scraper revision not deployed');
const before=await json('/api/data/site-updates.json'),start=Date.now(),queued=await json('/api/refresh/sites','POST');
console.log('Live site refresh',queued.requestId,queued.status);let run;
for(let i=0;i<50;i++){
 const status=await json('/api/status');run=status.runs.find(r=>r.request_id===queued.requestId);
 if(run&&['success','failed'].includes(run.status))break;
 await new Promise(r=>setTimeout(r,5000));
}
if(!run||run.status!=='success')throw Error('Site refresh did not succeed: '+JSON.stringify(run));
const required=['manhuagui','linovelib','copymanga'];
let site;
// D1 completion is immediate; distributed KV can still return the preceding value.
for(let attempt=0;attempt<24;attempt++){
 site=await json('/api/data/site-updates.json?verify='+Date.now());
 if(Date.parse(site.generated_at)>=start-1000)break;
 await new Promise(r=>setTimeout(r,5000));
}

const sources=Object.fromEntries(required.map(id=>{const rows=site.items.filter(x=>x.source===id),old=new Map(before.items.filter(x=>x.source===id).map(x=>[x.url,x.latest]));return [id,{...site.sources[id],changed:rows.filter(x=>old.has(x.url)&&old.get(x.url)!==x.latest).length,examples:rows.filter(x=>x.latest_checked_at).slice(0,3).map(x=>({title:x.title,latest:x.latest,updated_text:x.updated_text,latest_checked_at:x.latest_checked_at}))}]}));
const report={revision:health.refresh_revision,requestId:queued.requestId,generated_at:site.generated_at,elapsedMs:Date.now()-start,sources};fs.writeFileSync('/tmp/pt-tsugi-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
for(const id of required){const s=sources[id];if(!s?.ok||!(s.verifiedChapterCount>0))throw Error(id+': no newly verified chapters');}
if(Date.parse(site.generated_at)<start-1000)throw Error('Refresh served previous snapshot');
