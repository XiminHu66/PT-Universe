import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=readFileSync('../../apps/daily-nexus/index.html','utf8'),source=readFileSync('../../apps/daily-nexus/vps-tab.js','utf8');
const now=Date.now(),nonce='a'.repeat(48),payload={aud:'pt-universe-vps',scope:'vps:read',exp:Math.floor(now/1000)+3600,nonce};
const token='header.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.signature';
async function run({active=true,returned=true,badNonce=false}={}){
 const {document}=parseHTML(html),panel=document.querySelector('#view-vps');panel.classList.toggle('active',active);Object.defineProperty(document,'hidden',{value:false,writable:true});
 const data=new Map(),events=new Map(),calls=[],intervals=[];
 if(returned)data.set('pt-nexus-vps-connect-v1',JSON.stringify({nonce:badNonce?'b'.repeat(48):nonce,expiresAt:now+60000}));
 else data.set('pt-nexus-vps-session-v1',token);
 const initial='https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=vps'+(returned?'#vps-session='+token+'&nonce='+nonce:'');
 const location={href:initial,hash:new URL(initial).hash,assign:url=>calls.push({navigate:url})};
 const sandbox={document,URL,URLSearchParams,crypto,atob,AbortSignal,Date,Map,JSON,Math,Number,String,
  location,history:{state:{preserved:true},replaceState(state,title,url){assert.ok(state.preserved);location.href=url;location.hash=new URL(url).hash;}},
  sessionStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},
  addEventListener:(t,fn)=>events.set(t,fn),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},
  fetch:async(url,init)=>{calls.push({url,auth:init.headers.authorization});return Response.json({sampleAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),cpu:{percent:12.3,load:[.1,.2,.3]},memory:{percent:30,totalBytes:12e9,usedBytes:4e9},disk:{percent:50,totalBytes:40e9,freeBytes:20e9},network:{sentBytesPerSecond:50,receivedBytesPerSecond:100},uptimeSeconds:86400,history:[],services:[{name:'moodist',ok:true}]});}
 };
 vm.runInNewContext(source,sandbox);await new Promise(r=>setImmediate(r));
 return {document,panel,data,events,calls,intervals,location};
}
const good=await run();assert.equal(good.location.hash,'');assert.ok(!good.location.href.includes(token));assert.equal(good.data.get('pt-nexus-vps-session-v1'),token);assert.equal(good.document.querySelector('#vpsCpu').textContent,'12.3%');assert.equal(good.calls[0].auth,'Bearer '+token);assert.equal(good.document.querySelectorAll('.vps-tool').length,15);assert.equal(good.document.querySelectorAll('#view-vps iframe').length,0);
good.document.hidden=true;good.intervals[0]();await new Promise(r=>setImmediate(r));assert.equal(good.calls.length,1);
good.document.querySelector('#vpsDisconnect').onclick();assert.equal(good.data.has('pt-nexus-vps-session-v1'),false);assert.equal(good.document.querySelector('#vpsCpu').textContent,'—');
const hidden=await run({active:false,returned:false});assert.equal(hidden.calls.length,0);hidden.panel.classList.add('active');hidden.events.get('nexus-view-change')();await new Promise(r=>setImmediate(r));assert.equal(hidden.calls.length,1);
const wrong=await run({badNonce:true});assert.equal(wrong.calls.length,0);assert.equal(wrong.data.has('pt-nexus-vps-session-v1'),false);assert.ok(wrong.document.querySelector('#vpsMessage').textContent.includes('校验未通过'));
console.log('PASS: nonce-bound return with URL cleanup, session-only token, all tool links, actual card rendering, no nested navigation, hidden-tab pause and disconnect.');
