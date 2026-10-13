import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {build,transform} from 'esbuild';
const built=await build({entryPoints:['src/site-updates.ts'],bundle:true,format:'esm',platform:'node',write:false});const S=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const li='<li class="book-li"><a href="/novel/5428.html"><img alt="完整小說名稱" data-src="/cover.jpg"><h4>完整小...</h4><p>作品简介</p></a></li>';
const list=S.parseSiteList('<ul>'+li+li+'</ul>','https://tw.linovelib.com/wenku/','linovelib','BiliNovel','novel',60);assert.equal(list.length,1);assert.equal(list[0].title,'完整小說名稱');assert.equal(list[0].latest,'');assert.equal(list[0].cover,'https://tw.linovelib.com/cover.jpg');
const detail=S.parseLatestDetail('<a class="book-meta book-status" href="/novel/5428/catalog"><div>最后更新 · 2026-10-12</div><div><p>第一章 第24話 偶遇</p></div></a>','https://tw.linovelib.com/novel/5428.html','linovelib');assert.equal(detail.latest,'第一章 第24話 偶遇');assert.equal(detail.updated_text,'2026-10-12');assert.equal(detail.latest_url,'https://tw.linovelib.com/novel/5428/catalog');
const card=(name,chapter)=>`<li><a href="/comic/${name}"><img alt="${name}" src="/${name}.jpg"><h3>${name}</h3></a><a href="/comic/${name}/chapter/1">第${chapter}話</a><span>2026-10-12</span></li>`;
const copy=`<!-- 熱門更新 --><section><h2>排行榜</h2>${card('ranking',999)}</section><section><h2><span>熱門</span> <span>更新</span></h2><ul>${['aa','bb','cc','dd'].map((x,i)=>card(x,i+1)).join('')}</ul></section>`;
const copies=S.parseSiteList(copy,'https://www.mangacopy.com/','copymanga','CopyManga','manga',48);assert.equal(copies.length,4);assert.equal(copies[0].latest,'第1話');assert.ok(!copies.some(x=>x.title==='ranking'));assert.equal(copies[1].latest,'第2話');assert.equal(copies[1].updated_text,'2026-10-12');
assert.throws(()=>S.parseSiteList('<h1>排行榜</h1>'+card('stale',1),'https://www.mangacopy.com/','copymanga','CopyManga','manga',48),/更新区块/);
assert.equal(S.parseLatestDetail('<title>漫畫-第54話-拷貝漫畫</title><p>最後更新：2026-10-12</p>','https://www.mangacopy.com/comic/a','copymanga').latest,'第54話');assert.deepEqual(S.parseLatestDetail('<title>Site Unavailable</title>','https://www.mangacopy.com/comic/a','copymanga'),{});
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
const context={Date,sourcePage:async()=>({evaluate:async(fn,urls)=>{batches++;assert.ok(urls.length<=10);return urls.map(url=>({url,html:'<a href="/novel/1/catalog"><div>最后更新 · 2026-10-13</div><p>最新章</p></a>'}))}}),parseLatestDetail:S.parseLatestDetail,hasChapter:v=>Boolean(v),now:()=>new Date().toISOString(),closeFast:async()=>detailCloses++};
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
