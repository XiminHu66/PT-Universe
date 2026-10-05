const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.PT_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PT_CHROME||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const owner='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);let requests=0,mode='ok',last;
  await page.route('**/api/muse/**/deliver',async route=>{
   requests++;last=route.request().postDataJSON();
   const status=mode==='policy'?403:mode==='field'?400:201;
   const body=mode==='policy'?{error:'policy_denied: background action awaiting approval'}:mode==='field'?{error:'items[0].title 缺失',field:'items[0].title',code:'missing_field'}:{ok:true,reportId:last.reportId,receivedAt:new Date().toISOString(),duplicate:mode==='duplicate'};
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'apps/watch-inbox/submit.html#owner='+owner+'&token='+token);
  const input=page.locator('#report-json'),submit=page.getByRole('button',{name:'发送日报'});
  const report={reportId:'muse-browser-test',date:'2026-10-03',summary:'中'.repeat(8500),items:[{id:'one',title:'任务',summary:'文'.repeat(8500),status:'changed',observedAt:'2026-10-03T20:00:00Z',urls:['https://example.com/evidence'],before:null}]};
  await input.fill(JSON.stringify({...report,items:[{...report.items[0],title:undefined}]}));assert.match(await page.locator('#preflight').innerText(),/items\[0\]\.title/);assert.equal(await submit.isDisabled(),true);assert.equal(requests,0);
  await input.fill(JSON.stringify({...report,summary:'a'.repeat(30001)}));assert.match(await page.locator('#preflight').innerText(),/30001.*30000/);assert.equal(await submit.isDisabled(),true);
  await input.fill('{');assert.match(await page.locator('#preflight').innerText(),/JSON 格式无效/);
  await input.fill(JSON.stringify(report));assert.match(await page.locator('#preflight').innerText(),/校验通过/);await submit.click();await page.waitForFunction(()=>document.querySelector('#receipt').dataset.success==='true');assert.equal(requests,1);assert.equal(last.summary.length,8500);assert.equal(last.items[0].summary.length,8500);assert.equal(last.items[0].before,'');
  mode='duplicate';await submit.click();await page.waitForFunction(()=>document.querySelector('#receipt').textContent.includes('重试已去重'));
  mode='field';await submit.click();await page.waitForFunction(()=>document.querySelector('#receipt').dataset.success==='false');assert.match(await page.locator('#receipt').innerText(),/HTTP 400.*items\[0\]\.title/);assert.equal(await input.inputValue(),JSON.stringify(report),'failures must retain the full input');
  mode='policy';await submit.click();await page.waitForFunction(()=>document.querySelector('#receipt').textContent.includes('Muse 审批'));assert.match(await page.locator('#receipt').innerText(),/HTTP 403/);assert.equal(requests,4,'no automatic retries on validation or policy errors');
  await page.goto(base+'apps/watch-inbox/submit.html');await input.fill(JSON.stringify(report));assert.equal(await submit.isDisabled(),true);assert.equal(requests,4);
  assert.deepEqual(errors,[]);console.log('Muse browser tests passed: field preflight, long Chinese text, receipt, deduplication, retained failed input, policy error and credentials');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
