import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({entryPoints:['src/anythingllm-auth.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {verifyBackendSession}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const pub=await crypto.subtle.exportKey('jwk',keys.publicKey),now=Date.now(),iat=Math.floor(now/1000),nonce='a'.repeat(32);
async function token(extra={},alg='ES256'){
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const a=encode({alg,typ:'JWT'}),b=encode({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-anythingllm',sub:'pt-backend-owner',scope:'chat:gemini',iat,exp:iat+3600,nonce,...extra});
 return a+'.'+b+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(a+'.'+b))).toString('base64url');
}
const valid=await token();assert.equal((await verifyBackendSession(valid,now,pub)).owner,'pt-backend-owner');
assert.equal(await verifyBackendSession(valid,now),null); // Production trusts only its pinned bridge key.
for(const bad of [{aud:'other'},{scope:'admin'},{sub:'other'},{iss:'https://evil.example'},{exp:iat-1},{iat:iat+120,exp:iat+3720},{exp:iat+7200},{nonce:'short'}])assert.equal(await verifyBackendSession(await token(bad),now,pub),null);
assert.equal(await verifyBackendSession(await token({},'none'),now,pub),null);
const parts=valid.split('.');parts[1]=Buffer.from(JSON.stringify({scope:'admin'})).toString('base64url');assert.equal(await verifyBackendSession(parts.join('.'),now,pub),null);
assert.equal(await verifyBackendSession('invalid',now,pub),null);
console.log('Backend sessions: pinned ES256 key, signature, audience, issuer, scope, owner, expiry, max lifetime, nonce and tamper rejection passed.');

assert.equal((await verifyBackendSession(await token({scope:'chat:gemini:probe',sub:'pt-backend-probe',exp:iat+60}),now,pub)).probe,true);
assert.equal(await verifyBackendSession(await token({scope:'chat:gemini:probe',sub:'pt-backend-probe'}),now,pub),null);
