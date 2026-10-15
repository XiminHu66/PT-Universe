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
 const ctx=vm.createContext({document:{documentElement:{dataset:{},style:{setProperty(){}}},querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:element,body:{classList:{toggle(){}},append(e){if(e.id)elements.set('#'+e.id,e);}}},window:{scrollTo(){}},localStorage:storage,sessionStorage:storage,location:{hash},fetch:async url=>{requests.push(String(url));const result=await handler(String(url));return result instanceof Response?result:Response.json(result);},URL,URLSearchParams,AbortSignal,Response,Blob,TextDecoder,crypto:webcrypto,console,setTimeout,clearTimeout,setInterval(){},queueMicrotask,addEventListener(){},navigator:{clipboard:{writeText:async()=>{}}}});
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
 f.run("book.chapters[0].url='https://www.wenku8.net/old-request.htm'");
 let resolveOld;f.setHandler(u=>u.includes('old-request.htm')?new Promise(r=>resolveOld=r):Promise.resolve({title:'Two',text:'new chapter'}));
 const old=f.run('readChapter(0)');await settle();await f.run('readChapter(1)');resolveOld({title:'One',text:'old chapter'});await old;
 assert.match(f.get('#readerText').innerHTML,/new chapter/);
 // Bulk exports back off on rate limits and support caller-specific cancellation.
 f.run("var waits=[];chapterDelay=async ms=>waits.push(ms)");let tries=0;
 f.setHandler(async()=>++tries===1?{error:'来源返回 HTTP 429'}:{title:'Chapter',text:'complete text'});
 await f.run("cachedChapter('https://www.wenku8.net/novel/fixture.htm',true)");assert.equal(tries,2);assert.ok(f.run('waits.reduce((a,b)=>a+b,0)>=15000'));
 await assert.rejects(f.run("cachedChapter('https://www.wenku8.net/novel/stopped.htm',true,{stopped:()=>true})"),/已取消/);assert.equal(tries,2);
 // Cancelling one caller must not cancel a shared chapter needed by another job.
 let release,stopped=false;f.setHandler(()=>new Promise(r=>release=r));f.ctx.isStopped=()=>stopped;
 const first=f.run("cachedChapter('https://www.wenku8.net/shared.htm',false,{stopped:isStopped})");const firstStopped=assert.rejects(first,/已取消/);await settle();
 const second=f.run("cachedChapter('https://www.wenku8.net/shared.htm',false)");await settle();stopped=true;release({text:'shared chapter'});
 assert.equal((await second).text,'shared chapter');await firstStopped;
 // A network failure and a failed response body retry without manual task restarts.
 for(const failure of ['network','body','timeout','gateway','empty']){
  let count=0;f.setHandler(async()=>{count++;if(count===1){if(failure==='network')throw new TypeError('Failed to fetch');if(failure==='timeout'){const error=new Error('timeout');error.name='TimeoutError';throw error;}if(failure==='gateway')return new Response('<html>gateway</html>',{status:502});if(failure==='body')return new Response(new ReadableStream({start(controller){controller.error(new Error('connection lost'));}}));return {text:''};}return {text:'complete recovered chapter'};});
  const d=await f.run(`cachedChapter('https://www.wenku8.net/${failure}.htm',true)`);assert.equal(d.text,'complete recovered chapter');assert.equal(count,2);
 }
 // Persistent failures stop after a bounded budget; real auth errors are not hammered.
 let failures=0;f.setHandler(()=>{failures++;throw new TypeError('Failed to fetch');});
 await assert.rejects(f.run("cachedChapter('https://www.wenku8.net/persistent.htm',true)"),/无法连接/);assert.equal(failures,5);
 for(const message of ['来源需要登录','来源要求浏览器验证','来源段落排序规则已变化','来源返回 HTTP 403']){failures=0;f.setHandler(()=>{failures++;return new Response(JSON.stringify({error:message}),{status:500});});await assert.rejects(f.run(`cachedChapter('https://www.wenku8.net/${failures}-${encodeURIComponent(message)}.htm',true)`));assert.equal(failures,1);}
 // Imports replace only the selected chapter, remain local, and avoid another service fetch.
 const importedURL='https://www.wenku8.net/imported.htm',importedText='这是用户在已登录原站复制的完整章节正文。'.repeat(5);
 f.ctx.importedText=importedText;await f.run(`saveImportedChapter({url:'${importedURL}',title:'Imported'},importedText)`);
 const before=f.requests.length;assert.equal((await f.run(`cachedChapter('${importedURL}')`)).text,importedText);assert.equal(f.requests.length,before);
 await assert.rejects(f.run("saveImportedChapter({url:'https://evil.example/a',title:'Bad'},importedText)"),/来源不支持/);
 // A mid-book error retains earlier chapters; resuming never fetches them again.
 const taskFixture=fixture();await settle();taskFixture.run("chapterDelay=async()=>{};blobDownload=()=>{};var packaged=[];createBookEPUB=async(title,chapters)=>{packaged.push(chapters);return {blob:new Blob(['epub']),images:0};};var task={id:'recover',title:'Book',url:'https://www.wenku8.net/book/9.htm',from:1,to:2,layout:DEFAULT_EPUB_LAYOUT,progress:0,target:{title:'Book',url:'https://www.wenku8.net/book/9.htm',chapters:[{title:'One',url:'https://www.wenku8.net/one.htm'},{title:'Two',url:'https://www.wenku8.net/two.htm'}]}};novelTasks.push(task)");
 let oneCalls=0,twoCalls=0;taskFixture.setHandler(u=>{if(u.includes('one.htm')){oneCalls++;return {text:'first complete chapter'};}twoCalls++;return {error:'来源需要登录'};});
 await taskFixture.run('runNovelTask(task)');assert.equal(taskFixture.run('task.status'),'error');assert.equal(taskFixture.run('task.completedChapters.length'),1);assert.equal(taskFixture.run('task.failedChapter.title'),'Two');assert.match(taskFixture.run('novelTaskHTML(task)'),/保存已获取 1 章/);assert.equal(twoCalls,1);
 taskFixture.ctx.importedText=importedText;await taskFixture.run('saveImportedChapter(task.failedChapter,importedText)');await taskFixture.run('runNovelTask(task)');assert.equal(taskFixture.run('task.status'),'ready');assert.equal(taskFixture.run('packaged[0].length'),2);assert.equal(oneCalls,1);assert.equal(twoCalls,1);
 // Range parsing accepts multiple groups, deduplicates and bounds every chapter.
 assert.equal(f.run("JSON.stringify(parseChapterRange('1-3，3、5～6',6))"),'[0,1,2,4,5]');
 for(const input of ['', '0', '3-1', '1-7', '1,', '2.5', '1-999999999999'])assert.throws(()=>f.run(`parseChapterRange(${JSON.stringify(input)},6)`));
 assert.equal(f.run("chapterRangeLabel([0,1,2,4,5,7])"),'1-3, 5-6, 8');
 // EPUB formatting strips source indentation/blank lines without merging paragraphs.
 assert.equal(f.run("epubParagraphs('　　甲\\n\\n \\n\\u00a0乙\\r\\n<丙>')"),'<p>甲</p><p>乙</p><p>&lt;丙&gt;</p>');
 assert.match(f.run('epubStyles(DEFAULT_EPUB_LAYOUT)'),/text-indent:0em/);
 assert.match(f.run('epubStyles(DEFAULT_EPUB_LAYOUT)'),/margin:0 0 0.5em/);
 assert.equal(f.run("normalizeEPUBLayout({lineHeight:99,indent:-5,titleAlign:'bad'}).lineHeight"),2.2);
 assert.equal(f.run("normalizeEPUBLayout({lineHeight:99,indent:-5,titleAlign:'bad'}).indent"),0);
 // On deep links all lexical state has initialized before the initial route.
 const deep=fixture('');await settle();await settle();assert.match(deep.get('#breadcrumb').textContent,/轻小说/);
 console.log('Frontend logic passed: fresh refresh, service check, disabled-storage reader, stale chapter response, retry backoff, cancellation isolation, deep-link startup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
