const {chromium}=require(process.env.PT_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const order=['home','todo','board','tsugi','meal','music','focus','countdown','tools','settings'];
const removed=['investment','muse','traffic'];
const base=process.env.PT_TEST_URL||'http://127.0.0.1:8765/';
let browser;
async function navigation(page){return page.locator('.sidebar .navbtn[data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view))}
(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.PT_CHROMIUM?{executablePath:process.env.PT_CHROMIUM,args:['--no-sandbox','--no-proxy-server']}: {})});
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/pt-analytics.js',r=>r.fulfill({body:''}));
  await ctx.route('https://pt-universe-api.*/**',r=>r.fulfill({json:{reports:[]},headers:{'access-control-allow-origin':'*'}}));
  // Existing devices migrate once, retaining custom names and stored route data.
  await ctx.addInitScript(()=>{
    if(localStorage.getItem('nexus-nav-qa-seeded'))return;
    localStorage.setItem('dn_navConfig',JSON.stringify([
      {view:'home',icon:'⌂',label:'我的今日'},
      {view:'traffic',icon:'🚗',label:'出行'},
      {view:'countdown',icon:'⏳',label:'倒数'},
      {view:'investment',icon:'↗',label:'投资'},
      {view:'muse',icon:'◫',label:'Muse 日报'},
      {view:'todo',icon:'✓',label:'我的待办'}
    ]));
    localStorage.setItem('dn_routes',JSON.stringify([{name:'保存的路线'}]));
    localStorage.setItem('nexus-nav-qa-seeded','1');
  });
  await page.goto(base+'apps/daily-nexus/',{waitUntil:'domcontentloaded'});
  assert.deepEqual(await navigation(page),order);
  assert.equal(await page.locator('[data-view=todo] span').innerText(),'我的待办');
  for(const name of removed){
    assert.equal(await page.locator('[data-view='+name+'],#view-'+name).count(),0);
    assert.equal(await page.locator('#'+name+'Frame').count(),0);
  }
  assert.match(await page.evaluate(()=>localStorage.getItem('dn_routes')),/保存的路线/);
  await page.locator('[data-view=settings]').click();
  assert.deepEqual(await page.locator('[data-nav-row]').evaluateAll(nodes=>nodes.map(n=>n.dataset.navRow)),order);
  await page.locator('[data-nav-row=todo] [data-nav-up]').click();
  await page.locator('#saveNavConfig').click();
  const custom=['todo','home',...order.slice(2)];
  assert.deepEqual(await navigation(page),custom);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await navigation(page),custom,'Manual ordering must survive reload');
  for(const name of removed){
    await page.goto(base+'apps/daily-nexus/?tab='+name,{waitUntil:'domcontentloaded'});
    await page.locator('#view-home.active').waitFor({state:'visible'});
    assert.equal(new URL(page.url()).searchParams.get('tab'),'home');
  }
  await page.locator('[data-view=settings]').click();
  await page.locator('#resetNavConfig').click();
  assert.deepEqual(await navigation(page),order);
  await page.locator('[data-view=todo]').click();
  const todo=page.frameLocator('#todoFrame');
  await todo.locator('#add-project').click();
  await todo.locator('.node-name').fill('导航测试');
  await page.locator('[data-view=home]').click();
  await page.locator('[data-view=todo]').click();
  assert.equal(await todo.locator('.node-name').inputValue(),'导航测试');
  await page.locator('#quickTheme').click();
  assert.equal(await todo.locator('html').getAttribute('data-theme'),await page.locator('html').getAttribute('data-theme'));
  for(const size of [{width:768,height:1024},{width:390,height:844}]){
    await page.setViewportSize(size);
    assert.deepEqual(await navigation(page),order);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await page.screenshot({path:'/tmp/pt-nexus-nav-'+size.width+'.png'});
  }
  assert.deepEqual(errors,[]);
  await ctx.close();
  const fresh=await browser.newPage();
  await fresh.goto(base+'apps/daily-nexus/?tab=countdown',{waitUntil:'domcontentloaded'});
  await fresh.locator('#view-countdown.active').waitFor({state:'visible'});
  assert.deepEqual(await navigation(fresh),order);
  console.log('Nexus navigation passed: removed views, one-time migration, custom labels, manual ordering persistence, reset, deep-link fallback, Todo/theme and responsive sizing');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
