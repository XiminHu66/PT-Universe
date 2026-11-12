const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const original=JSON.parse(fs.readFileSync('apps/stock-alert/data/market.json')).symbols.AAPL;
 const company=JSON.parse(fs.readFileSync('apps/thesis-lab/data/financials.json')).companies[0];
 const now=new Date('2026-11-23T15:55:00Z');
 await page.clock.setFixedTime(now);
 const offset=now.valueOf()-Date.parse(original.history.at(-1).d);
 const quote=symbol=>({...original,symbol,name:'Fixture '+symbol,price:symbol==='AMD'?200:150,lastTradeAt:now.toISOString(),history:original.history.map(h=>({...h,d:new Date(Date.parse(h.d)+offset).toISOString().slice(0,10)})),sourceURL:'https://example.com/quotes/'+symbol});
 await ctx.route('**/pt-analytics.js',r=>r.fulfill({body:''}));
 await ctx.route('https://query*.finance.yahoo.com/**',r=>r.abort());
 let calls=[];
 await ctx.route('https://pt-universe-api.*/**',async r=>{
  const u=new URL(r.request().url());
  if(u.pathname==='/api/kronos'){
   const symbol=u.searchParams.get('symbol'),asOf='2026-11-20';
   const data={symbol,asOf,reference:200,endMedian:206,endLow:192,endHigh:215,up:3,down:1,paths:[205,207,192,215].map(end=>Array(10).fill(end)),dates:['2026-11-23','2026-11-24','2026-11-25','2026-11-27','2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-07']};
   return r.fulfill({headers:{'access-control-allow-origin':'*'},json:{state:r.request().method()==='POST'?'fresh':'empty',session:asOf,data:r.request().method()==='POST'?data:null}});
  }
  if(u.pathname==='/api/on-demand/stock'){
   const symbol=u.searchParams.get('symbol');
   if(symbol==='MISSING')return r.fulfill({status:502,headers:{'access-control-allow-origin':'*'},json:{error:'quote missing'}});
   return r.fulfill({headers:{'access-control-allow-origin':'*'},json:{state:'fresh',data:quote(symbol)}});
  }
  if(u.pathname==='/api/investment/company'){
   const s=u.searchParams.get('symbol');
   return r.fulfill({headers:{'access-control-allow-origin':'*'},json:{company:{...company,ticker:s,updatedAt:now.toISOString(),sourceURL:'https://example.com/filings/'+s}}});
  }
  if(u.pathname==='/api/investment/quote'){
   const s=u.searchParams.get('symbol');calls.push(s);
   await new Promise(resolve=>setTimeout(resolve,150));
   return r.fulfill({headers:{'access-control-allow-origin':'*'},json:{quote:quote(s),company:{...company,ticker:s,updatedAt:now.toISOString(),sourceURL:'https://example.com/filings/'+s}}});
  }
  return r.fulfill({headers:{'access-control-allow-origin':'*'},json:{}});
 });
 await page.goto('http://127.0.0.1:8765/apps/investment-desk/');
 await page.evaluate(()=>localStorage.setItem('stock_alert_watchlist_v1',JSON.stringify([{symbol:'QQQ',display:'QQQ',name:'My original watch'}])));
 await page.reload();
 await page.locator('#tab-market').click();
 const stock=page;
 assert.equal(await page.locator('iframe[title="stock-alert"]').count(),0);
 await stock.locator('#watchTab[aria-selected=true]').waitFor();
 await stock.locator('#holdingsTab').click();
 assert.match(await stock.locator('#watchlist').innerText(),/尚未导入/);
 await stock.locator('#portfolio-open').click();
 await page.locator('#portfolio-dialog[open]').waitFor();
 await page.locator('#portfolio-file').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('bad data')});
 await page.locator('#csv-feedback.csv-error').waitFor();
 assert.equal(await page.locator('#portfolio-import').count(),0);
 await page.keyboard.press('Escape');
 await page.locator('#portfolio-dialog').waitFor({state:'hidden'});
 async function importCSV(csv,replace=false){
  await page.locator('#portfolio-open').click();
  await page.locator('#portfolio-file').setInputFiles({name:'positions.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.locator('#portfolio-import').waitFor();
  if(replace)await page.locator('#import-mode').selectOption('replace');
  await page.locator('#portfolio-import').click();
  await page.locator('#refreshAllButton:not([disabled])').waitFor();
 }
 await importCSV('Symbol,Quantity,Cost\nAMD,2.5,100\nAAPL,3,140');
 await page.locator('#tab-market').click();
 await stock.locator('#holdingsTab[aria-selected=true]').waitFor();
 assert.equal(await stock.locator('#watchlist [data-symbol]').count(),2);
 assert.equal(await stock.locator('#watchlist [data-remove]').count(),0);
 await stock.locator('[data-symbol=AMD]').click();
 await stock.locator('#quotePrice').filter({hasText:'200.00'}).waitFor();
 assert.ok(await stock.locator('.plan-heading .decision-tag').innerText());
 assert.match(await stock.locator('#positionDecision').innerText(),/持仓 2.5 股/);
 assert.match(await stock.locator('.position-holding').innerText(),/\+100.00%/);
 assert.doesNotMatch(await stock.locator('#positionDecision').innerText(),/均价|\+\$250.00/);
 assert.doesNotMatch(await stock.locator('#watchlist').innerText(),/成本|数据不足/);
 assert.equal(await page.locator('#ws-symbol').inputValue(),'AMD');
 assert.match(await stock.locator('.plan-window').innerText(),/2026年11月23日 – 11月30日/);
 assert.match(await stock.locator('.plan-buy').innerText(),/买入区间\s*\$[\d.]+–\$[\d.]+/);
 assert.match(await stock.locator('.plan-sell').innerText(),/止盈区间\s*\$[\d.]+–\$[\d.]+/);
 assert.match(await stock.locator('.plan-risk').innerText(),/止损区间\s*低于 \$[\d.]+/);
 assert.doesNotMatch(await stock.locator('#watchlist').innerText(),/风险卖出复查|买入候选/);
 await stock.locator('[data-period="1M"]').click();
 assert.equal(await stock.locator('[data-period="1M"]').getAttribute('aria-pressed'),'true');
 assert.match(await stock.locator('#chart path[stroke="var(--blue)"]').getAttribute('d'),/^M.+L/);
 await stock.locator('#positionEvidence summary').click();
 assert.equal(await stock.locator('#positionEvidence a').first().getAttribute('href'),'https://example.com/quotes/AMD');
 assert.match(await stock.locator('#positionEvidence').innerText(),/MA20/);
 assert.match(await stock.locator('#positionEvidence').innerText(),/\+\$250.00/);
 await stock.locator('#positionEvidence summary').click();
 await stock.locator('#watchTab').click();
 assert.equal(await stock.locator('[data-symbol=QQQ]').count(),1);
 await stock.locator('#holdingsTab').click();
 // Older static snapshots cannot remove custom-symbol API evidence.
 await page.evaluate(()=>dispatchEvent(new CustomEvent('workspace-investment-data',{detail:{market:{symbols:{AMD:{symbol:'AMD',price:1,lastTradeAt:'2000-01-01'}}}}})));
 assert.equal(await stock.locator('#quotePrice').innerText(),'200.00');
 await page.screenshot({path:'/tmp/pt-holdings-market-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await stock.locator('[data-evidence=technical]').click();
 assert.match(await stock.locator('#indicatorGrid').innerText(),/年化波动率/);
 assert.match(await stock.locator('#indicatorGrid').innerText(),/ATR 14/);
 await stock.locator('[data-evidence=options]').click();
 await stock.locator('#optionsBody').waitFor();
 await stock.locator('[data-evidence=news]').click();
 await stock.locator('#newsList').waitFor();
 await stock.locator('[data-evidence=overview]').click();
 await stock.locator('.kronos-summary strong').filter({hasText:'3/4 条路径到期上涨'}).waitFor();
 assert.match(await stock.locator('.kronos-metrics').innerText(),/\$206.00/);
 await stock.locator('#kronosRun').waitFor({state:'hidden'});
 assert.equal(await stock.locator('.kronos-next').count(),0);
 await stock.locator('#kronosResult summary').click();
 assert.match(await stock.locator('.kronos-zone-list').innerText(),/买入区间.*条路径/s);
 await stock.locator('#kronosResult summary').click();
 await stock.locator('[data-edit-range]').click();
 await stock.locator('#buyLowInput').fill('190');
 await stock.locator('#buyHighInput').fill('200');
 await stock.locator('#refreshButton').click();
 assert.equal(await stock.locator('#buyLowInput').inputValue(),'190');
 await stock.locator('#rangeForm button[type=submit]').click();
 assert.equal(await stock.evaluate(()=>JSON.parse(localStorage.getItem('stock_alert_ranges_v1')).AMD.buyLow),190);
 await stock.locator('[data-evidence=overview]').click();
 await stock.locator('#holdingsTab').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/pt-holdings-market-mobile.png',fullPage:true});
 const originalHoldings = await page.evaluate(() => {
  const key = 'ptu.decision.holdings';
  const old = localStorage.getItem(key);
  const holdings = JSON.parse(old);
  for (const symbol of ['NVDA','GOOGL','MSFT','META','AMZN','QQQ','SPY','SMH','INTC','TSLA','COST','VOO','DIA','HOOD','NOW','QQQM']) {
   holdings.push({symbol, quantity:10, cost:100});
  }
  localStorage.setItem(key, JSON.stringify(holdings));
  dispatchEvent(new CustomEvent('workspace-records', {detail:{key:'holdings'}}));
  return old;
 });
 assert.equal(await page.locator('#watchlist .watch-item').count(), 18);
 for (const [width, height] of [[1920,945],[1366,768],[1024,720]]) {
  await page.setViewportSize({width, height});
  const layout = await page.evaluate(() => {
   const watchlist = document.querySelector('#watchlist');
   return {
    chartBottom: document.querySelector('.chart-card').getBoundingClientRect().bottom,
    pageHeight: document.documentElement.scrollHeight,
    pageWidth: document.documentElement.scrollWidth,
    holdingsFit: watchlist.scrollHeight <= watchlist.clientHeight + 1
   };
  });
  assert.ok(layout.chartBottom <= height && layout.pageHeight <= height + 1 && layout.pageWidth <= width + 1,
   `${width}×${height} overview should fit: ${JSON.stringify(layout)}`);
  if (width === 1920) assert.ok(layout.holdingsFit, 'All 18 holdings should fit the wide-screen rail');
 }
 await page.evaluate(old => {
  localStorage.setItem('ptu.decision.holdings', old);
  dispatchEvent(new CustomEvent('workspace-records', {detail:{key:'holdings'}}));
 }, originalHoldings);
 await page.setViewportSize({width:1440,height:1000});
 await importCSV('Symbol,Quantity,Cost\nAAPL,7,90',true);
 await page.locator('#tab-market').click();
 await stock.locator('#holdingsTab[aria-selected=true]').waitFor();
 assert.equal(await stock.locator('#watchlist [data-symbol]').count(),1);
 assert.equal(await stock.locator('#quoteSymbol').innerText(),'AAPL');
 assert.match(await stock.locator('#positionDecision').innerText(),/持仓 7 股/);
 await stock.locator('#positionEvidence summary').click();
 assert.match(await stock.locator('#positionEvidence').innerText(),/均价 \$90.00/);
 await stock.locator('#positionEvidence summary').click();
 await stock.locator('#tab-audit').click();
 await page.locator('#tab-audit[aria-selected=true]').waitFor();
 await page.locator('#tab-market').click();
 // Cached parent data is replayed after reloading the lazily created child.
 await page.reload();
 await stock.locator('#quotePrice').filter({hasText:'150.00'}).waitFor();
 // Missing/stale data never creates an actionable conclusion.
 await page.evaluate(()=>{const key='ptu.decision.holdings';const hs=JSON.parse(localStorage.getItem(key));hs.push({symbol:'MISSING',quantity:1,cost:null});localStorage.setItem(key,JSON.stringify(hs));dispatchEvent(new CustomEvent('workspace-records',{detail:{key:'holdings'}}))});
 await stock.locator('[data-symbol=MISSING]').click();
 await stock.locator('#positionDecision').filter({hasText:'暂无区间'}).waitFor();
 assert.equal(await stock.locator('.position-ranges').count(),0);
 assert.ok(calls.includes('AMD'));
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('Holdings market passed: CSV import/replacement, preserved watchlist, custom-symbol quote + verdict, evidence, replay, empty/missing data, mobile layout and first-screen desktop fit');
})().catch(e=>{console.error(e);process.exit(1)});
