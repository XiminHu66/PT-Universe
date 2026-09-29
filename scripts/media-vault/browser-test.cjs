const { chromium }=require('playwright');
const fs=require('node:fs');
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
 let freshCharts=0;
 await page.route('**/api/media/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/charts')){if(u.searchParams.get('refresh')==='1')freshCharts++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot.charts['jp-0'])});}
  if(u.pathname.endsWith('/health'))return route.fulfill({json:{ok:true,version:3}});
  if(u.pathname.endsWith('/novel'))return route.fulfill({json:{title:'测试小说',url:'https://www.wenku8.net/book/1.htm',source:'fixture',chapters:[{title:'第一章',url:'https://www.wenku8.net/novel/0/1/2.htm'}]}});
  if(u.pathname.endsWith('/chapter'))return route.fulfill({json:{title:'第一章',text:'这是完整测试章节。'}});
  return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'测试：来源返回 403'})});
 });
 await page.goto(process.env.MEDIA_BASE_URL||base+'/apps/media-vault/');
 await page.waitForSelector('.track');
 await page.click('#chartRefresh');await page.waitForFunction(()=>!document.querySelector('#chartRefresh').disabled);if(freshCharts!==1)throw Error('Refresh reused stale snapshot');
 await page.click('#serviceCheck');await page.waitForFunction(()=>document.querySelector('#serviceStatus').textContent.includes('v3'));
 fs.mkdirSync('test-results/media-vault',{recursive:true});
 await page.screenshot({path:'test-results/media-vault/desktop.png'});
 await page.click('[data-country="us"]');await page.selectOption('#genre','21');
 await page.click('[data-tab="novels"]');
 await page.locator('#txtImport').setInputFiles({name:'阅读测试.txt',mimeType:'text/plain',buffer:Buffer.from('第一章\n这是第一段。\n这是第二段。')});
 await page.waitForSelector('#reader[open]');
 if(!(await page.locator('#readerText').textContent()).includes('第二段'))throw Error('TXT reader failed');
 const download=page.waitForEvent('download');await page.click('#readerEPUB');const file=await download;
 await file.saveAs('test-results/media-vault/reader.epub');await page.click('[data-close="reader"]');
 await page.fill('#novelURL','https://www.wenku8.net/book/1.htm');await page.click('#novelSearch button');await page.waitForSelector('#bookWatch');await page.click('#bookWatch');
 if(!(await page.locator('#notice').textContent()).includes('无需运行下载引擎'))throw Error('Watch still requires engine');
 await page.click('#watchManage');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('书架检查完成'));
 await page.click('[data-chapter]');await page.waitForFunction(()=>document.querySelector('#readerText').textContent.includes('完整测试章节'));await page.click('[data-close=reader]');
 for(const tab of ['anime','torrent','video']){await page.click(`[data-tab="${tab}"]`);await page.locator('#'+tab).waitFor({state:'visible'});}
 await page.click('#settingsOpen');await page.waitForSelector('#settings[open]');await page.click('[data-close="settings"]');
 await page.setViewportSize({width:390,height:844});await page.click('[data-tab="music"]');
 await page.screenshot({path:'test-results/media-vault/mobile.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Desktop, mobile, tabs, real refresh, health, engine-free watch, chapter reader, TXT import, EPUB export, settings: passed');await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
