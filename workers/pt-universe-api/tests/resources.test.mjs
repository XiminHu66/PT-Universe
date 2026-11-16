import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
const output=await build({entryPoints:['src/resources.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {resourcesRoute,verifyResourceToken}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey),now=Math.floor(Date.now()/1000);
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
async function grant(scope='resources:read',extra={}){const m=enc({alg:'ES256',typ:'JWT'})+'.'+enc({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-resources',scope,sub:'pt-backend-owner',iat:now,exp:now+(scope==='resources:configure'?60:86400),nonce:'a'.repeat(48),...extra});return m+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,Buffer.from(m))).toString('base64url');}
const stored=new Map(),env={RESOURCE_GITHUB_TOKEN:'SUPPLIER_SECRET_NEVER_RETURN',PT_UNIVERSE_DATA:{get:async k=>stored.get(k)||null,put:async(k,v)=>stored.set(k,v)}};
const req=(path,token='',method='GET',body,origin='https://ximinhu66.github.io')=>new Request('https://api.example/api/resources/'+path,{method,headers:{authorization:'Bearer '+token,origin},...(body?{body}:{} )});
const read=await grant();assert.ok(await verifyResourceToken(read,'resources:read',Date.now(),publicKey));
for(const extra of [{scope:'vps:read'},{aud:'pt-universe-vps'},{sub:'someone-else'},{exp:now-1},{exp:now+86401},{nonce:'bad'}])assert.equal(await verifyResourceToken(await grant('resources:read',extra),'resources:read',Date.now(),publicKey),null);
assert.equal((await resourcesRoute(req('data'),env,publicKey)).status,401);assert.equal((await resourcesRoute(req('data',read,'GET',undefined,'https://evil.example'),env,publicKey)).status,403);
assert.equal((await resourcesRoute(req('data',read,'POST'),env,publicKey)).status,405);assert.equal((await resourcesRoute(req('data',read),env,publicKey)).status,503);
const body=JSON.stringify({generatedAt:new Date().toISOString(),repositories:[{name:'private-fixture',visibility:'private',workflows:[]}],projects:[{platform:'VPS',name:'server'},{platform:'Sites',name:'remove'}],quotas:[{id:'a',provider:'GitHub Actions'},{id:'b',provider:'第三方 API'}],providerNotes:{'GitHub Actions':'x','第三方 API':'remove'}}),digest=Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(body))).toString('hex'),configure=await grant('resources:configure',{digest});
assert.equal((await resourcesRoute(req('bootstrap',read,'POST',body),env,publicKey)).status,401);assert.equal((await resourcesRoute(req('bootstrap',configure,'POST',body+' '),env,publicKey)).status,400);assert.equal(stored.size,0);
assert.equal((await resourcesRoute(req('bootstrap',configure,'POST',body),env,publicKey)).status,200);
const response=await resourcesRoute(req('data',read),env,publicKey),text=await response.text(),data=JSON.parse(text);assert.equal(response.headers.get('cache-control'),'private,no-store');assert.equal(data.quotas.length,1);assert.equal(data.projects.length,1);assert.equal(data.repositories[0].visibility,'private');assert.ok(!text.includes('SUPPLIER_SECRET_NEVER_RETURN'));assert.ok(data.connections.every(c=>!['openrouter','serpapi','gemini'].includes(c.id)));
assert.equal((await resourcesRoute(req('auto?provider=openrouter',read),env,publicKey)).status,400);assert.equal((await resourcesRoute(req('auto?provider=cloudflare&url=https://evil.example',read),env,publicKey)).status,400);
const pending=await resourcesRoute(req('auto?provider=cloudflare',read),env,publicKey);assert.equal((await pending.json()).status.state,'needs_authorization');
console.log('PASS: dedicated resource audience/scope, nonce and expiry, origin protection, digest-bound private migration, read-only APIs, supplier-secret isolation and three-provider scope.');

let browserCalls=0;const browserReader=async()=>{browserCalls++;return {status:{provider:'browser',state:'partial'},quotas:[]};};
assert.equal((await resourcesRoute(req('browser'),env,publicKey,browserReader)).status,401);assert.equal(browserCalls,0);
assert.equal((await resourcesRoute(req('browser',read),env,publicKey,browserReader)).status,200);assert.equal(browserCalls,1);
assert.equal((await resourcesRoute(req('browser?url=https://evil.example',read),env,publicKey,browserReader)).status,400);assert.equal(browserCalls,1);
console.log('PASS: Browser metadata requires the dedicated read grant and rejects arbitrary parameters before touching the binding.');

for (const [path, token, method, origin, expected] of [
 ['releases', '', 'GET', 'https://ximinhu66.github.io', 401],
 ['releases', read, 'POST', 'https://ximinhu66.github.io', 405],
 ['releases', read, 'GET', 'https://evil.example', 403],
 ['releases?repo=other', read, 'GET', 'https://ximinhu66.github.io', 400]
]) assert.equal((await resourcesRoute(req(path,token,method,undefined,origin),env,publicKey)).status,expected);
console.log('PASS: release records are owner-authenticated, read-only, and reject arbitrary inputs.');

const usageBundle=await build({entryPoints:['src/usage.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {usageVisit,recordUsageAccount,usageSummary,pruneUsage}=await import('data:text/javascript;base64,'+Buffer.from(usageBundle.outputFiles[0].text).toString('base64'));
const sqlite=new DatabaseSync(':memory:');
const db={
 prepare(sql){const statement=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async run(){return statement.run(...args);},async first(){return statement.get(...args)||null;}};},
 async batch(statements){return Promise.all(statements.map(statement=>statement.run()));},
};
const own=crypto.randomUUID(),other=crypto.randomUUID(),workerOrigin='https://ximinhu66.github.io';
let allowance=true;
const usageEnv={...env,DB:db,USAGE_VISIT_LIMIT:{async limit(){return {success:allowance};}}};
const visit=(site,id=own,origin=workerOrigin,ip='192.0.2.1')=>new Request('https://api.example/api/usage/visit',{method:'POST',headers:{origin,'cf-connecting-ip':ip},body:JSON.stringify({site,id})});
assert.equal(await usageVisit(visit('nexus',own,'https://evil.example'),usageEnv),403);
allowance=false;assert.equal(await usageVisit(visit('nexus'),usageEnv),429);allowance=true;
assert.equal(await usageVisit(new Request('https://api.example/api/usage/visit',{method:'POST',headers:{origin:workerOrigin,'cf-connecting-ip':'192.0.2.1'},body:'x'.repeat(513)}),usageEnv),400);
assert.equal(await usageVisit(visit('bad'),usageEnv),400);
await Promise.all(['nexus','nexus','universe'].map(async kind=>assert.equal(await usageVisit(visit(kind),usageEnv),204)));
await Promise.all([recordUsageAccount(db,own,'sync'),recordUsageAccount(db,other,'shared-ai'),recordUsageAccount(db,other,'shared-ai')]);
const hashId=async(type,id)=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pt-usage:'+type+':'+id))).toString('hex');
const marks=JSON.stringify({browser:await hashId('browser',own),accounts:[await hashId('account',own)]});
assert.equal((await resourcesRoute(req('usage'),usageEnv,publicKey)).status,401);
assert.equal((await resourcesRoute(req('usage',read,'GET',undefined,'https://evil.example'),usageEnv,publicKey)).status,403);
assert.equal((await resourcesRoute(req('usage',configure,'POST',marks),usageEnv,publicKey)).status,401);
assert.equal((await resourcesRoute(req('usage',read,'POST',JSON.stringify({browser:own,accounts:[]})),usageEnv,publicKey)).status,400);
assert.equal((await resourcesRoute(req('usage',read,'POST',marks),usageEnv,publicKey)).status,200);
const aggregate=await resourcesRoute(req('usage',read),usageEnv,publicKey);
assert.equal(aggregate.headers.get('cache-control'),'private,no-store');
const numbers=await aggregate.text();
assert.ok(![own,other,marks,'192.0.2.1'].some(value=>numbers.includes(value)));
assert.deepEqual(JSON.parse(numbers).today,{browsers:1,ownBrowsers:1,nexusBrowsers:1,accounts:2,ownAccounts:1,sharedAiAccounts:1,ownSharedAiAccounts:0});
assert.equal(sqlite.prepare('select count(*) as n from pt_usage_activity').get().n,4);
assert.ok(sqlite.prepare('select identity from pt_usage_activity').all().every(row=>/^[0-9a-f]{64}$/.test(row.identity)));
await recordUsageAccount(db,other,'sync',new Date('2026-11-01T07:05:00Z'));
assert.equal((await usageSummary(db,new Date('2026-11-01T07:10:00Z'))).today.accounts,1);
assert.equal((await usageSummary(db,new Date('2026-11-01T06:59:00Z'))).today.accounts,0);
await pruneUsage(db,new Date('2026-11-17T20:00:00Z'));
assert.equal(sqlite.prepare("select count(*) as n from pt_usage_activity where day='2026-11-01'").get().n,0);
sqlite.close();
console.log('PASS: usage reports require owner auth, rate-limited browser intake deduplicates, shared AI accounts include direct requests, and IDs/IP do not appear in reports.');
