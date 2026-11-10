import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=readFileSync('../../apps/daily-nexus/index.html','utf8'),source=readFileSync('../../apps/daily-nexus/vps-tab.js','utf8').replace(/^import .*;\n/gm,'');
const now=Date.now(),nonce='a'.repeat(48),claims={iss:'https://pt-vps-tools.h1nano.chatgpt.site',sub:'pt-backend-owner',aud:'pt-universe-vps',scope:'vps:read',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,nonce};
const signed=extra=>'header.'+Buffer.from(JSON.stringify({...claims,...extra})).toString('base64url')+'.signature',token=signed({});
const sample={sampleAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),cpu:{percent:12.3,load:[.1,.2,.3]},memory:{percent:30,totalBytes:12e9,usedBytes:4e9},disk:{percent:50,totalBytes:40e9,freeBytes:20e9},network:{sentBytesPerSecond:50,receivedBytesPerSecond:100},uptimeSeconds:86400,history:[],services:[{name:'moodist',ok:true}]};
async function run({active=true,returned=true,badNonce=false,cached=true,value=token,paused=false,recent=false,status=200,deferred=false,blockedStorage=false,sharedGrant=false}={}){
 const {document}=parseHTML(html),panel=document.querySelector('#view-vps');panel.classList.toggle('active',active);Object.defineProperty(document,'hidden',{value:false,writable:true});
 const data=new Map(),events=new Map(),calls=[],intervals=[];let finish,resourceToken=sharedGrant?'fixture-resource-grant':'';
 if(returned)data.set('pt-nexus-vps-connect-v1',JSON.stringify({nonce:badNonce?'b'.repeat(48):nonce,expiresAt:now+60000}));
 else if(cached)data.set('pt-nexus-vps-session-v1',value);
 if(paused)data.set('pt-nexus-vps-paused-v1','1');if(recent)data.set('pt-nexus-vps-auto-attempt-v1',String(now));
 const initial='https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=vps'+(returned?'#vps-session='+value+'&nonce='+nonce:'');
 const location={href:initial,hash:new URL(initial).hash,assign:url=>calls.push({navigate:url})};
 const sandbox={document,RESOURCE_API:'https://fixture.example/api/resources',resourceSession:()=>resourceToken,clearResourceSession:()=>{resourceToken=''},connectResources:(manual,view)=>{if(blockedStorage)throw Error('Storage blocked');if(recent&&!manual)throw Error('Connection pending');calls.push({connect:true,manual,view});return new Promise(()=>{});},URL,URLSearchParams,crypto,atob,AbortSignal,Date,Map,JSON,Math,Number,String,
  location,history:{state:{preserved:true},replaceState(state,title,url){assert.ok(state.preserved);location.href=url;location.hash=new URL(url).hash;}},
  sessionStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>{if(blockedStorage)throw Error('blocked');data.set(k,v);},removeItem:k=>data.delete(k)},
  addEventListener:(t,fn)=>events.set(t,fn),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},
  fetch:async(url,init)=>{calls.push({url,auth:init.headers.authorization,credentials:init.credentials});if(deferred)await new Promise(resolve=>finish=resolve);return Response.json(status===200?sample:{error:'fixture failure'},{status});}
 };
 vm.runInNewContext(source,sandbox);await new Promise(r=>setImmediate(r));
 return {document,panel,data,events,calls,intervals,location,finish:()=>finish?.()};
}
const good=await run();assert.equal(good.location.hash,'');assert.ok(!good.location.href.includes(token));assert.equal(good.data.get('pt-nexus-vps-session-v1'),token);assert.equal(good.document.querySelector('#vpsCpu').textContent,'12.3%');assert.equal(good.calls[0].auth,'Bearer '+token);assert.equal(good.calls[0].credentials,'omit');assert.equal(good.document.querySelectorAll('.vps-tool').length,19);assert.equal(good.document.querySelectorAll('#view-vps iframe').length,0);assert.equal(good.document.querySelectorAll('#vpsTools .vps-tool').length,12);assert.equal(good.document.querySelectorAll('#otherTools .vps-tool').length,7);assert.equal(good.document.querySelectorAll('[data-tool=karakeep]').length,1);
assert.equal(good.document.querySelectorAll('[data-tool=koito]').length,0);assert.equal(good.document.querySelector('#vpsPrimaryCount').textContent,'12');assert.equal(good.document.querySelector('#vpsOtherCount').textContent,'7');
good.document.hidden=true;good.intervals[0]();await new Promise(r=>setImmediate(r));assert.equal(good.calls.length,1);
good.document.querySelector('#vpsDisconnect').onclick();good.document.hidden=false;good.events.get('nexus-view-change')();await new Promise(r=>setImmediate(r));assert.equal(good.data.has('pt-nexus-vps-session-v1'),false);assert.equal(good.document.querySelector('#vpsCpu').textContent,'—');assert.equal(good.calls.length,1,'manual disconnect must suppress automatic reconnection');
const hidden=await run({active:false,returned:false,cached:false});assert.equal(hidden.calls.length,0);hidden.panel.classList.add('active');hidden.events.get('nexus-view-change')();await new Promise(r=>setImmediate(r));assert.equal(hidden.calls.length,1);assert.equal(hidden.calls[0].connect,true);
const fresh=await run({returned:false,cached:false});assert.equal(fresh.calls.length,1);assert.equal(fresh.calls[0].connect,true);assert.equal(fresh.calls[0].manual,false);assert.equal(fresh.calls[0].view,'vps');assert.equal(fresh.calls.filter(x=>x.navigate).length,0,'automatic auth must not navigate the shell');
fresh.events.get('nexus-view-change')();fresh.intervals[0]();assert.equal(fresh.calls.length,1,'one navigation per connection attempt');
const saved=await run({returned:false});assert.equal(saved.calls.filter(x=>x.navigate).length,0);assert.equal(saved.calls.length,1);
for(const value of [signed({exp:Math.floor(now/1000)-1}),signed({iss:'https://evil.example'}),signed({scope:'vps:write'}),signed({sub:'another-user'})]){const expired=await run({returned:false,value});assert.equal(expired.calls.length,1);assert.equal(expired.calls[0].connect,true);assert.equal(expired.data.has('pt-nexus-vps-session-v1'),false);}
const wrong=await run({badNonce:true});assert.equal(wrong.calls.length,0);assert.equal(wrong.data.has('pt-nexus-vps-session-v1'),false);assert.ok(wrong.document.querySelector('#vpsMessage').textContent.includes('校验未通过'));
const stopped=await run({returned:false,cached:false,paused:true});assert.equal(stopped.calls.length,0);stopped.document.querySelector('#vpsConnect').onclick();assert.equal(stopped.calls[0].connect,true);assert.equal(stopped.data.has('pt-nexus-vps-paused-v1'),false);
const loop=await run({returned:false,cached:false,recent:true});assert.equal(loop.calls.length,0);assert.equal(loop.document.querySelector('#vpsState').dataset.state,'error');loop.document.querySelector('#vpsConnect').onclick();assert.equal(loop.calls.length,1);
const rejected=await run({returned:false,status:401});assert.equal(rejected.calls.length,2);assert.equal(rejected.calls[1].connect,true);
const outage=await run({returned:false,status:503});assert.equal(outage.calls.length,1);assert.equal(outage.data.get('pt-nexus-vps-session-v1'),token,'backend outages must not discard an authorization');
const late=await run({returned:false,deferred:true});late.document.querySelector('#vpsDisconnect').onclick();late.finish();await new Promise(r=>setImmediate(r));assert.equal(late.document.querySelector('#vpsCpu').textContent,'—');assert.equal(late.calls.length,1,'late replies must not reconnect or repopulate disconnected monitoring');
const storage=await run({returned:false,cached:false,blockedStorage:true});assert.equal(storage.calls.length,0);assert.equal(storage.document.querySelector('#vpsState').dataset.state,'error');
const shared=await run({returned:false,cached:false,sharedGrant:true});assert.equal(shared.calls.length,1);assert.equal(shared.calls[0].url,'https://fixture.example/api/resources/vps');assert.equal(shared.calls[0].auth,'Bearer fixture-resource-grant');assert.equal(shared.document.querySelector('#vpsCpu').textContent,'12.3%');assert.equal(shared.calls.filter(x=>x.connect||x.navigate).length,0,'reuse the resource connection without any auth navigation');
console.log('PASS: automatic owner-SSO connection/renewal, fixed nonce return and URL cleanup, session-only read grants, no iframe, no retry loops, pause/hidden behavior, late response rejection, all 19 retained tool entries and server outages.');
await import('./monitor-ui.test.mjs');

await import('../../../scripts/resource-center/auth.test.mjs');

