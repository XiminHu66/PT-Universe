const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('apps/daily-nexus/index.html','utf8');
const source=html.slice(html.indexOf('function switchNexusView(view){'),html.indexOf('// ---------- Shared dashboard helpers'));
const names=[...html.matchAll(/class="navbtn(?: active)?" data-view="([^"]+)"/g)].map(x=>x[1]);
const element=name=>({id:'view-'+name,dataset:{view:name},classList:{active:false,toggle(_,v){this.active=v},remove(){this.active=false},add(){this.active=true}}});
const buttons=names.map(element),views=names.map(element),calls=[];
const sandbox={URL,location:{href:'https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=check&tab=meal&other=keep#anchor'},history:{state:{retained:true},replaceState(state,title,href){sandbox.location.href=href;assert.equal(state.retained,true)}},DEFAULT_NAV_CONFIG:names.map(view=>({view})),
 $:selector=>views.find(x=>'#'+x.id===selector),$$:selector=>selector==='.view'?views:buttons,
 setDeskBoardActive:v=>calls.push(['board',v]),ensureEmbeddedSite:v=>calls.push(['embedded',v]),switchIdeaTab:v=>calls.push(['idea',v]),store:{get:()=> 'projects'},dispatchEvent:e=>calls.push(['event',e.detail.view]),CustomEvent:class{constructor(type,{detail}){this.detail=detail}},ensureMusicTab(){},renderFocusTasks(){},renderCountdown(){},resetNexusViewScroll(){}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
for(const view of [...names,'bad-view',...names.slice().reverse()]){
 sandbox.switchNexusView(view);const expected=names.includes(view)?view:'home',url=new URL(sandbox.location.href);
 assert.deepEqual(buttons.filter(x=>x.classList.active).map(x=>x.dataset.view),[expected]);
 assert.deepEqual(views.filter(x=>x.classList.active).map(x=>x.dataset.view),[expected]);
 assert.equal(url.searchParams.get('view'),expected==='home'?null:expected);assert.equal(url.searchParams.get('tab'),null);assert.equal(url.searchParams.get('other'),'keep');assert.equal(url.hash,'#anchor');
 // Same URL used after F5 must resolve to the same view.
 sandbox.switchNexusView(url.searchParams.get('view')||'home');assert.equal(views.find(x=>x.classList.active).dataset.view,expected);
}
assert.ok(calls.some(x=>x[0]==='embedded'&&x[1]==='tsugi'));assert.ok(calls.some(x=>x[0]==='embedded'&&x[1]==='check'));
const tabs=fs.readFileSync('apps/daily-nexus/decision-tabs.js','utf8');assert.ok(tabs.includes("params.get('view')||params.get('tab')"));assert.ok(!tabs.includes('history.replaceState'),'Embedded activation must not rewrite navigation URLs');
console.log('All '+names.length+' Nexus tabs, active panels, refresh URLs, legacy tab removal and embedded activation passed');
const app=fs.readFileSync('apps/tsugi-checker/app.js','utf8'),gameCode=app.slice(app.indexOf('function gameTodayLocal()'),app.indexOf('function renderTimelineGame('));
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-12T16:00:00Z']))}static now(){return +new Clock()}}
const games={Date:Clock,Intl};vm.createContext(games);vm.runInContext(gameCode,games);
assert.equal(games.gameTodayLocal(),'2026-10-12');assert.ok(games.gameDateLabel('2026-10-10',games.gameTodayLocal()).includes('2 天前'));assert.ok(!games.gameDateLabel('2026-10-10',games.gameTodayLocal()).includes('今天'));assert.ok(games.gameDateLabel('2026-10-12',games.gameTodayLocal()).includes('今天'));
console.log('Old snapshot cannot label October 10 as today on October 12');
