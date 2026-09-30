const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const original=JSON.parse(fs.readFileSync('apps/stock-alert/data/market.json')).symbols.AAPL;
 const company=JSON.parse(fs.readFileSync('apps/thesis-lab/data/financials.json')).companies[0];
 const now=new Date(),offset=Date.now()-Date.parse(original.history.at(-1).d);
 const quote=symbol=>({...original,symbol,name:'Fixture '+symbol,price:symbol==='AMD'?200:150,lastTradeAt:now.toISOString(),history:original.history.map(h=>({...h,d:new Date(Date.parse(h.d)+offset).toISOString().slice(0,10)})),sourceURL:'https://example.com/quotes/'+symbol});
 await ctx.route('**/pt-analytics.js',r=>r.fulfill({body:''}));
 await ctx.route('https://query*.finance.yahoo.com/**',r=>r.abort());
 let calls=[];
 await ctx.route('https://pt-universe-api.*/**',async r=>{
  const u=new URL(r.request().url());
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
 const stock=page.frameLocator('iframe[title="stock-alert"]');
 await stock.locator('#watchTab[aria-selected=true]').waitFor();
 await stock.locator('#holdingsTab').click();
 assert.match(await stock.locator('#watchlist').innerText(),/尚未导入/);
 await stock.locator('#manageHoldings').click();
 await page.locator('#tab-review[aria-selected=true]').waitFor();
 async function importCSV(csv,replace=false){
  await page.locator('#portfolio-file').setInputFiles({name:'positions.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.locator('#portfolio-import').waitFor();
  if(replace)await page.locator('#import-mode').selectOption('replace');
  await page.locator('#portfolio-import').click();
  await page.locator('#portfolio-refresh:not([disabled])').waitFor();
 }
 await importCSV('Symbol,Quantity,Cost\nAMD,2.5,100\nAAPL,3,140');
 const reviewVerdict=await page.locator('[data-position=AMD] h2 .d-pill').innerText();
 await page.locator('#tab-market').click();
 await stock.locator('#holdingsTab[aria-selected=true]').waitFor();
 assert.equal(await stock.locator('#watchlist [data-symbol]').count(),2);
 assert.equal(await stock.locator('#watchlist [data-remove]').count(),0);
 await stock.locator('[data-symbol=AMD]').click();
 await stock.locator('#quotePrice').filter({hasText:'200.00'}).waitFor();
 assert.equal(await stock.locator('.position-heading .decision-tag').innerText(),reviewVerdict);
 assert.match(await stock.locator('#positionDecision').innerText(),/持仓 2.5 股/);
 assert.match(await stock.locator('#positionDecision').innerText(),/\+\$250.00/);
 assert.equal(await page.locator('#ws-symbol').inputValue(),'AMD');
 await stock.locator('#positionEvidence summary').click();
 assert.equal(await stock.locator('#positionEvidence a').first().getAttribute('href'),'https://example.com/quotes/AMD');
 assert.match(await stock.locator('#positionEvidence').innerText(),/MA20/);
 await stock.locator('#positionEvidence summary').click();
 await stock.locator('#watchTab').click();
 assert.equal(await stock.locator('[data-symbol=QQQ]').count(),1);
 await stock.locator('#holdingsTab').click();
 // Older static snapshots cannot remove custom-symbol API evidence.
 const child=page.frames().find(f=>f.url().includes('/stock-alert/'));
 await child.evaluate(()=>dispatchEvent(new CustomEvent('workspace-investment-data',{detail:{market:{symbols:{AMD:{symbol:'AMD',price:1,lastTradeAt:'2000-01-01'}}}}})));
 assert.equal(await stock.locator('#quotePrice').innerText(),'200.00');
 await page.screenshot({path:'/tmp/pt-holdings-market-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 assert.ok(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await stock.locator('.options-card summary').scrollIntoViewIfNeeded();
 assert.ok(await stock.locator('.options-card').evaluate(el=>el.getBoundingClientRect().height<120));
 await stock.locator('.options-card summary').click();
 await stock.locator('#optionsBody').waitFor();
 await stock.locator('.options-card summary').click();
 await stock.locator('#holdingsTab').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/pt-holdings-market-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await stock.locator('#manageHoldings').click();
 await importCSV('Symbol,Quantity,Cost\nAAPL,7,90',true);
 await page.locator('#tab-market').click();
 await stock.locator('#holdingsTab[aria-selected=true]').waitFor();
 assert.equal(await stock.locator('#watchlist [data-symbol]').count(),1);
 assert.equal(await stock.locator('#quoteSymbol').innerText(),'AAPL');
 assert.match(await stock.locator('#positionDecision').innerText(),/持仓 7 股/);
 assert.match(await stock.locator('#positionDecision').innerText(),/均价 \$90.00/);
 await stock.locator('[data-investment-tab=audit]').click();
 await page.locator('#tab-audit[aria-selected=true]').waitFor();
 await page.locator('#tab-market').click();
 // Cached parent data is replayed after reloading the lazily created child.
 await child.goto(child.url());
 await stock.locator('#quotePrice').filter({hasText:'150.00'}).waitFor();
 // Missing/stale data never creates an actionable conclusion.
 await child.evaluate(()=>{const key='ptu.decision.holdings';const hs=JSON.parse(localStorage.getItem(key));hs.push({symbol:'MISSING',quantity:1,cost:null});localStorage.setItem(key,JSON.stringify(hs));dispatchEvent(new CustomEvent('workspace-records',{detail:{key:'holdings'}}))});
 await stock.locator('[data-symbol=MISSING]').click();
 assert.match(await stock.locator('#positionDecision').innerText(),/数据不足/);
 assert.equal(await stock.locator('.position-ranges').count(),0);
 assert.ok(calls.includes('AMD'));
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('Holdings market passed: CSV import/replacement, preserved watchlist, custom-symbol quote + matching verdict, evidence, replay, empty/missing data and mobile layout');
})().catch(e=>{console.error(e);process.exit(1)});
