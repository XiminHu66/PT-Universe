/* Network-intercepted browser coverage; no real LAN device is contacted. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext();let lan=0;
  await context.route(/^https:\/\//,r=>r.fulfill({json:{}}));
  await context.route('http://192.168.4.*:8085/**',r=>{lan++;return r.request().url().includes('192.168.4.23:8085')?r.fulfill(r.request().url().endsWith('/api/device')?{json:{type:'server',model:'BOOX fixture'}}:{contentType:'text/html',body:'<h1>BOOX native fixture</h1><input type="file">'}):r.abort()});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'granted'})}})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/apps/daily-nexus/?view=tools`;
  await page.goto(url);await page.locator('#booxEntry').waitFor();assert.equal(lan,0,'No scan before explicit use');
  await page.locator('#booxEntry').click();await page.waitForFunction(()=>document.querySelector('#booxCount').textContent.includes('已停止其余扫描'));
  assert.equal(await page.locator('#booxNative').getAttribute('href'),'http://192.168.4.23:8085/');
  assert.ok((await page.locator('#booxStatus').innerText()).includes('BOOX fixture'));
  await page.frameLocator('#booxFrame').getByRole('heading',{name:'BOOX native fixture'}).waitFor();
  await page.locator('#booxAuto').check();const prior=lan;await page.reload();await page.waitForFunction(()=>document.querySelector('#booxCount').textContent.includes('已停止其余扫描'));assert.ok(lan>prior,'Opt-in reconnect on tools reload');assert.ok(lan-prior<=3,'Remembered reconnect must not scan other addresses');
  await page.locator('#booxClose').click();assert.equal(await page.locator('#booxPanel').isVisible(),false);assert.equal(await page.locator('#booxFrame').getAttribute('src'),'about:blank');
  await page.locator('[data-view=home]').click();await page.locator('[data-view=tools]').click();await page.waitForFunction(()=>document.querySelector('#booxCount').textContent.includes('已停止其余扫描'));assert.equal(await page.locator('#booxPanel').isVisible(),true);
  assert.deepEqual(errors,[]);await context.close();
  const opaque=await browser.newContext();let opaqueLan=0;
  await opaque.route(/^https:\/\//,r=>r.fulfill({json:{}}));
  await opaque.route('http://192.168.4.*:8085/**',r=>{
    opaqueLan++;if(!r.request().url().includes('192.168.4.23:8085'))return r.abort();
    if(r.request().url().endsWith('/api/device'))return r.abort();
    return r.fulfill({contentType:'text/html',body:'<h1>BOOX opaque fixture</h1>'});
  });
  await opaque.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'granted'})}})});
  const op=await opaque.newPage();
  op.on('console',message=>{if(message.text().startsWith('opaque fixture'))console.log(message.text())});
  await op.addInitScript(()=>{
    const realFetch=fetch.bind(window);
    window.fetch=async(url,options)=>{try{const response=await realFetch(url,options);if(String(url).includes('192.168.4.23:8085'))console.log('opaque fixture response',String(url),options?.mode,response.type,response.status);return response}catch(error){if(String(url).includes('192.168.4.23:8085'))console.log('opaque fixture error',String(url),options?.mode,error.message);throw error}};
  });
  await op.goto(url);await op.locator('#booxEntry').click();
  await op.waitForFunction(()=>!document.querySelector('#booxScan').disabled);
  console.log('opaque fixture state',await op.locator('#booxStatus').innerText(),await op.locator('#booxFrame').getAttribute('src'),opaqueLan);
  await op.frameLocator('#booxFrame').getByRole('heading',{name:'BOOX opaque fixture'}).waitFor();
  assert.ok((await op.locator('#booxStatus').innerText()).includes('不允许识别设备'));
  assert.ok(opaqueLan<254,'An opaque candidate must open before finishing the subnet scan');
  await opaque.close();
  const denied=await browser.newContext();let deniedRequests=0;
  await denied.route(/^https:\/\//,r=>r.fulfill({json:{}}));await denied.route('http://192.168.4.*:8085/**',r=>{deniedRequests++;return r.abort()});
  await denied.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied'})}})});
  const blocked=await denied.newPage();await blocked.goto(url);await blocked.locator('#booxEntry').click();await blocked.getByText('本地网络权限已被拒绝。',{exact:false}).waitFor();assert.equal(deniedRequests,0);assert.equal(await blocked.locator('#booxScan').isEnabled(),true);await denied.close();
  console.log('BOOX UI: explicit scan, native iframe, opt-in reconnect, close, tab return and denied-permission recovery passed (synthetic LAN).');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());

