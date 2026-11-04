import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=readFileSync('../../apps/daily-nexus/index.html','utf8');
const source=readFileSync('../../apps/daily-nexus/monitor-tab.js','utf8');
const {document}=parseHTML(html),events=new Map(),messages=[],childEvents=[];
const panel=document.querySelector('#view-monitor'),frame=document.querySelector('#monitorFrame');
const child={postMessage:(message,origin)=>messages.push({message,origin}),dispatchEvent:e=>childEvents.push(e.type)};
Object.defineProperty(frame,'contentWindow',{value:child});Object.defineProperty(document,'hidden',{value:false,writable:true});
let load;frame.addEventListener=(name,fn)=>{if(name==='load')load=fn;};
const location={href:'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=home',origin:'https://ximinhu66.github.io'};
const window={addEventListener:(name,fn)=>events.set(name,fn)};
vm.runInNewContext(source,{document,window,location,history:{state:null,replaceState:(_,__,url)=>{location.href=String(url);}},URL,Event,MutationObserver:class{observe(){}}});
assert.equal(frame.getAttribute('src'),null,'no resource app loads on another tab');
panel.classList.add('active');events.get('nexus-view-change')();assert.match(frame.src,/embedded=nexus&view=overview$/);load();
assert.equal(messages.at(-1).message.active,true);assert.equal(messages.at(-1).message.view,'overview');assert.equal(messages.at(-1).origin,location.origin);
document.querySelector('[data-monitor-view=projects]').click();assert.equal(messages.at(-1).message.view,'projects');assert.equal(new URL(location.href).searchParams.get('monitor'),'projects');
const emit=(origin,source,view)=>events.get('message')({origin,source,data:{type:'pt-resource-view',view}});
emit('https://evil.example',child,'settings');emit(location.origin,{},'settings');assert.equal(document.querySelector('[data-monitor-view=projects]').getAttribute('aria-current'),'page');
emit(location.origin,child,'settings');assert.equal(document.querySelector('[data-monitor-view=settings]').getAttribute('aria-current'),'page');
const retained=frame.src;panel.classList.remove('active');events.get('nexus-view-change')();assert.equal(child.ptNexusActive,false);assert.equal(messages.at(-1).message.active,false);assert.equal(frame.src,retained,'switching tabs retains the single iframe and its cache');
assert.ok(childEvents.includes('nexus-activate'));
console.log('PASS: lazy overview mount, single retained iframe, subview URL sync, strict sender checks and offscreen suspension.');
// Exercise the embedded resource app with a public snapshot, never real credentials.
const resourceHTML=readFileSync('../../apps/resource-center/index.html','utf8');
const resourceSource=readFileSync('../../apps/resource-center/app.mjs','utf8').replace(/^import .*;\n/gm,'');
const page=parseHTML(resourceHTML).document,resourceEvents=new Map(),reads=[];
Object.defineProperty(page,'hidden',{value:false,writable:true});
const parent={document:{body:{dataset:{nexusView:'monitor'}},hidden:false},postMessage(){}};
const resourceWindow={parent,addEventListener:(name,fn)=>resourceEvents.set(name,fn)};
const store=new Map();let connections=0;
const sandbox={document:page,window:resourceWindow,location:{href:'https://ximinhu66.github.io/PT-Universe/apps/resource-center/?embedded=nexus&view=overview',origin:location.origin},URL,URLSearchParams,Date,Map,Set,JSON,Number,String,Math,AbortSignal,AbortController,DOMException,
 localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
 RESOURCE_API:'https://api.example/resources',returningToNexus:false,resourceSession:()=>'',connectResources:()=>connections++,clearResourceSession(){},
 actionsQuotas:()=>[],overviewHTML:()=>'<p>overview fixture</p>',automaticHTML:()=>'',coverageHTML:()=>'',fmt:String,date:String,finite:Number.isFinite,
 fetch:async(url,init)=>{reads.push({url,signal:init.signal});return Response.json({repositories:[],quotas:[],projects:[]});}
};
vm.runInNewContext(resourceSource,sandbox);await new Promise(r=>setImmediate(r));
assert.equal(reads.length,1);assert.equal(connections,0,'opening Monitor does not automatically navigate to login');
resourceEvents.get('message')({origin:location.origin,source:parent,data:{type:'pt-resource-host',view:'overview',active:false,theme:'dark'}});
page.querySelector('#refresh').onclick();await new Promise(r=>setImmediate(r));assert.equal(reads.length,1,'offscreen refresh must not issue requests');
assert.equal(page.documentElement.dataset.theme,'dark');
resourceEvents.get('message')({origin:'https://evil.example',source:parent,data:{type:'pt-resource-host',view:'overview',active:true}});assert.equal(resourceWindow.ptNexusActive,false);
resourceEvents.get('message')({origin:location.origin,source:parent,data:{type:'pt-resource-host',view:'overview',active:true}});await new Promise(r=>setImmediate(r));assert.equal(reads.length,1,'returning reuses the loaded snapshot');
console.log('PASS: embedded data is read on demand, hidden refresh is suppressed, sessions are reused and untrusted host messages are ignored.');
