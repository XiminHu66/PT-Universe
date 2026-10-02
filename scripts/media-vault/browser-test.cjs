const { chromium }=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const http=require('node:http'),path=require('node:path');
 const server=http.createServer((req,res)=>{let file=path.join(process.cwd(),decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file.endsWith('/'))file+='index.html';if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const options={headless:true,args:['--no-sandbox']};
 if(process.env.CHROMIUM_PATH)options.executablePath=process.env.CHROMIUM_PATH;
 const browser=await chromium.launch(options),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const snapshot=JSON.parse(fs.readFileSync('apps/media-vault/data/snapshot.json','utf8'));
 let freshCharts=0,holdChapters=false,releaseChapters,failImage=true;
 const chapterGate=new Promise(resolve=>releaseChapters=resolve),started=new Set();
 const bookURL=id=>'https://www.wenku8.net/book/'+id+'.htm';
 const bookTitle=id=>id===1?'贵族千金只愿意亲近我':'测试小说 '+id;
 const catalogue=Array.from({length:6},(_,i)=>({title:bookTitle(i+1),url:bookURL(i+1),source:'文库',author:'测试作者'}));
 await page.route('**/api/media/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/charts')){if(u.searchParams.get('refresh')==='1')freshCharts++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot.charts['jp-0'])});}
  if(u.pathname.endsWith('/health'))return route.fulfill({json:{ok:true,version:3}});
  if(u.pathname.endsWith('/novel/catalog'))return route.fulfill({json:{items:catalogue}});
  if(u.pathname.endsWith('/novel')){const id=Number(u.searchParams.get('url').match(/(\d+)\.htm/)[1]);return route.fulfill({json:{...catalogue[id-1],chapters:Array.from({length:id===5?1:2},(_,i)=>({title:'第 '+(i+1)+' 章 · 小说 '+id,url:'https://www.wenku8.net/novel/'+id+'/'+(i+1)+'.htm'}))}});}
  if(u.pathname.endsWith('/chapter')){const url=u.searchParams.get('url'),id=Number(url.match(/novel\/(\d+)/)[1]);started.add(id);if(holdChapters&&id>=2&&id<=5)await chapterGate;
   const image='https://images.example.org/'+(id===6?'failure':id===5?'only':'fixture')+'.png',text='这是小说 '+id+' 的完整测试章节。';
   return route.fulfill({json:{title:'第 '+url.match(/(\d+)\.htm/)[1]+' 章 · 小说 '+id,url,text:id===5?'':text,blocks:id===5?[{type:'image',url:image}]:[{type:'text',text:text.repeat(8)},{type:'image',url:image},{type:'text',text:'插图之后。'},{type:'image',url:image}]}});
  }
  if(u.pathname.endsWith('/novel/image')){if(failImage&&u.searchParams.get('url').includes('failure'))return route.fulfill({status:400,json:{error:'图片来源返回 HTTP 403'}});return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAIAAADQ/GvKAAAAFElEQVR4nGMM6DnBgA0wYRUd0RIA97sBvJDvBzoAAAAASUVORK5CYII=','base64')});}
  if(u.pathname.endsWith('/anime/episodes'))return route.fulfill({json:{items:[{title:'無職轉生 第 '+(u.searchParams.get('page')==='2'?'01':'12')+' 集',url:'https://anime1.me/30257'}],hasNext:u.searchParams.get('page')!=='2'}});
  if(u.pathname.endsWith('/anime'))return route.fulfill({json:{items:Array.from({length:80},(_,i)=>({id:i+1,title:i===0?'無職轉生 ～到了異世界就拿出真本事～':'番劇 '+i,episodes:'1-12',year:i<40?'2024':'2023',season:'春',url:'https://anime1.me/?cat='+(i+1)}))}});
  return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'测试：来源返回 403'})});
 });
 await page.goto(process.env.MEDIA_BASE_URL||base+'/apps/media-vault/');
 await page.locator('#novels').waitFor({state:'visible'});
 assert.equal(await page.getAttribute('html','data-theme'),'light');
 await page.click('#themeToggle');assert.equal(await page.getAttribute('html','data-theme'),'dark');
 await page.reload();assert.equal(await page.getAttribute('html','data-theme'),'dark');await page.click('#themeToggle');
 // Replace only wall-clock source spacing; keep fetch, cache, queue and EPUB code real.
 await page.evaluate(()=>{chapterDelay=async()=>{};});
 fs.mkdirSync('test-results/media-vault',{recursive:true});
 const save=async(selector,name)=>{const download=page.waitForEvent('download');await page.click(selector);await(await download).saveAs('test-results/media-vault/'+name);};
 const openBook=async id=>{await page.fill('#novelURL',bookURL(id));await page.click('#novelSearch button');await page.waitForFunction(id=>document.querySelector('#readerTitle').textContent.includes('小说 '+id)&&document.querySelector('#readerText').textContent.includes('完整测试章节'),id);};
 await page.locator('#txtImport').setInputFiles({name:'阅读测试.txt',mimeType:'text/plain',buffer:Buffer.from('第一章\n这是第一段。\n这是第二段。')});
 await page.waitForFunction(()=>document.querySelector('#readerText').textContent.includes('第二段'));
 await save('#readerEPUB','reader.epub');
 await openBook(1);
 await page.waitForFunction(()=>[...document.querySelectorAll('#readerText img')].every(i=>i.complete&&i.naturalWidth>0));
 await save('#readerEPUB','illustrated.epub');await save('#bookEPUB','book.epub');
 assert.match(await page.locator('#novelTaskList').textContent(),/2 章 · 1 张图片/);
 await page.click('#readerNext');await page.waitForFunction(()=>document.querySelector('#bookshelf').textContent.includes('上次：第 2 章'));
 assert.ok(await page.locator('#readerNext').isDisabled());assert.match(await page.locator('#bookshelf').textContent(),/上次：第 2 章/);
 await page.fill('#novelURL','貴族千金');await page.click('#novelSearch button');await page.waitForSelector('[data-novel-match]');
 assert.match(await page.locator('#novelMatches').textContent(),/贵族千金只愿意亲近我/);
 // Four independent books: three concurrent jobs and a queued fourth.
 holdChapters=true;await page.fill('#novelURL','测试小说');await page.click('#novelSearch button');await page.waitForFunction(()=>document.querySelectorAll('[data-match-download]').length===5);
 for(let i=0;i<4;i++)await page.click('[data-match-download="'+i+'"]');
 await page.waitForFunction(()=>novelTasks.filter(t=>t.status==='running').length===3&&novelTasks.filter(t=>t.status==='queued').length===1);
 assert.deepEqual([...started].filter(x=>x>=2).sort(),[2,3,4]);
 assert.equal(await page.locator('#novelTaskList [data-status="running"] progress').count(),3);
 // Duplicate clicks never create a second active task for the same book.
 await page.click('[data-match-download="0"]');assert.equal(await page.evaluate(()=>novelTasks.filter(t=>['running','queued'].includes(t.status)).length),4);
 // Reading and switching books stay available while downloads are blocked.
 await openBook(1);assert.equal(await page.locator('#readerText img').count(),2);
 const cancelled=await page.evaluate(()=>novelTasks.find(t=>t.url.endsWith('/2.htm')).id);
 await page.click('#novelTaskList [data-novel-cancel="'+cancelled+'"]');releaseChapters();holdChapters=false;
 await page.waitForFunction(()=>!novelTasks.some(t=>['queued','running'].includes(t.status)));
 assert.equal(await page.evaluate(id=>novelTasks.find(t=>t.id===id).status,cancelled),'cancelled');
 assert.equal(await page.evaluate(()=>novelTasks.filter(t=>t.status==='ready').length),5);
 const imageOnly=await page.evaluate(()=>novelTasks.find(t=>t.url.endsWith('/5.htm')).id);
 await save('#novelTaskList [data-novel-save="'+imageOnly+'"]','images-only.epub');
 await save('#saveNovelBundle','collection.zip');
 const bundle=await page.evaluate(async()=>{const z=new JSZip();for(const t of novelTasks.filter(t=>t.blob)){const file=await z.loadAsync(await t.blob.arrayBuffer());const chapter=await file.file('OEBPS/'+(t.url.endsWith('/5.htm')||t.to===1?'chapter':'c0')+'.xhtml').async('string');if(!t.url.endsWith('/5.htm')&&!chapter.includes('小说 '+t.url.match(/(\d+)\.htm/)[1]))return false;}return true;});assert.ok(bundle,'Concurrent books mixed chapter contents');
 // Failure in one illustration cannot create a falsely successful EPUB; retry works.
 await page.fill('#novelURL','测试小说 6');await page.click('#novelSearch button');await page.waitForFunction(()=>document.querySelectorAll('[data-match-download]').length===1);
 await page.click('[data-match-download]');await page.waitForFunction(()=>novelTasks.some(t=>t.status==='error'));
 const failed=await page.evaluate(()=>{const t=novelTasks.find(t=>t.status==='error');return {id:t.id,blob:!!t.blob,detail:t.detail};});assert.equal(failed.blob,false);assert.match(failed.detail,/插图下载失败/);
 failImage=false;await page.click('#novelTaskList [data-novel-retry="'+failed.id+'"]');await page.waitForFunction(id=>novelTasks.find(t=>t.id===id).status==='ready',failed.id);
 await page.click('#showShelf');await openBook(3);await openBook(1);
 await page.screenshot({animations:'disabled',path:'test-results/media-vault/desktop.png'});
 const panes=await page.locator('.novel-layout > *').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})));
 assert.ok(panes[0].x<panes[1].x&&panes[1].x<panes[2].x&&panes[2].width>panes[0].width*2);
 await page.click('#themeToggle');await page.screenshot({animations:'disabled',path:'test-results/media-vault/dark.png'});await page.click('#themeToggle');
 await page.setViewportSize({width:390,height:844});
 for(const pane of ['library','chapters','reading']){await page.click('[data-novel-pane="'+pane+'"]');await page.screenshot({animations:'disabled',path:'test-results/media-vault/mobile-'+pane+'.png'});assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Mobile horizontal overflow');}
 await page.setViewportSize({width:1440,height:1000});
 await page.click('[data-tab="music"]');await page.waitForSelector('.track');await page.click('#chartRefresh');await page.waitForFunction(()=>!document.querySelector('#chartRefresh').disabled);assert.equal(freshCharts,1);
 await page.click('#serviceCheck');await page.waitForFunction(()=>document.querySelector('#serviceStatus').textContent.includes('v3'));
 await page.click('[data-tab="anime"]');await page.waitForSelector('[data-series]');
 if(await page.locator('[data-series]').count()!==36)throw Error('Catalogue pagination failed');
 await page.click('#animeNext');if(!(await page.locator('#animePageLabel').textContent()).includes('2 / 3'))throw Error('Catalogue next page failed');
 await page.fill('#animeQuery','无职转生');await page.click('#animeSearch button');await page.waitForFunction(()=>document.querySelectorAll('[data-series]').length===1);
 const simplified=await page.locator('#animeList').textContent();
 await page.fill('#animeQuery','無職轉生');await page.click('#animeSearch button');await page.waitForFunction(()=>!document.querySelector('#animeSearch button').disabled);
 if(await page.locator('#animeList').textContent()!==simplified)throw Error('Simplified/traditional results differ');
 await page.click('[data-series]');await page.waitForSelector('[data-episode]');await page.click('#animeNext');await page.waitForFunction(()=>document.querySelector('#animePageLabel').textContent==='剧集第 2 页');
 if(!await page.locator('#animeNext').isDisabled())throw Error('Last episode page must disable Next');
 if(!(await page.locator('#animeList').textContent()).includes('01'))throw Error('Episode pagination failed');
 await page.click('#animeBack');await page.waitForSelector('[data-series]');
 for(const tab of ['anime','torrent','video']){await page.click(`[data-tab="${tab}"]`);await page.locator('#'+tab).waitFor({state:'visible'});}
 await page.click('#settingsOpen');await page.waitForSelector('#settings[open]');await page.click('[data-close="settings"]');
 await page.setViewportSize({width:390,height:844});await page.click('[data-tab="music"]');
 await page.screenshot({animations:'disabled',path:'test-results/media-vault/mobile.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Three-pane desktop/mobile, persisted themes, concurrent jobs, queue cap, cancellation, retry, offline illustrations, TXT, other media: passed');await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
