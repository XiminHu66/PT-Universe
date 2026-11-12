const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1366,height:768}});
    const page = await context.newPage();
    await page.clock.install({time:new Date('2026-11-23T15:59:10Z')});
    await context.addInitScript(() => {
      if (localStorage.getItem('batch-fixture')) return;
      localStorage.setItem('batch-fixture','1');
      localStorage.setItem('ptu.decision.holdings', JSON.stringify([{symbol:'AMD',quantity:4,cost:100}]));
      localStorage.setItem('stock_alert_watchlist_v1', JSON.stringify(['AMD','BATCH','TEST'].map(symbol=>({symbol,display:symbol,name:symbol}))));
    });
    const quoteCalls = [], details = [];
    let fail = false;
    const quote = symbol => ({symbol,currency:'USD',price:123,lastTradeAt:'2026-11-23T15:59:00Z',history:[{d:'2026-11-20',o:120,h:124,l:119,c:120}]});
    await context.route('**/pt-analytics.js', route => route.fulfill({body:''}));
    await context.route('https://pt-universe-api.*/**', route => {
      const url = new URL(route.request().url()), symbol = url.searchParams.get('symbol');
      const reply = (json, status=200) => route.fulfill({status,json,headers:{'access-control-allow-origin':'*'}});
      if (url.pathname === '/api/investment/quote') {
        quoteCalls.push(symbol);
        assert.equal([...url.searchParams.keys()].join(','), 'symbol');
        return fail && symbol === 'BATCH' ? reply({error:'Unavailable'},502) : reply({quote:quote(symbol)});
      }
      if (url.pathname === '/api/on-demand/stock') {
        details.push(symbol);
        return fail && symbol === 'BATCH' ? reply({error:'Unavailable'},502)
          : reply({state:'fresh',data:{...quote(symbol),fetchedAt:'2026-11-23T16:00:00Z',news:[],options:null}});
      }
      return reply({});
    });
    await page.goto('http://127.0.0.1:8765/apps/investment-desk/?symbol=AMD');
    await page.locator('#quotePrice').filter({hasText:'123.00'}).waitFor();
    assert.deepEqual(quoteCalls, []);
    await page.clock.fastForward(65000);
    await page.locator('#batchRefreshStatus').filter({hasText:'报价 3/3 · 新闻与期权 3/3'}).waitFor();
    assert.deepEqual(quoteCalls.sort(), ['AMD','BATCH','TEST']);
    assert.ok(details.includes('BATCH') && details.includes('TEST'));
    await page.locator('#watchTab').click();
    await page.locator('[data-symbol=BATCH]').filter({hasText:'$123.00'}).waitFor();
    await page.reload();
    await page.locator('#watchTab').click();
    await page.locator('[data-symbol=BATCH]').filter({hasText:'$123.00'}).waitFor();
    await page.clock.fastForward(61000);
    assert.equal(quoteCalls.length, 3, 'one automatic batch per trading day, including reload');
    fail = true;
    await page.locator('#refreshAllButton').click();
    await page.locator('#batchRefreshStatus').filter({hasText:'报价 2/3 · 新闻与期权 2/3 · 1 个标的有数据未更新'}).waitFor();
    assert.equal(quoteCalls.length, 6);
    assert.match(await page.locator('[data-symbol=BATCH]').innerText(), /123.00/);
    console.log('Investment batch passed: fixed-time trigger, deduplicated symbols, off-selection updates, reload persistence, manual refresh, failed sources keep old data');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
