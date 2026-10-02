// Execute app logic in a minimal DOM fixture; this is not a visual browser test.
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const code=readFileSync('apps/media-vault/app.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(hash='#music'){
 const elements=new Map(),requests=[],saved=new Map();
 const element=()=>({textContent:'',innerHTML:'',value:'',disabled:false,hidden:false,open:false,style:{},dataset:{},classList:{toggle(){}},addEventListener(){},pause(){},play(){return Promise.resolve();},load(){},removeAttribute(){},setAttribute(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return [];},append(){},click(){},remove(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let handler=async u=>{if(u.includes('snapshot.json'))return {charts:{'jp-0':{source:'snapshot',items:[]}}};if(u.includes('/charts'))return {source:'live',items:[]};if(u.includes('/novel/updates'))return {sources:[]};if(u.includes('/chapter'))return {title:'Chapter',text:'complete text'};if(u.includes('/health'))return {version:3};throw Error('Unexpected URL '+u);};
 const ctx=vm.createContext({document:{documentElement:{dataset:{}},querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:element,body:{classList:{toggle(){}},append(e){if(e.id)elements.set('#'+e.id,e);}}},window:{scrollTo(){}},localStorage:storage,sessionStorage:storage,location:{hash},fetch:async url=>{requests.push(String(url));return Response.json(await handler(String(url)));},URL,URLSearchParams,AbortSignal,Response,Blob,TextDecoder,crypto:webcrypto,console,setTimeout,clearTimeout,setInterval(){},queueMicrotask,addEventListener(){},navigator:{clipboard:{writeText:async()=>{}}}});
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
 // Bulk exports back off on rate limits and support caller-specific cancellation.
 f.run("var waits=[];chapterDelay=async ms=>waits.push(ms)");let tries=0;
 f.setHandler(async()=>++tries===1?{error:'来源返回 HTTP 429'}:{title:'Chapter',text:'complete text'});
 await f.run("cachedChapter('https://www.wenku8.net/novel/fixture.htm',true)");assert.equal(tries,2);assert.ok(f.run('waits.includes(15000)'));
 await assert.rejects(f.run("cachedChapter('https://www.wenku8.net/novel/stopped.htm',true,{stopped:()=>true})"),/已取消/);assert.equal(tries,2);
 // Cancelling one caller must not cancel a shared chapter needed by another job.
 let release,stopped=false;f.setHandler(()=>new Promise(r=>release=r));f.ctx.isStopped=()=>stopped;
 const first=f.run("cachedChapter('https://www.wenku8.net/shared.htm',false,{stopped:isStopped})");await settle();
 const second=f.run("cachedChapter('https://www.wenku8.net/shared.htm',false)");await settle();stopped=true;release({text:'shared chapter'});
 assert.equal((await second).text,'shared chapter');await first;
 // On deep links all lexical state has initialized before the initial route.
 const deep=fixture('');await settle();await settle();assert.match(deep.get('#breadcrumb').textContent,/轻小说/);
 console.log('Frontend logic passed: fresh refresh, service check, disabled-storage reader, stale chapter response, retry backoff, cancellation isolation, deep-link startup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
