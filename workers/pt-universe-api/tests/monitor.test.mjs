import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/monitor.ts'],bundle:true,platform:'node',format:'esm',write:false}),{monitorRoute,verifyMonitorToken,allowedMonitorPath}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey),issued=Math.floor(Date.now()/1000);
async function token(extra={}){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),a=enc({alg:'ES256',typ:'JWT'}),b=enc({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-monitor',sub:'pt-backend-owner',scope:'monitor:manage',iat:issued,exp:issued+3600,nonce:'a'.repeat(48),...extra});return a+'.'+b+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(a+'.'+b))).toString('base64url')}
const auth=await token();assert.ok(await verifyMonitorToken(auth,Date.now(),publicKey));
for(const bad of [{aud:'pt-universe-vps'},{scope:'vps:read'},{sub:'other'},{exp:issued+3601},{exp:issued-1},{nonce:'short'},{iat:issued+31}])assert.equal(await verifyMonitorToken(await token(bad),Date.now(),publicKey),null);
assert.equal(await verifyMonitorToken(auth.slice(0,-5)+'abcde',Date.now(),publicKey),null);
const req=(path='/state',method='GET',bearer=auth,origin='https://ximinhu66.github.io',body)=>new Request('https://api.example/api/monitor'+path,{method,headers:{origin,authorization:'Bearer '+bearer},...(body?{body}:{} )});
const env={PT_UNIVERSE_DATA:{get:async()=>null}};
assert.equal((await monitorRoute(req('/state','GET',''),env,publicKey)).status,401);
assert.equal((await monitorRoute(req('/state','GET',auth,'https://evil.example'),env,publicKey)).status,403);
assert.equal((await monitorRoute(req('/state?url=https://evil.example'),env,publicKey)).status,400);
assert.equal((await monitorRoute(req('/hub/accounts'),env,publicKey)).status,400);
assert.equal((await monitorRoute(req('/objects','POST',auth,undefined,'x'.repeat(40000)),env,publicKey)).status,413);
assert.equal((await monitorRoute(req(),env,publicKey)).status,503);
for(const [path,method]of [['/evidence/00000000-0000-4000-8000-000000000000','GET'],['/sources/00000000-0000-4000-8000-000000000000/check','POST']])assert.ok(allowedMonitorPath(path,method));
for(const p of ['/../state','/state?x=1','/sources/%2e%2e/admin','/knowledge/status'])assert.equal(allowedMonitorPath(p,'GET'),false);
console.log('PASS: monitor-specific signatures, expiry and nonce; scope isolation; origin, route and body limits; transport failure remains private');
