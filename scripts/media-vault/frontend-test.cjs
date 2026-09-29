// Execute app logic in a minimal DOM fixture; this is not a visual browser test.
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const code=readFileSync('apps/media-vault/app.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(hash=''){
 const elements=new Map(),requests=[],saved=new Map();
 const element=()=>({textContent:'',innerHTML:'',value:'',disabled:false,hidden:false,open:false,style:{},dataset:{},classList:{toggle(){}},addEventListener(){},pause(){},play(){return Promise.resolve();},load(){},removeAttribute(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return [];},append(){},click(){},remove(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let handler=async u=>{if(u.includes('snapshot.json'))return {charts:{'jp-0':{source:'snapshot',items:[]}}};if(u.includes('/charts'))return {source:'live',items:[]};if(u.includes('/novel/updates'))return {sources:[]};if(u.includes('/chapter'))return {title:'Chapter',text:'complete text'};if(u.includes('/health'))return {version:3};throw Error('Unexpected URL '+u);};
 const ctx=vm.createContext({document:{querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:element,body:{append(e){if(e.id)elements.set('#'+e.id,e);}}},window:{scrollTo(){}},localStorage:storage,sessionStorage:storage,location:{hash},fetch:async url=>{requests.push(String(url));return Response.json(await handler(String(url)));},URL,URLSearchParams,AbortSignal,Response,Blob,TextDecoder,crypto:webcrypto,console,setTimeout,clearTimeout,setInterval(){},queueMicrotask,addEventListener(){},navigator:{clipboard:{writeText:async()=>{}}}});
 vm.runInContext(readFileSync('apps/media-vault/vendor/opencc-full.js','utf8'),ctx);vm.runInContext(code,ctx);return {ctx,get,requests,saved,setHandler:f=>handler=f,run:s=>vm.runInContext(s,ctx)};
}
(async()=>{
 const f=fixture();await settle();await settle();
 assert.equal(f.run("normalizeTitle('無職轉生')"),f.run("normalizeTitle('无职转生')"));
 assert.equal(f.run("normalizeTitle('貴族千金只願意親近我。')"),f.run("normalizeTitle('贵族千金只愿意亲近我')"));
 assert.match(f.get('#chartMeta').textContent,/snapshot/);
 await f.get('#chartRefresh').onclick({currentTarget:f.get('#chartRefresh')});
 assert.ok(f.requests.some(u=>u.includes('/charts?')&&u.includes('refresh=1')));
 assert.match(f.get('#chartMeta').textContent,/live/);
 await f.get('#serviceCheck').onclick({currentTarget:f.get('#serviceCheck')});
 assert.match(f.get('#serviceStatus').textContent,/v3/);
 // No IndexedDB available: chapter reads still work.
 f.run("book={title:'Book',url:'https://www.wenku8.net/book/1.htm',chapters:[{url:'https://www.wenku8.net/a.htm',title:'One'},{url:'https://www.wenku8.net/b.htm',title:'Two'}]}");
 await f.run('readChapter(0)');assert.match(f.get('#readerText').innerHTML,/complete text/);
 // A late response from an earlier navigation cannot replace the current chapter.
 let resolveOld;f.setHandler(u=>u.includes('a.htm')?new Promise(r=>resolveOld=r):Promise.resolve({title:'Two',text:'new chapter'}));
 const old=f.run('readChapter(0)');await settle();await f.run('readChapter(1)');resolveOld({title:'One',text:'old chapter'});await old;
 assert.match(f.get('#readerText').innerHTML,/new chapter/);
 // Engine-free shelf checks update counts and never contact /watch.
 f.run("shelf=[{url:'https://www.wenku8.net/book/1.htm',watch:true,chapters:1}]");f.setHandler(async()=>({chapters:[{},{}]}));await f.run('checkShelf(true)');
 assert.match(f.get('#notice').textContent,/新增 1 章/);assert.equal(JSON.parse(f.saved.get('ptu.mv.shelf'))[0].chapters,2);
 // Bulk export backs off on rate limits and can stop before another request.
 f.run("var waits=[];chapterDelay=async ms=>waits.push(ms);lastChapterFetch=0;exportStopped=false");let tries=0;
 f.setHandler(async()=>++tries===1?{error:'来源返回 HTTP 429'}:{title:'Chapter',text:'complete text'});
 await f.run("cachedChapter('https://www.wenku8.net/novel/fixture.htm',true)");assert.equal(tries,2);assert.ok(f.run('waits.includes(15000)'));
 f.run('exportStopped=true');await assert.rejects(f.run("cachedChapter('https://www.wenku8.net/novel/stopped.htm',true)"),/已停止/);assert.equal(tries,2);
 // On deep links all lexical state has initialized before the initial route.
 const deep=fixture('#novels');await settle();await settle();assert.match(deep.get('#breadcrumb').textContent,/轻小说/);
 console.log('Frontend logic passed: fresh refresh, service check, disabled-storage reader, stale chapter response, engine-free tracking, deep-link startup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
