const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-11-23T15:55:00Z')});
    await context.addInitScript(() => {
      if (localStorage.getItem('kronos-fixture')) return;
      localStorage.setItem('kronos-fixture', '1');
      localStorage.setItem('ptu.decision.holdings', JSON.stringify([{symbol:'TSLA',quantity:3,cost:100}]));
      localStorage.setItem('stock_alert_watchlist_v1', JSON.stringify(['TSLA','MSFT','BTC-USD'].map(symbol=>({symbol,display:symbol,name:symbol}))));
    });
    const submitted = [];
    const ready = new Set();
    await context.route('**/pt-analytics.js', route => route.fulfill({body:''}));
    await context.route('https://pt-universe-api.*/**', route => {
      const url = new URL(route.request().url()), symbol = url.searchParams.get('symbol');
      const reply = json => route.fulfill({json,headers:{'access-control-allow-origin':'*'}});
      if (url.pathname !== '/api/kronos') return reply({});
      if (route.request().method() === 'POST') submitted.push(symbol);
      assert.equal([...url.searchParams.keys()].join(','), 'symbol');
      const calendar = symbol === 'BTC-USD' ? '24/7' : 'XNYS';
      const session='2026-11-20';
      if (ready.has(symbol)) return reply({state:'fresh',session,calendar,data:{
        symbol,asOf:session,calendar,reference:200,endMedian:206,endLow:192,endHigh:215,up:3,down:1,
        paths:[205,207,192,215].map(end=>Array(10).fill(end)),
        dates:['2026-11-23','2026-11-24','2026-11-25','2026-11-27','2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-07']
      }});
      return submitted.includes(symbol)
        ? reply({state:'queued',session,calendar,queuePosition:submitted.indexOf(symbol)+1})
        : reply({state:'empty',session,calendar});
    });
    const url='http://127.0.0.1:8765/apps/investment-desk/?symbol=TSLA';
    await page.goto(url);
    await page.locator('#kronosStatus').filter({hasText:'暂无模拟'}).waitFor();
    assert.equal(submitted.length,0);
    await page.clock.fastForward(5*60000+30000);
    const status=page.locator('#kronosBatchStatus');
    await status.filter({hasText:'0/3 · 排队中'}).waitFor();
    assert.deepEqual(submitted.slice().sort(),['BTC-USD','MSFT','TSLA']);
    for (const symbol of submitted) ready.add(symbol);
    await page.clock.fastForward(31000);
    await status.filter({hasText:'3/3'}).waitFor();
    await page.reload();
    await status.filter({hasText:'3/3'}).waitFor();
    assert.equal(submitted.length,3);
    await page.evaluate(()=>new Promise(resolve=>{
      navigator.locks.request('ptu-investment-refresh',()=>new Promise(release=>{
        window.releaseQuoteLock=release;
        resolve();
      }));
    }));
    const manual = ['BTC-USD','MSFT','TSLA'].map(ticker=>page.waitForRequest(request=>{
      const url = new URL(request.url());
      return request.method()==='POST' && url.pathname==='/api/kronos' && url.searchParams.get('symbol')===ticker;
    }));
    await page.locator('#refreshAllButton:not([disabled])').click();
    await Promise.all(manual);
    await status.filter({hasText:'3/3'}).waitFor();
    assert.deepEqual(submitted.slice(3).sort(),['BTC-USD','MSFT','TSLA']);
    await page.evaluate(()=>window.releaseQuoteLock());
    await page.waitForFunction(()=>!document.querySelector('#refreshAllButton').disabled);
    await page.locator('#watchTab').click();
    await page.locator('#symbolInput').fill('META');
    await page.locator('#addSymbolForm button').click();
    await status.filter({hasText:'3/4 · 排队中'}).waitFor();
    assert.equal(submitted.at(-1),'META');
    await page.locator('[data-symbol=BTC-USD]').click();
    assert.equal(await page.locator('#kronos-title').innerText(),'Kronos · 10 天');
    assert.deepEqual(errors,[]);
    console.log('PASS: 08:00 full submission, queue progress, reload deduplication, one-click refresh and new ticker coverage');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
