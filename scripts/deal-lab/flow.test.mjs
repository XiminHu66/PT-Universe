// Browser-independent controller test. DOM/fetch fixtures; not a live API or browser claim.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../workers/pt-universe-api/package.json',import.meta.url));
const {build}=require('esbuild'),{parseHTML}=require('linkedom');
const source=await readFile(new URL('../../apps/deal-lab/app.js',import.meta.url),'utf8');
const result=await build({stdin:{contents:source+'\nglobalThis.testLab={query,state,setPage};',resolveDir:new URL('../../apps/deal-lab/',import.meta.url).pathname},bundle:true,format:'iife',platform:'browser',write:false});
const {window}=parseHTML(await readFile(new URL('../../apps/deal-lab/index.html',import.meta.url),'utf8'));
const storage=new Map(),session=new Map(),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),issued=Math.floor(Date.now()/1000);
session.set('pt.monitor.session.v1','header.'+encode({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-monitor',sub:'pt-backend-owner',scope:'monitor:manage',iat:issued,exp:issued+3600,nonce:'a'.repeat(48)})+'.fixture');
const makeStore=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
let clock=Date.now(),mode='success',requests=0,ticks=0,cancelWait=false;
class TestDate extends Date{static now(){return clock;}}
const context=vm.createContext({window,document:window.document,location:{origin:'https://ximinhu66.github.io',pathname:'/PT-Universe/apps/deal-lab/',search:'',hash:'',assign(){}},history:{replaceState(){}},localStorage:makeStore(storage),sessionStorage:makeStore(session),navigator:{},URL,URLSearchParams,AbortController,AbortSignal,DOMException,Date:TestDate,Intl,atob,console,setTimeout:(fn,ms)=>{ticks++;if(cancelWait)queueMicrotask(()=>context.testLab.setPage('saved'));queueMicrotask(()=>{clock+=ms;fn();});return ticks;},clearTimeout(){},fetch:async(url,init)=>{
 if(url.endsWith('/status'))return Response.json({authorized:true,sources:{cheapshark:{configured:true,budget:{cooldown:10}}}});
 requests++;if(mode==='failure')return Response.json({error:'fixture rate limit',retryAfter:120},{status:429});
 return Response.json({provider:'cheapshark',operation:'stores',data:[],httpStatus:200,cache:mode==='cached'?'hit':'miss',fetchedAt:new Date(clock).toISOString()});
}});
window.history=context.history;
vm.runInContext(result.outputFiles[0].text,context);await new Promise(setImmediate);
const {query,state,setPage}=context.testLab;
assert.equal(requests,0,'loading must never query an upstream');
await query('cheapshark','stores',{});assert.equal(requests,1);assert.ok(state.cooldowns.cheapshark>clock);
mode='cached';const before=clock;await query('cheapshark','stores',{});assert.equal(clock,before,'known cached queries should not wait');assert.equal(requests,2);
mode='success';await query('cheapshark','games',{title:'Hades'});assert.equal(requests,3);assert.ok(ticks>0,'a manually chosen uncached operation waits for the prior cooldown');
state.cooldowns.cheapshark=clock+2000;cancelWait=true;await query('cheapshark','games',{title:'Portal'});assert.equal(requests,3,'switching page cancels a queued query before outbound work');assert.equal(state.page,'saved');assert.equal(state.busy,false);
cancelWait=false;state.cooldowns.cheapshark=0;mode='failure';await query('cheapshark','stores',{});assert.equal(requests,4);assert.ok(state.cooldowns.cheapshark>=clock+120000);assert.equal(requests,4,'upstream failure must not auto-retry');
setPage('overview');assert.equal(window.document.querySelector('#notice').textContent,'','old-page success/error notices must clear');
console.log('PASS: controller fixtures verify no background API query, cached repeat, manual cooldown countdown, navigation cancellation, no upstream auto-retry and cleared page feedback.');
