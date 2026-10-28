import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['src/vps.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {vpsRoute,verifyVpsToken,sanitizeVpsSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
const gateway=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),issued=Math.floor(Date.now()/1000);
async function token(extra={}){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),a=enc({alg:'ES256',typ:'JWT'}),b=enc({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-vps',sub:'pt-backend-owner',scope:'vps:read',iat:issued,exp:issued+86400,nonce:'a'.repeat(48),...extra});return a+'.'+b+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(a+'.'+b))).toString('base64url');}
const auth=await token();assert.ok(await verifyVpsToken(auth,Date.now(),publicKey));
for(const extra of [{aud:'pt-universe-knowledge'},{scope:'knowledge:session'},{scope:'vps:write'},{sub:'someone-else'},{exp:issued-1},{exp:issued+86401},{nonce:'short'}])assert.equal(await verifyVpsToken(await token(extra),Date.now(),publicKey),null);
const config={origin:'https://fixed-private-backend.trycloudflare.com',siteOrigin:'https://pt-vps-tools.h1nano.chatgpt.site',jwk:await crypto.subtle.exportKey('jwk',gateway.privateKey),revision:'fixture'};
const env={PT_UNIVERSE_DATA:{get:async key=>key==='private/knowledge/vps-transport-v1'?JSON.stringify(config):null}};
const req=(path='/overview',method='GET',bearer=auth,origin='https://ximinhu66.github.io')=>new Request('https://api.example/api/vps'+path,{method,headers:{origin,authorization:'Bearer '+bearer}});
assert.equal((await vpsRoute(req('/overview','GET',''),env,publicKey)).status,401);
assert.equal((await vpsRoute(req('/overview','POST'),env,publicKey)).status,405);
assert.equal((await vpsRoute(req('/overview?url=https://evil.example'),env,publicKey)).status,400);
assert.equal((await vpsRoute(req('/hub/accounts'),env,publicKey)).status,400);
assert.equal((await vpsRoute(req('/overview','GET',auth,'https://evil.example'),env,publicKey)).status,403);
const now=new Date().toISOString(),metrics={sampleAt:now,fetchedAt:now,cpu:{percent:5,load:[.1,.2,.3]},memory:{totalBytes:12e9,usedBytes:4e9,percent:33},disk:{totalBytes:44e9,freeBytes:20e9,usedBytes:24e9,percent:55},network:{sentBytesPerSecond:10,receivedBytesPerSecond:20},history:[{at:now,cpu:5,memory:33,disk:55}],privateToken:'PRIVATE_MUST_NOT_LEAK'};
const original=globalThis.fetch,calls=[];
try{
 globalThis.fetch=async(url,init)=>{
  const u=new URL(url);calls.push({path:u.pathname,method:init.method});
  assert.equal(u.origin,config.origin);assert.equal(init.method,'GET');assert.equal(init.headers.get('cookie'),null);
  const h=init.headers,message=['pt-gateway-v1','hub','GET',u.pathname,h.get('x-pt-time'),h.get('x-pt-nonce'),config.siteOrigin,''].join('\n');
  assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},gateway.publicKey,Buffer.from(h.get('x-pt-signature'),'base64url'),Buffer.from(message)));
  if(u.pathname==='/hub/api/metrics')return Response.json(metrics);
  assert.equal(u.pathname,'/hub/status');return Response.json({items:[{name:'moodist',ok:true,status:200,secret:'PRIVATE_MUST_NOT_LEAK'},{name:'unknown-admin',ok:true,status:200}]});
 };
 const r=await vpsRoute(req(),env,publicKey),text=await r.text();assert.equal(r.status,200);assert.ok(!text.includes('PRIVATE_MUST_NOT_LEAK')&&!text.includes('unknown-admin')&&!text.includes(config.jwk.d));assert.equal(JSON.parse(text).memory.totalBytes,12e9);
 assert.deepEqual(calls.map(c=>c.path).sort(),['/hub/api/metrics','/hub/status']);
 assert.equal((await vpsRoute(req(),env,publicKey)).status,200);assert.equal(calls.length,2,'visible polling uses the bounded server snapshot cache');
}finally{globalThis.fetch=original;}
assert.throws(()=>sanitizeVpsSnapshot({metrics:{...metrics,sampleAt:'invalid'}}));
console.log('PASS: independent read-only grants, signed fixed-route VPS requests, cross-origin and mutation rejection, credential filtering, real-sample validation and bounded polling cache.');
