import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('../../apps/daily-nexus/index.html','utf8');
const main=html.split('<script>\nconst $=')[1].split('</script>')[0];
const {window,document}=parseHTML(html);
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option')?.getAttribute('value')||''},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.getAttribute('value')===String(value))},configurable:true});
window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.scrollTo=function(){};
window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};window.HTMLElement.prototype.close=function(){this.removeAttribute('open')};
Object.defineProperty(window.HTMLElement.prototype,'open',{get(){return this.hasAttribute('open')},set(value){this.toggleAttribute('open',!!value)},configurable:true});
const intervals=[],requests=[];
const saved=new Map([['dn_navConfig',JSON.stringify([{view:'home',label:'今日'},{view:'todo',label:'Idea Pad'},{view:'tsugi',label:'追更'},{view:'vps',label:'VPS'},{view:'tools'},{view:'countdown'}])],['dn_navLayoutVersion','3'],['dn_memo',JSON.stringify('Existing note')],['dn_tasks',JSON.stringify([{text:'Existing task',done:false}])],['dn_subscriptions',JSON.stringify([{id:'sub',name:'Existing subscription',amount:9,currency:'USD',frequency:'monthly',nextDate:'2026-11-01'}])],['dn_maintenance',JSON.stringify([{id:'maint',name:'Existing maintenance',due:'2026-11-03',every:3,unit:'months'}])],['dn_musicLibrary',JSON.stringify([{name:'Preserved legacy data'}])]]);
const localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
const location={href:'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/',origin:'https://ximinhu66.github.io',search:'',hash:''};
const sandbox={window:null,document,localStorage,location,URL,URLSearchParams,Intl,crypto,console,Blob,Map,Set,Date,Math,Number,String,JSON,AbortController,AbortSignal,Response,TextEncoder,TextDecoder,
 navigator:{language:'zh-CN',clipboard:{writeText:async()=>{}}},matchMedia:()=>({matches:false,addEventListener(){}}),
 history:{state:{},replaceState(state,title,url){location.href=url;location.search=new URL(url).search}},
 addEventListener(){},dispatchEvent(){},CustomEvent:window.CustomEvent,Event:window.Event,setInterval(fn,ms){intervals.push({fn,ms});return intervals.length},clearInterval(){},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){},alert(){},confirm(){throw Error('Unexpected confirmation')},
 fetch:async(url)=>{requests.push(String(url));return Response.json({items:[],events:[],sources:{},results:[],data:[],daily:{time:[]}})},CSS:{escape:x=>x},getComputedStyle:()=>({getPropertyValue:()=>''})};
sandbox.window=sandbox;sandbox.parent=sandbox;sandbox.top=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('../../apps/daily-nexus/upcoming-policy.js','utf8'),sandbox);vm.runInContext(fs.readFileSync('../../apps/daily-nexus/home-tools.js','utf8'),sandbox);vm.runInContext('const $='+main,sandbox);await new Promise(r=>setImmediate(r));
assert.equal(document.querySelectorAll('.sidebar .navbtn[data-view]').length,8);
assert.equal(document.querySelector('[data-view=todo] span').textContent,'记录');
assert.equal(document.querySelectorAll('#view-check,#view-tools,#view-countdown,#view-music,#ytName,#liveFrame').length,0);
assert.equal(document.querySelector('#memo').value,'Existing note');
assert.ok(document.querySelector('#tasks').textContent.includes('Existing task'));
assert.ok(document.querySelector('#memoCountdownList').textContent.includes('Existing subscription'));
assert.ok(document.querySelector('#memoCountdownList').textContent.includes('Existing maintenance'));
assert.equal(saved.get('dn_musicLibrary'),JSON.stringify([{name:'Preserved legacy data'}]));
assert.equal(document.querySelector('#remindersDialog').open,false);
document.querySelector('#memoCountdownMore').click();assert.equal(document.querySelector('#remindersDialog').open,true);
document.querySelector('[data-close-dialog=remindersDialog]').click();assert.equal(document.querySelector('#remindersDialog').open,false);
sandbox.switchNexusView('tools');assert.equal(document.body.dataset.nexusView,'vps');assert.equal(new URL(location.href).searchParams.get('view'),'vps');
sandbox.switchNexusView('countdown');assert.equal(document.body.dataset.nexusView,'home');assert.equal(document.querySelector('#remindersDialog').open,true);
sandbox.switchNexusView('focus');assert.equal(document.body.dataset.nexusView,'focus');assert.equal(document.querySelector('#compactViewTitle').textContent,'专注');
assert.equal(document.querySelectorAll('#view-focus details[open]').length,0);
assert.deepEqual(Array.from(document.querySelectorAll('.settings-group>summary b'),x=>x.textContent),['外观','内容','数据备份']);
for(const key of ['dn_memo','dn_tasks','dn_subscriptions','dn_maintenance'])assert.ok(saved.has(key));
sandbox.switchNexusView('home');saved.set('dn_upcomingCacheV5',JSON.stringify({time:0,local:[],dynamic:[]}));
const poll=intervals.find(x=>x.ms===600000);assert.ok(poll,'Upcoming must have a background refresh timer');const before=requests.length;poll.fn();await new Promise(r=>setImmediate(r));assert.ok(requests.length>before,'Active Home must automatically refresh stale snapshots');
Object.defineProperty(document,'hidden',{value:true,writable:true,configurable:true});const hiddenRequests=requests.length;poll.fn();await new Promise(r=>setImmediate(r));assert.equal(requests.length,hiddenRequests,'Hidden pages must pause polling');
console.log('PASS: actual Nexus initialization, existing note/task/reminder data, eight tabs, retired-route aliases, reminder dialog open/close, compact header state, folded focus controls and three settings groups.');
