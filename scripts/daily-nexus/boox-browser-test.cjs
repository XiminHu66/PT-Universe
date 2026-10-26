/* Network-intercepted browser coverage; no real LAN device is contacted. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext();let lan=0,probes=0;
  await context.route(/^https:\/\//,r=>r.fulfill({json:{}}));
  await context.route('http://192.168.4.*:8085/**',r=>{lan++;if(r.request().url().endsWith('/api/device'))probes++;return r.request().url().includes('192.168.4.23:8085')?r.fulfill(r.request().url().endsWith('/api/device')?{json:{type:'server',model:'BOOX fixture'}}:{contentType:'text/html',body:'<h1>BOOX native fixture</h1><input type="file">'}):r.abort()});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'granted'})}})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/apps/daily-nexus/?view=tools`;
  await page.goto(url);await page.locator('#booxEntry').waitFor();assert.equal(lan,0,'No scan before explicit use');
  await page.locator('#booxEntry').click();await page.waitForFunction(()=>document.querySelector('#booxCount').textContent.includes('已停止其余扫描'));
  assert.equal(await page.locator('#booxNative').getAttribute('href'),'http://192.168.4.23:8085/');
  assert.ok((await page.locator('#booxStatus').innerText()).includes('BOOX fixture'));
  assert.equal(await page.locator('#booxFrame').count(),0,'Never embed an insecure HTTP transfer page');
  assert.equal(await page.locator('#booxNative').getAttribute('target'),'_blank');
  assert.ok((await page.locator('#booxNative').getAttribute('rel')).includes('noopener'));
  assert.ok((await page.locator('#booxNative').innerText()).includes('打开 BOOX 互传'));

  await page.locator('#booxAuto').check();const prior=lan;await page.reload();await page.waitForFunction(()=>document.querySelector('#booxCount').textContent.includes('已停止其余扫描'));assert.ok(lan>prior,'Opt-in reconnect on tools reload');assert.ok(lan-prior<=3,'Remembered reconnect must not scan other addresses');
  // A known IP opens directly without probing, even if browser LAN scanning is unavailable.
  await page.locator('.boox-manual summary').click();
  await page.locator('#booxHost').fill('192.168.4.23');
  const priorProbes=probes;
  const popupPromise=page.waitForEvent('popup');
  await page.locator('#booxConnect').click();
  const popup=await popupPromise;
  assert.equal(new URL(popup.url()).host,'192.168.4.23:8085');
  assert.equal(probes,priorProbes,'Manual navigation must never perform an HTTP fetch/probe');
  await popup.close();
  await page.locator('#booxClose').click();assert.equal(await page.locator('#booxPanel').isVisible(),false);assert.equal(await page.locator('#booxFrame').count(),0);
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
  const op=await opaque.newPage();await op.goto(url);await op.locator('#booxEntry').click();
  await op.locator('#booxNative').waitFor({state:'visible'});
  assert.equal(await op.locator('#booxFrame').count(),0);
  assert.equal(await op.locator('#booxNative').getAttribute('href'),'http://192.168.4.23:8085/');
  assert.ok((await op.locator('#booxStatus').innerText()).includes('无法验证其设备身份'));
  assert.ok(opaqueLan<254,'An opaque candidate must open before finishing the subnet scan');
  await opaque.close();
  const denied=await browser.newContext();let deniedRequests=0;
  await denied.route(/^https:\/\//,r=>r.fulfill({json:{}}));await denied.route('http://192.168.4.*:8085/**',r=>{deniedRequests++;return r.abort()});
  await denied.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied'})}})});
  const blocked=await denied.newPage();await blocked.goto(url);await blocked.locator('#booxEntry').click();await blocked.getByText('本地网络权限已被拒绝。',{exact:false}).waitFor();assert.equal(deniedRequests,0);assert.equal(await blocked.locator('#booxScan').isEnabled(),true);await denied.close();
  // A firmware without the metadata endpoint, on another home subnet, must
  // still yield an explicitly unverified native transfer page.
  const firmware=await browser.newContext();
  await firmware.route(/^https:\/\//,r=>r.fulfill({json:{}}));
  await firmware.route('http://192.168.*:8085/**',r=>{
    if(!r.request().url().includes('192.168.6.42:8085'))return r.abort();
    return r.request().url().endsWith('/api/device')?r.fulfill({status:404,body:'missing'}):r.fulfill({contentType:'text/html',body:'<h1>BOOX transfer</h1>'});
  });
  await firmware.addInitScript(()=>{Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'granted'})}})});
  const fp=await firmware.newPage();await fp.goto(url);await fp.locator('#booxEntry').click();
  await fp.locator('#booxNative').waitFor({state:'visible'});
  assert.equal(await fp.locator('#booxNative').getAttribute('href'),'http://192.168.6.42:8085/');
  assert.ok((await fp.locator('#booxStatus').innerText()).includes('无法验证其设备身份'));
  assert.equal(await fp.locator('#booxProgress').getAttribute('max'),'1022');
  assert.equal(await fp.locator('#booxPermission').innerText(),'本地网络：已允许');
  await firmware.close();
  // Denying the permission dialog during the first probe must stop the scan,
  // preserve the actionable error and leave the controls reusable.
  const prompt=await browser.newContext();let promptRequests=0;
  await prompt.route(/^https:\/\//,r=>r.fulfill({json:{}}));
  await prompt.addInitScript(()=>{
    const state=new EventTarget();state.state='prompt';
    Object.defineProperty(navigator,'permissions',{value:{query:async()=>state}});
    window.denyBooxPermission=()=>{state.state='denied';state.dispatchEvent(new Event('change'))};
  });
  const pp=await prompt.newPage();
  await prompt.route('http://192.168.*:8085/**',async r=>{promptRequests++;await pp.evaluate(()=>window.denyBooxPermission());await r.abort()});
  await pp.goto(url);await pp.locator('#booxEntry').click();
  await pp.getByText('本地网络权限已被拒绝。',{exact:false}).waitFor();
  assert.equal(promptRequests,1);assert.equal(await pp.locator('#booxScan').isEnabled(),true);
  assert.equal(await pp.locator('#booxPermission').innerText(),'本地网络：已阻止');
  await prompt.close();
  console.log('BOOX UI: explicit scan, no mixed-content iframe, safe new-tab launch, direct IP, opt-in reconnect firmware 404, alternate home subnet and mid-dialog denial recovery passed (synthetic LAN).');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());

