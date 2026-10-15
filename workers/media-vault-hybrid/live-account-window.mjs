// No cookie creation, approval or real source requests in this deployment probe.
import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const owner=process.env.OWNER,agent=process.env.AGENT;
assert.ok(owner?.length>=32&&agent?.length>=32,'Configured server credentials required');
let stable=0;
for(let attempt=0;attempt<20;attempt++){
 const results=await Promise.all(['/app/','/app/account-app.js','/app/account-session.js'].map(async path=>{
  const response=await fetch(base+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)}),text=await response.text();
  if(response.status===200){assert.equal(response.headers.get('Cache-Control'),'no-store');if(path==='/app/'){assert.match(text,process.env.OPERATION==='account-submit-on'?/30 分钟账号任务验收/:/20 分钟账号登录验收/);assert.ok(!text.includes('批准后最长保留七天'));}}
  return response.status;
 }));
 stable=results.every(status=>status===200)?stable+1:0;if(stable>=2)break;
 if(attempt<19)await new Promise(r=>setTimeout(r,2000));
}
assert.ok(stable>=2,'Bounded account page propagation did not settle');
for(const token of [undefined,owner,agent])for(const [method,path] of [['GET','/app-auth/session'],['GET','/app-api/jobs'],['GET','/app-api/quota'],['POST','/app-api/jobs'],['POST','/app-api/jobs/cancel'],['POST','/app-api/download-ticket']]){
 const response=await fetch(base+path,{method,cache:'no-store',redirect:'error',headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(30000)});
 await response.body?.cancel();assert.equal(response.status,403,'Unapproved browser and server roles cannot become an approved account');
}
console.log('PASS bounded account page window: scoped page/assets available, cookie-less metadata and all mutation probes denied, no browser session created');
