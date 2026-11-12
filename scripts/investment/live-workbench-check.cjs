const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const site='https://ximinhu66.github.io';
const api='https://pt-universe-api.summer07-nanjolno.workers.dev';
const modelURL=api+'/api/kronos?symbol=NVDA';
const headers={origin:site,'user-agent':'Mozilla/5.0 Chrome/154.0.0.0'};
async function model(){
 const res=await fetch(modelURL,{headers,signal:AbortSignal.timeout(18000)});
 assert.equal(res.status,200);
 return res.json();
}
(async()=>{
 const denied=await fetch(modelURL,{method:'POST',headers:{...headers,origin:'https://example.invalid'},signal:AbortSignal.timeout(18000)});
 assert.equal(denied.status,403);
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1024,height:470}});
  await ctx.route('**/pt-analytics.js',route=>route.fulfill({body:''}));
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(site+'/stock-alert/?symbol=NVDA',{waitUntil:'domcontentloaded'});
  await page.waitForURL(url=>url.pathname==='/PT-Universe/apps/investment-desk/'&&url.searchParams.get('symbol')==='NVDA');
  await page.locator('#quoteSymbol').filter({hasText:'NVDA'}).waitFor();
  const before=await model();
  if(!['fresh','running'].includes(before.state)){
   await page.locator('#kronosRun:not([disabled])').click();
   await page.locator('#kronosStatus').filter({hasText:/正在计算|行情截至/}).waitFor();
  }
  console.log('PASS: legacy redirect and production Kronos request accepted');
  assert.equal(await page.locator('iframe[title=stock-alert]').count(),0);
  await page.locator('#updatedAt').filter({hasText:'按需更新'}).waitFor({timeout:90000});
  await page.locator('#positionDecision').filter({hasText:'技术目标价'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.locator('[data-evidence=technical]').click();
  await page.locator('#indicatorGrid').filter({hasText:'RSI'}).waitFor();
  await page.locator('[data-evidence=options]').click();
  await page.locator('#expirySelect').waitFor();
  assert.ok(await page.locator('#expirySelect option').count()>1);
  await page.locator('#optionSide').selectOption('call');
  await page.locator('[data-evidence=news]').click();
  await page.locator('#newsList .news-item').first().waitFor();
  await page.locator('[data-evidence=ranges]').click();
  await page.locator('#buyLowInput').fill('120');
  await page.locator('#buyHighInput').fill('130');
  await page.locator('#rangeForm button[type=submit]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('stock_alert_ranges_v1')).NVDA.buyLow),120);
  await page.locator('[data-evidence=overview]').click();
  await page.locator('.personal-range-summary').filter({hasText:'120.00'}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  console.log('PASS: live price target, technical indicators, option expirations, news, personal range and mobile layout');
  await page.locator('#kronosResult').filter({hasText:'第 10 日中位'}).waitFor({timeout:450000});
  const ready=await model();
  assert.equal(ready.state,'fresh');
  assert.equal(ready.data.symbol,'NVDA');
  assert.equal(ready.session,ready.data.asOf);
  assert.equal(ready.data.paths.length,4);
  assert.ok(ready.data.paths.every(path=>path.length===10&&path.every(Number.isFinite)));
  assert.equal((await model()).data.generatedAt,ready.data.generatedAt);
  assert.deepEqual(errors,[]);
  console.log('PASS: four live ARM inference paths, ten trading sessions, unchanged cached result, browser presentation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
