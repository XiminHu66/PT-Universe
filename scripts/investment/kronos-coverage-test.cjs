const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-23T15:55:00Z'));
    await context.addInitScript(() => {
      if (localStorage.getItem('kronos-fixture')) return;
      localStorage.setItem('kronos-fixture', '1');
      localStorage.setItem('ptu.decision.holdings', JSON.stringify([{symbol:'TSLA',quantity:3,cost:100}]));
      localStorage.setItem('stock_alert_watchlist_v1', JSON.stringify(['TSLA','MSFT','BTC-USD'].map(symbol=>({symbol,display:symbol,name:symbol}))));
    });
    const submitted = [];
    await context.route('**/pt-analytics.js', route => route.fulfill({body:''}));
    await context.route('https://pt-universe-api.*/**', route => {
      const url = new URL(route.request().url()), symbol = url.searchParams.get('symbol');
      const reply = json => route.fulfill({json,headers:{'access-control-allow-origin':'*'}});
      if (url.pathname !== '/api/kronos') return reply({});
      if (route.request().method() === 'POST') submitted.push(symbol);
      assert.equal([...url.searchParams.keys()].join(','), 'symbol');
      const calendar = symbol === 'BTC-USD' ? '24/7' : 'XNYS';
      return reply({state:'queued',session:'2026-11-20',calendar,queuePosition:submitted.indexOf(symbol)+1});
    });
    await page.goto('http://127.0.0.1:8765/apps/investment-desk/?symbol=TSLA');
    await page.locator('#kronosStatus').filter({hasText:'VPS 队列'}).waitFor();
    await page.waitForFunction(() => document.querySelector('#kronosRun').disabled);
    await page.locator('#watchTab').click();
    await page.locator('#symbolInput').fill('META');
    await page.locator('#addSymbolForm button').click();
    await page.locator('#quoteSymbol').filter({hasText:'META'}).waitFor();
    await page.locator('#kronosStatus').filter({hasText:'VPS 队列'}).waitFor();
    assert.deepEqual(submitted.slice().sort(), ['BTC-USD','META','MSFT','TSLA']);
    await page.locator('[data-symbol=BTC-USD]').click();
    assert.equal(await page.locator('#kronos-title').innerText(),'Kronos · 10 天');
    console.log('PASS: existing holdings and watchlist, duplicate symbol, and a newly added ticker automatically enter the queue');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
