import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base='https://pt-media-hybrid.summer07-nanjolno.workers.dev';
const targets=[['GET','/app/'],['GET','/app/account.html'],['GET','/app/account-app.js'],['GET','/app/account-session.js'],['GET','/app/account-form.js'],['GET','/app-api/novel/catalog?url=https%3A%2F%2Fwww.wenku8.net%2Fbook%2F3551.htm'],['GET','/app/native-download.js'],['GET','/app-auth/session'],['POST','/app-auth/pair'],['GET','/app-api/jobs'],['GET','/app-api/quota'],['POST','/app-api/jobs'],['POST','/app-api/download-ticket']];
export async function verifyAccountOff({owner,agent,fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}={}){
 assert.ok(owner?.length>=32&&agent?.length>=32,'Configured credentials required');
 let stable=0;
 for(let round=0;round<attempts;round++){
  const statuses=await Promise.all([undefined,owner,agent].flatMap(token=>targets.map(async([method,path])=>{
   const response=await fetcher(base+path,{method,redirect:'error',cache:'no-store',headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(30000)});
   await response.body?.cancel();
   // Old unauthenticated fallthrough can return 401 during propagation. Never
   // conceal a successful/redirecting account endpoint during an OFF deploy.
   assert.ok(response.status>=400,'Account OFF route unexpectedly accessible: '+method+' '+path+' status='+response.status);
   return response.status;
  })));
  stable=statuses.every(status=>status===404)?stable+1:0;
  if(stable>=2){console.log('PASS live account OFF: page, assets, session, pairing, task submission and tickets return stable 404 for anonymous/Owner/Agent requests');return;}
  if(round+1<attempts)await pause(2000);
 }
 throw Error('Account OFF routes did not converge to stable 404 within the bounded propagation check');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyAccountOff({owner:process.env.OWNER,agent:process.env.AGENT});
