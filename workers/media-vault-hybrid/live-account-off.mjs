import assert from 'node:assert/strict';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
assert.ok(process.env.OWNER?.length>=32&&process.env.AGENT?.length>=32,'Configured credentials required');
const targets=[['GET','/app/'],['GET','/app/account.html'],['GET','/app/account-app.js'],['GET','/app/account-session.js'],['GET','/app/native-download.js'],['GET','/app-auth/session'],['POST','/app-auth/pair'],['GET','/app-api/jobs'],['GET','/app-api/quota'],['POST','/app-api/jobs'],['POST','/app-api/download-ticket']];
async function closed(token){
 for(const [method,path] of targets){
  const response=await fetch(base+path,{method,redirect:'error',cache:'no-store',headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(30000)});
  await response.body?.cancel();assert.equal(response.status,404,'Account OFF route differs: '+method+' '+path);
 }
}
await closed();await closed(process.env.OWNER);await closed(process.env.AGENT);
console.log('PASS live account OFF: page, assets, session, pairing, task submission and tickets return 404 for anonymous/Owner/Agent requests');
