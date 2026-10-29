const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),api='https://pt-universe-api.summer07-nanjolno.workers.dev';
const http=require('node:http');
const server=http.createServer((req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end()}});
const seed=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const products=seed('apps/3c-scout/data/products.json'),disclosures=seed('apps/investment-desk/data/public-trades.json'),market=seed('apps/stock-alert/data/market.json'),financials=seed('apps/thesis-lab/data/financials.json');
let fail=false;const requests=[],errors=[];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PT_CHROME||undefined,args:['--no-sandbox','--disable-gpu','--no-zygote','--disable-software-rasterizer']});
 try{
  const ctx=await browser.newContext({viewport:{width:1200,height:900}});
  await ctx.route(/^https:\/\//,async route=>{
   const req=route.request(),url=new URL(req.url());
   const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
   if(url.origin===api&&url.pathname.startsWith('/api/on-demand/')){
    requests.push({path:url.pathname,method:req.method(),force:url.searchParams.get('force'),symbol:url.searchParams.get('symbol')});
    if(fail)return route.fulfill({status:502,headers:cors,json:{error:'QA 上游不可用'}});
    const dataset=url.pathname.split('/').at(-1),symbol=url.searchParams.get('symbol');let data;
    if(dataset==='3c')data={...products,generated_at:new Date().toISOString()};
    if(dataset==='disclosures')data={...disclosures,generatedAt:new Date().toISOString()};
    if(dataset==='stock')data={...market.symbols[symbol],price:123.45,fetchedAt:new Date().toISOString()};
    return route.fulfill({headers:cors,json:{state:'fresh',data,updatedAt:new Date().toISOString(),refreshMode:'on-demand'}});
   }
   if(url.pathname==='/api/training/financials'){
    requests.push({path:url.pathname,symbol:url.searchParams.get('symbol'),force:url.searchParams.get('force')});
    const company=financials.companies.find(c=>c.ticker===url.searchParams.get('symbol'));
    return route.fulfill({headers:cors,json:{...company,updatedAt:new Date().toISOString(),live:true,stale:false}});
   }
   return route.fulfill({headers:cors,json:{}});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.PT_TEST_URL||'http://127.0.0.1:'+server.address().port+'/';
  await page.goto(base+'apps/3c-scout/');await page.locator('#refreshStatus').filter({hasText:'按需更新完成'}).waitFor();
  let before=requests.length;await page.locator('#refreshProducts').click();await page.waitForFunction(()=>!document.querySelector('#refreshProducts').disabled);assert.equal(requests.length,before+1);assert.equal(requests.at(-1).force,'1');
  fail=true;await page.locator('#refreshProducts').click();await page.locator('#refreshStatus').filter({hasText:'继续显示上次成功数据'}).waitFor();assert.ok(await page.locator('#productGrid article').count());fail=false;console.log('3C flow passed');
  await page.goto(base+'apps/stock-alert/?standalone=1');await page.waitForFunction(()=>document.querySelector('#updatedAt').textContent.includes('按需更新'));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('stock-demand-data')||'{}').NVDA?.price===123.45);
  before=requests.length;await page.locator('#refreshButton').click();await page.waitForFunction(()=>!document.querySelector('#refreshButton').disabled);assert.equal(requests.length,before+1);assert.equal(requests.at(-1).force,'1');
  await page.clock.install();before=requests.length;await page.clock.runFor(130000);assert.equal(requests.length,before,'idle page must not poll market data');
  await page.goto(base+'apps/investment-desk/?tab=audit');await page.locator('#public-audit [role=status]').filter({hasText:'核对完成'}).waitFor();
  before=requests.filter(r=>r.path.endsWith('/disclosures')).length;await page.locator('#refresh-disclosures').click();await page.waitForFunction(()=>!document.querySelector('#refresh-disclosures').disabled);assert.equal(requests.filter(r=>r.path.endsWith('/disclosures')).length,before+1);
  await page.goto(base+'apps/thesis-lab/?standalone=1');await page.locator('#updated').filter({hasText:'最近核对'}).waitFor();before=requests.length;await page.locator('#refresh').click();await page.locator('#updated').filter({hasText:'最近核对'}).waitFor();assert.ok(requests.length>before);assert.equal(requests.at(-1).force,'1');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);console.log('PASS: on-open and forced refresh, actual result application, upstream failure fallback, disclosure/financial controls and no idle stock polling');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
