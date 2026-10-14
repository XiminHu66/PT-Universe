import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {build,transform} from 'esbuild';
const built=await build({entryPoints:['src/site-updates.ts'],bundle:true,format:'esm',platform:'node',write:false});const S=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const li='<li class="book-li"><a href="/novel/5428.html"><img alt="完整小說名稱" data-src="/cover.jpg"><h4>完整小...</h4><p>作品简介</p></a></li>';
const list=S.parseSiteList('<ul>'+li+li+'</ul>','https://tw.linovelib.com/wenku/','linovelib','BiliNovel','novel',60);assert.equal(list.length,1);assert.equal(list[0].title,'完整小說名稱');assert.equal(list[0].latest,'');assert.equal(list[0].cover,'https://tw.linovelib.com/cover.jpg');
const detail=S.parseLatestDetail('<a class="book-meta book-status" href="/novel/5428/catalog"><div>最后更新 · 2026-10-12</div><div><p>第一章 第24話 偶遇</p></div></a>','https://tw.linovelib.com/novel/5428.html','linovelib');assert.equal(detail.latest,'第一章 第24話 偶遇');assert.equal(detail.updated_text,'2026-10-12');assert.equal(detail.latest_url,'https://tw.linovelib.com/novel/5428/catalog');
const card=(name,chapter)=>`<li><a href="/comic/${name}"><img alt="${name}" src="/${name}.jpg"><h3>${name}</h3></a><a href="/comic/${name}/chapter/1">第${chapter}話</a><span>2026-10-12</span></li>`;
const copy=`<!-- 熱門更新 --><section><h2>排行榜</h2>${card('ranking',999)}</section><section><h2><span>熱門</span> <span>更新</span></h2><ul>${['aa','bb','cc','dd'].map((x,i)=>card(x,i+1)).join('')}</ul></section>`;
const copies=S.parseSiteList(copy,'https://www.mangacopy.com/','copymanga','CopyManga','manga',48);assert.equal(copies.length,4);assert.equal(copies[0].latest,'第1話');assert.ok(!copies.some(x=>x.title==='ranking'));assert.equal(copies[1].latest,'第2話');assert.equal(copies[1].updated_text,'2026-10-12');
assert.throws(()=>S.parseSiteList('<h1>排行榜</h1>'+card('stale',1),'https://www.mangacopy.com/','copymanga','CopyManga','manga',48),/更新区块/);
assert.equal(S.parseLatestDetail('<title>漫畫-第54話-拷貝漫畫</title><p>最後更新：2026-10-12</p>','https://www.mangacopy.com/comic/a','copymanga').latest,'第54話');assert.equal(S.parseLatestDetail('<title>Site Unavailable</title>','https://www.mangacopy.com/comic/a','copymanga').latest,undefined);
const state={sources:{copymanga:{ok:true,checked_at:'2026-10-12T15:01:00Z'}}};assert.equal(S.sourceIsFresh(state,'copymanga','2026-10-12'),true);state.sources.copymanga.degraded=true;assert.equal(S.sourceIsFresh(state,'copymanga','2026-10-12'),false);assert.equal(S.sourceIsFresh({sources:{copymanga:{ok:true}}},'copymanga','2026-10-12'),false);
const app=fs.readFileSync('../../apps/tsugi-checker/app.js','utf8');const from=app.indexOf('function normText('),to=app.indexOf('function songKey(');const c={Date,URL,location:{href:'https://ximinhu66.github.io/PT-Universe/apps/tsugi-checker/'}};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function normalizeUrl('),app.indexOf('function workKey('))+app.slice(from,to),c);
const old={source:'linovelib',url:'https://tw.linovelib.com/novel/5428.html',title:'書',latest:'第1話',latest_checked_at:'2026-10-09T15:00:00Z'};
const newer={...old,latest:'第24話',latest_checked_at:'2026-10-12T15:00:00Z'};
assert.equal(c.mergeSiteSnapshots([{generated_at:'2026-10-12T16:00:00Z',items:[old]},{generated_at:'2026-10-12T15:10:00Z',items:[newer]}]).items[0].latest,'第24話');
const unknown={...old};delete unknown.latest_checked_at;assert.equal(c.mergeSiteRow(unknown,newer).latest,'第24話');
console.log('Latest-section scope, full titles, dedicated chapter/date extraction, failure detection, source quality and stale snapshot merge passed');

// Closing a per-source page must not close the shared browser before the next source.
const index=fs.readFileSync('src/index.ts','utf8'),browserCode=index.slice(index.indexOf('async function withBrowser<'),index.indexOf('function normalizedUrl('));
const transformed=await transform(browserCode,{loader:'ts'});
let openPages=0,closed=false,closedCount=0;
const fake={async newPage(){if(closed)throw Error('browser closed');openPages++;return {async close(){openPages--;if(!openPages)closed=true}}},async close(){closed=true;closedCount++}};
const life={launch:async(binding,options)=>{assert.equal(options.keep_alive,60000);return fake},closeFast:async p=>p.close(),setTimeout};vm.createContext(life);vm.runInContext(transformed.code,life);
const result=await life.withBrowser({BROWSER:{}},async b=>{for(let i=0;i<3;i++){const page=await b.newPage();await page.close()}return 'all sources checked'});
assert.equal(result,'all sources checked');assert.equal(openPages,0);assert.equal(closedCount,1);
console.log('Shared browser stays alive across sources and closes on completion');

const newlyListed={...newer,url:'https://tw.linovelib.com/novel/5453.html',latest:'',updated_text:'',fetched_at:'2026-10-12T17:00:00Z'};
const datedHistory={...old,updated_text:'2026-10-09',fetched_at:'2026-10-09T17:00:00Z'};
assert.equal(c.mergeSiteSnapshots([{generated_at:'2026-10-12T17:00:00Z',items:[datedHistory,newlyListed]}]).items[0].url,newlyListed.url);
console.log('Newly listed undated works are not buried below dated old history');

// The production regression: 60 details must use browser fetch, with no Worker fetch calls.
const verification=index.slice(index.indexOf('async function verifySiteChapters('),index.indexOf('async function refreshSites('));
const verificationJS=await transform(verification,{loader:'ts'});
let batches=0,detailCloses=0;
const context={Date,browserChapterBatch:()=>{},sourcePage:async()=>({evaluate:async(fn,urls)=>{batches++;assert.ok(urls.urls.length<=10);return urls.urls.map(url=>({url,detail:{latest:'最新章'}}))}}),parseLatestDetail:S.parseLatestDetail,hasChapter:v=>Boolean(v),now:()=>new Date().toISOString(),closeFast:async()=>detailCloses++};
vm.createContext(context);vm.runInContext(verificationJS.code,context);
const novels=Array.from({length:60},(_,i)=>({url:`https://tw.linovelib.com/novel/${i}.html`,latest_checked_at:null}));
await context.verifySiteChapters({},novels,'linovelib','https://tw.linovelib.com/wenku/');
assert.equal(batches,6);assert.equal(detailCloses,1);assert.ok(novels.every(x=>x.latest==='最新章'&&x.latest_checked_at));
const qualityCode=index.slice(index.indexOf('function samePacificDay('),index.indexOf('async function status('));
const qualityJS=await transform(qualityCode,{loader:'ts'});vm.runInContext(qualityJS.code,context);
assert.equal(context.refreshQuality({sites:{sources:{linovelib:{ok:true,degraded:true}}}}).ok,false);
assert.equal(context.refreshQuality({games:{remoteError:'Too many subrequests'}}).ok,false);
assert.equal(context.refreshQuality({music:{error:'source failed'}}).ok,false);
assert.equal(context.refreshQuality({sites:{sources:{a:{ok:true}}},music:{sources:{b:{ok:true}}}}).ok,true);
assert.equal(S.parseSiteList('<li><a href="/comic/123/"><img alt="漫画标题"><span>漫画标题</span></a><a href="/comic/123/456.html">第10话更新于：2026-10-13</a></li>','https://m.manhuagui.com/update/','manhuagui','漫画柜','manga',60)[0].latest,'第10话');
console.log('60 chapters use six browser batches; partial source failures cannot be green; clean manga chapters');

assert.equal(context.refreshQuality({games:{generatedAt:'2000-01-01T00:00:00Z'}}).ok,false);
assert.equal(context.refreshQuality({games:{generatedAt:new Date().toISOString()}}).ok,true);

assert.equal(S.parseLatestDetail('<title>漫畫-短篇-拷貝漫畫</title>','https://www.mangacopy.com/comic/a','copymanga').latest,'短篇');
assert.equal(S.parseLatestDetail('<title>漫畫-第54話 完結-拷貝漫畫</title>','https://www.mangacopy.com/comic/a','copymanga').latest,'第54話 完結');

assert.equal(context.refreshQuality({games:{generatedAt:new Date().toISOString(),sources:{taptap_cn_upcoming:{ok:false,error:'No items parsed'}}}}).ok,false);

// Run the exact Browser Run callbacks against HTML fixtures; no HTML is returned to the Worker.
const {DOMParser}=await import('linkedom');
const browserBuilt=await build({entryPoints:['src/browser-site-parser.ts'],bundle:true,format:'esm',platform:'node',write:false});
const B=await import('data:text/javascript;base64,'+Buffer.from(browserBuilt.outputFiles[0].text).toString('base64'));
const savedFetch=globalThis.fetch,savedParser=globalThis.DOMParser;
globalThis.DOMParser=DOMParser;
try{
 globalThis.fetch=async()=>new Response('<html><head><title>書</title></head><body><a href="/novel/1/catalog"><div>最后更新 · 2026-10-13</div><p>第60章</p></a>'+('<!-- ignored -->'.repeat(15000))+'</body></html>');
 const result=await B.browserChapterBatch({urls:['https://tw.linovelib.com/novel/1.html'],source:'linovelib'});
 assert.equal(result[0].detail.latest,'第60章');assert.equal(result[0].detail.updated_text,'2026-10-13');assert.ok(JSON.stringify(result).length<500);assert.equal(result[0].html,undefined);
 globalThis.fetch=async()=>new Response('<html><head><title>漫畫-短篇 完結-拷貝漫畫</title></head><body>最後更新：2026-10-13</body></html>');
 const manga=await B.browserChapterBatch({urls:['https://www.mangacopy.com/comic/a'],source:'copymanga'});assert.equal(manga[0].detail.latest,'短篇 完結');
 globalThis.fetch=async()=>new Response('<html><head><title>Site Unavailable</title></head><body>blocked</body></html>');
 assert.equal((await B.browserChapterBatch({urls:['https://www.mangacopy.com/comic/a'],source:'copymanga'}))[0].detail.latest,undefined);
 globalThis.fetch=async()=>new Response('<html><body>'+copy+'</body></html>');
 const browserCopies=await B.browserSiteList({url:'https://www.mangacopy.com/',source:'copymanga',label:'CopyManga',type:'manga',limit:48});
 assert.equal(browserCopies.length,4);assert.equal(browserCopies[0].latest,'第1話');assert.ok(!browserCopies.some(x=>x.title==='ranking'));
 globalThis.fetch=async()=>new Response('<html><body><ul class="book-ol-normal">'+li+'</ul></body></html>');
 const browserNovels=await B.browserSiteList({url:'https://tw.linovelib.com/wenku/',source:'linovelib',label:'BiliNovel',type:'novel',limit:60});assert.equal(browserNovels[0].title,'完整小說名稱');
}finally{globalThis.fetch=savedFetch;globalThis.DOMParser=savedParser}
console.log('Browser-side parsing preserves chapter/date semantics and returns only compact records');

const productionTitles=JSON.parse(fs.readFileSync('tests/fixtures/copy-production-titles.json','utf8'));
const htmlTitle=value=>'<html><head><title>'+value.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</title></head><body>最後更新：2026-10-14</body></html>';
for(const row of productionTitles)assert.equal(S.parseLatestDetail(htmlTitle(row.title),row.url,'copymanga').latest,row.chapter);
globalThis.DOMParser=DOMParser;globalThis.fetch=async url=>new Response(htmlTitle(productionTitles.find(x=>x.url===url).title));
try{
 const rows=await B.browserChapterBatch({urls:productionTitles.map(x=>x.url),source:'copymanga'});
 assert.equal(rows.length,48);for(let i=0;i<48;i++)assert.equal(rows[i].detail.latest,productionTitles[i].chapter);
}finally{globalThis.fetch=savedFetch;globalThis.DOMParser=savedParser}
assert.equal(S.parseLatestDetail('<title>作品-在线阅读 - 拷貝漫畫</title>','https://www.mangacopy.com/comic/a','copymanga').latest,undefined);
console.log('All 48 actual production CopyManga titles and named chapters passed both parsers');
const healthContext={Date,Intl};vm.createContext(healthContext);vm.runInContext(app.slice(app.indexOf('function sourceMorningFresh('),app.indexOf('function renderSources(')),healthContext);
const nowDate=new Date('2026-10-14T16:00:00Z');
assert.equal(healthContext.sourceHealthBadge({ok:true,checked_at:'2026-10-13T17:44:03Z'},null,nowDate).stale,true);
assert.equal(healthContext.sourceHealthBadge({ok:true,checked_at:'2026-10-14T15:31:00Z'},null,nowDate).stale,false);
assert.equal(healthContext.sourceHealthBadge({ok:true,fallback:'Billboard',checked_at:'2026-10-14T15:31:00Z'},null,nowDate).degraded,true);
assert.equal(healthContext.sourceMorningFresh('2026-10-13T15:30:00Z',new Date('2026-10-14T14:00:00Z')),true);
console.log('Yesterday snapshots and fallback sources cannot be displayed as healthy current data');
const budgetCode=index.slice(index.indexOf('function median('),index.indexOf('async function syncRoute('));
const budgetJS=await transform(budgetCode,{loader:'ts'}),utcStart=new Date();utcStart.setUTCHours(0,0,0,0);
const budgetContext={Date,DEFAULT_FULL_REFRESH_MS:50000,SAFE_BROWSER_DAILY_MS:300000,OFFICIAL_BROWSER_DAILY_MS:600000,browserHistory:async()=>[{startTime:+utcStart+3000,endTime:+utcStart+303000},{startTime:+utcStart+500000,endTime:+utcStart+748895},{startTime:+utcStart-100000,endTime:+utcStart-1000}]};vm.createContext(budgetContext);vm.runInContext(budgetJS.code,budgetContext);
const budget=await budgetContext.refreshBudget({BROWSER:{},DB:{prepare:()=>({first:async()=>({total:0,scheduled:0}),all:async()=>({results:[]})})}});
assert.equal(budget.platformUsedMs,548895);assert.equal(budget.usedMs,548895);assert.equal(budget.remainingRefreshes,0);
console.log('Aborted browser sessions are counted even when the D1 run has no recorded duration');
