import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=readFileSync('../../apps/daily-nexus/index.html','utf8'),source=readFileSync('../../apps/daily-nexus/monitor-tab.js','utf8');
const {document}=parseHTML(html),events=new Map(),messages=[],childEvents=[],timers=new Map();let clock=Date.now(),timerId=0;
class Clock extends Date{static now(){return clock}}
const panel=document.querySelector('#view-monitor'),frame=document.querySelector('#monitorFrame');
const child={postMessage:(message,origin)=>messages.push({message,origin}),dispatchEvent:e=>childEvents.push(e.type)};
Object.defineProperty(frame,'contentWindow',{value:child});Object.defineProperty(document,'hidden',{value:false,writable:true});
let load;frame.addEventListener=(name,fn)=>{if(name==='load')load=fn;};
const location={href:'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=home',origin:'https://ximinhu66.github.io'};
const window={addEventListener:(name,fn)=>events.set(name,fn)};
vm.runInNewContext(source,{document,window,location,history:{state:null,replaceState:(_,__,url)=>{location.href=String(url);}},URL,Event,Date:Clock,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),MutationObserver:class{observe(){}}});
assert.equal(frame.getAttribute('src'),null);assert.equal(timers.size,0);assert.equal(document.querySelector('#monitorStandalone'),null);
panel.classList.add('active');events.get('nexus-view-change')();assert.match(frame.src,/embedded=nexus&view=overview$/);load();
assert.equal(messages.at(-1).message.active,true);assert.equal(messages.at(-1).message.view,'overview');assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,300000);
document.querySelector('[data-monitor-view=projects]').click();assert.equal(messages.at(-1).message.view,'projects');assert.equal(new URL(location.href).searchParams.get('monitor'),'projects');
const emit=(origin,source,data)=>events.get('message')({origin,source,data});
emit('https://evil.example',child,{type:'pt-resource-view',view:'settings'});emit(location.origin,{}, {type:'pt-resource-view',view:'settings'});assert.equal(document.querySelector('[data-monitor-view=projects]').getAttribute('aria-current'),'page');
emit(location.origin,child,{type:'pt-resource-view',view:'settings'});assert.equal(document.querySelector('[data-monitor-view=settings]').getAttribute('aria-current'),'page');
emit(location.origin,child,{type:'pt-resource-status',connected:true,busy:false,message:'fixture updated'});assert.equal(document.querySelector('#monitorStatus').textContent,'已连接 · 自动更新');
document.querySelector('#monitorRefresh').click();assert.equal(messages.at(-1).message.action,'refresh');assert.equal(messages.at(-1).message.force,true);
const [id,tick]=[...timers.entries()][0];timers.delete(id);clock+=300000;tick.fn();assert.equal(messages.at(-1).message.action,'refresh');assert.equal(messages.at(-1).message.force,false);assert.equal(timers.size,1);
const retained=frame.src;panel.classList.remove('active');events.get('nexus-view-change')();assert.equal(child.ptNexusActive,false);assert.equal(timers.size,0);assert.equal(frame.src,retained);
clock+=300000;panel.classList.add('active');events.get('nexus-view-change')();assert.equal(messages.at(-1).message.action,'refresh');assert.equal(timers.size,1);
document.hidden=true;events.get('nexus-view-change')();assert.equal(timers.size,0);assert.equal(messages.at(-1).message.active,false);
console.log('PASS: one lazy iframe, compact unified controls, no standalone link, sender validation, five-minute cached updates, manual force refresh, pause and resume.');
const resourceHTML=readFileSync('../../apps/resource-center/index.html','utf8'),resourceSource=readFileSync('../../apps/resource-center/app.mjs','utf8').replace(/^import .*;\n/gm,'');
async function run({authenticated=true,unauthorized=false,deferVps=false,vpsFailures=0,cacheAge=null,deferredAuth=false}={}){
 const page=parseHTML(resourceHTML).document,resourceEvents=new Map(),reads=[],connections=[],statuses=[],store=new Map();let token=authenticated?'fixture-read-grant':'',lastData=null,vpsAttempts=0,finishAuth=null;
 const metrics={sampleAt:new Date(clock).toISOString(),memory:{usedBytes:1e9,totalBytes:12e9},disk:{usedBytes:20e9,totalBytes:40e9},cpu:{percent:10},services:[]};
 if(cacheAge!==null)store.set('pt.resources.v4',JSON.stringify({vps:{fetchedAt:clock-cacheAge,metrics:{...metrics,sampleAt:new Date(clock-cacheAge).toISOString()},status:{items:[]}}}));
 Object.defineProperty(page,'hidden',{value:false,writable:true});
 const parent={document:{body:{dataset:{nexusView:'monitor'}},hidden:false},postMessage:m=>statuses.push(m)};
 const resourceWindow={parent,addEventListener:(name,fn)=>resourceEvents.set(name,fn)};
 const sandbox={document:page,window:resourceWindow,location:{href:'https://ximinhu66.github.io/PT-Universe/apps/resource-center/?embedded=nexus&view=overview',origin:location.origin},URL,URLSearchParams,Date:Clock,Map,Set,JSON,Number,String,Math,AbortSignal,AbortController,DOMException,queueMicrotask,MutationObserver:class{observe(){}},
 localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
 RESOURCE_API:'https://api.example/resources',returningToNexus:false,resourceSession:()=>token,connectResources:(manual,view)=>{connections.push({manual,view});if(deferredAuth)return new Promise(resolve=>{finishAuth=()=>{token='fixture-read-grant';resolve();}});},clearResourceSession:()=>{token=''},
 actionsQuotas:()=>[],overviewHTML:d=>{lastData=d;return '<p>overview fixture</p>'},automaticHTML:()=>'',coverageHTML:()=>'',fmt:String,date:String,finite:Number.isFinite,
 fetch:async(url,init)=>{reads.push({url,signal:init.signal});if(url.endsWith('/vps')){vpsAttempts++;if(deferVps&&vpsAttempts===1)await new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});if(vpsAttempts<=vpsFailures)return Response.json({error:'temporary'},{status:503});}if(unauthorized)return Response.json({error:'expired'},{status:401});
  return Response.json(url.endsWith('/data')?{repositories:[],quotas:[],projects:[],connections:[]}:url.endsWith('/vps')?{sampleAt:new Date(clock).toISOString(),memory:{usedBytes:1e9,totalBytes:12e9},disk:{usedBytes:20e9,totalBytes:40e9},cpu:{percent:10},services:[]}:{status:{provider:new URL(url).searchParams.get('provider')||'browser',state:'ok'}});}
 };
 vm.runInNewContext(resourceSource,sandbox);await new Promise(r=>setImmediate(r));
 const send=(data,origin=location.origin)=>resourceEvents.get('message')({origin,source:parent,data:{type:'pt-resource-host',view:'overview',active:true,...data}});
 return {page,reads,connections,statuses,send,resourceWindow,data:()=>lastData,finishAuth:()=>finishAuth?.()};
}
const fresh=await run({authenticated:false});assert.equal(fresh.connections.length,1);assert.deepEqual(fresh.connections[0],{manual:false,view:'overview'});assert.equal(fresh.reads.length,0,'connect before fetching private data');fresh.send({});assert.equal(fresh.connections.length,1,'no duplicate connection during navigation');
const connected=await run();assert.equal(connected.connections.length,0);assert.equal(connected.reads.length,7);const firstReads=connected.reads.length;
connected.send({action:'refresh',force:false});await new Promise(r=>setImmediate(r));assert.equal(connected.reads.length,firstReads,'fresh provider and VPS caches are reused');
connected.send({action:'refresh',force:true},'https://evil.example');await new Promise(r=>setImmediate(r));assert.equal(connected.reads.length,firstReads);
connected.send({active:false,theme:'dark'});assert.equal(connected.page.documentElement.dataset.theme,'dark');connected.send({active:false,action:'refresh',force:true});await new Promise(r=>setImmediate(r));assert.equal(connected.reads.length,firstReads);assert.equal(connected.page.documentElement.dataset.theme,'light');
connected.send({action:'refresh',force:true});await new Promise(r=>setImmediate(r));assert.equal(connected.reads.length,firstReads+7,'manual refresh bypasses browser caches');
const expired=await run({unauthorized:true});assert.equal(expired.connections.length,1,'401 automatically renews the existing connection');assert.equal(expired.connections[0].manual,false);
console.log('PASS: automatic connection before reads, session/cache reuse, renewal on 401, explicit refresh, hidden request suppression and untrusted action rejection.');

const interrupted=await run({deferVps:true});interrupted.send({active:false});await new Promise(r=>setImmediate(r));assert.notEqual(interrupted.data().vpsStatus?.state,'unavailable','leaving Monitor cancels work without inventing a VPS outage');
const oldCache=await run({cacheAge:4*60000});assert.equal(oldCache.reads.filter(r=>r.url.endsWith('/vps')).length,1,'a cache older than the freshness window must be refreshed');
const recovered=await run({vpsFailures:1});assert.equal(recovered.reads.filter(r=>r.url.endsWith('/vps')).length,2);assert.equal(recovered.data().vpsStatus.state,'ok','one transient failure recovers before warning');
const persistent=await run({vpsFailures:10});assert.equal(persistent.reads.filter(r=>r.url.endsWith('/vps')).length,2,'persistent failure gets at most one retry');assert.equal(persistent.data().vpsStatus.state,'unavailable','real failures remain visible');
console.log('PASS: intentional cancellation is neutral, stale caches refresh, transient VPS reads retry once and persistent failures stay visible.');

const resumed=await run({deferVps:true});resumed.send({active:false});resumed.send({active:true});await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(resumed.data().vpsStatus.state,'ok','returning during cancellation starts one fresh check without retaining a false outage');
const retainedFailure=await run({vpsFailures:10,cacheAge:4*60000});assert.equal(retainedFailure.data().vpsStatus.state,'unavailable');assert.equal(retainedFailure.data().vpsStatus.observedAt,new Date(clock-4*60000).toISOString(),'real failure retains the original observation time');assert.match(retainedFailure.data().vpsStatus.coverage,/503/);

const inPlace=await run({authenticated:false,deferredAuth:true});assert.equal(inPlace.reads.length,0);inPlace.finishAuth();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));assert.equal(inPlace.reads.length,7);assert.equal(inPlace.data().vpsStatus.state,'ok','a returned auth grant loads private inventory and refreshes in place');
