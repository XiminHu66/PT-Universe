const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),hub='https://pt-vps-tools.h1nano.chatgpt.site';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const token=nonce=>{const iat=Math.floor(Date.now()/1000);return 'fixture.'+Buffer.from(JSON.stringify({iss:hub,sub:'pt-backend-owner',aud:'pt-universe-vps',scope:'vps:read',iat,exp:iat+3600,nonce})).toString('base64url')+'.fixture';};
const sample={sampleAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),stale:false,cpu:{percent:15.2,load:[.22,.41,.45]},memory:{percent:40,usedBytes:5e9,totalBytes:12.5e9},disk:{percent:53.8,freeBytes:21e9,totalBytes:46e9},network:{receivedBytesPerSecond:1843,sentBytesPerSecond:7782},uptimeSeconds:1280000,history:[],services:[{name:'moodist',ok:true}]};
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));}catch{res.statusCode=404;res.end('missing');}});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/apps/daily-nexus/?view=vps`;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1750,height:749}});let grants=0,metrics=0;
 await context.route(/^https:\/\//,async route=>{
  const url=new URL(route.request().url());
  if(url.origin===hub&&url.pathname==='/__pt_vps_connect'){
   assert.deepEqual([...url.searchParams.keys()],['nonce']);const nonce=url.searchParams.get('nonce');assert.match(nonce,/^[a-f0-9]{48}$/);grants++;
   return route.fulfill({status:302,headers:{location:base+'#vps-session='+token(nonce)+'&nonce='+nonce}});
  }
  if(url.pathname==='/api/vps/overview'){assert.match(route.request().headers().authorization,/^Bearer fixture\./);metrics++;return route.fulfill({json:sample});}
  return route.fulfill({json:{}});
 });
 const page=await context.newPage();await page.goto(base);await page.locator('#vpsState[data-state=online]').waitFor();assert.equal(grants,1,'fresh session automatically connects');assert.equal(new URL(page.url()).hash,'','grant removed from URL');assert.ok(metrics>0);
 await page.reload();await page.locator('#vpsState[data-state=online]').waitFor();assert.equal(grants,1,'reload reuses session');
 const sizes=[[1750,749],[1440,900],[1366,768],[1280,720],[390,844]],report=[];
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});
  const geometry=await page.locator('#view-vps').evaluate(el=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const grid=el.querySelector('.workspace-tool-groups');return {monitor:rect(el.querySelector('.vps-monitor-panel')),tools:rect(el.querySelector('.vps-tools-section')),cards:[...grid.querySelectorAll('.vps-tool')].map(rect),grid:{client:grid.clientHeight,scroll:grid.scrollHeight},view:{client:el.clientHeight,scroll:el.scrollHeight},viewport:innerHeight,fonts:{name:parseFloat(getComputedStyle(el.querySelector('.vps-tool-title b')).fontSize),description:parseFloat(getComputedStyle(el.querySelector('.vps-tool p')).fontSize),navigation:parseFloat(getComputedStyle(document.querySelector('.sidebar .navbtn span')).fontSize)},overflow:document.documentElement.scrollWidth-innerWidth};});
  assert.equal(geometry.cards.length,22);assert.ok(geometry.overflow<=2,JSON.stringify({width,geometry}));
  if(width>=1000){assert.ok(geometry.fonts.name>=16&&geometry.fonts.description>=13&&geometry.fonts.navigation>=15,'Readable desktop text must not be shrunk to fit');assert.ok(geometry.monitor.right<geometry.tools.x);assert.ok(geometry.cards.every(c=>c.y>=0&&c.bottom<=height-5),'all tools fit without scrolling '+JSON.stringify({width,height,geometry}));assert.ok(geometry.grid.scroll<=geometry.grid.client+2,JSON.stringify({width,geometry}));assert.ok(geometry.view.scroll<=geometry.view.client+2);}
  else{assert.ok(geometry.monitor.bottom<geometry.tools.y);assert.ok(geometry.cards[0].x<geometry.cards[1].x&&Math.abs(geometry.cards[0].y-geometry.cards[1].y)<2);}
  report.push({width,height,...geometry});
  await page.locator('.vps-heading p').evaluate(e=>e.textContent='自动化布局验证 · 监控数据为隔离测试样本');
  await page.screenshot({path:`/tmp/pt-nexus-vps-${width}x${height}.png`});
 }
 await page.setViewportSize({width:1750,height:749});
 assert.equal(await page.locator('#vpsTools .vps-tool').count(),15);assert.equal(await page.locator('#otherTools .vps-tool').count(),7);assert.equal(await page.locator('[data-tool=karakeep]').count(),1);
 await page.locator('#vpsDisconnect').click();await page.reload();await page.locator('#vpsConnect').waitFor();assert.equal(grants,1,'explicit disconnect remains paused');await page.locator('#vpsConnect').click();await page.locator('#vpsState[data-state=online]').waitFor();assert.equal(grants,2);
 await page.evaluate(()=>{const key='pt-nexus-vps-session-v1',parts=sessionStorage.getItem(key).split('.'),data=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));data.exp=Math.floor(Date.now()/1000)-1;parts[1]=btoa(JSON.stringify(data));sessionStorage.setItem(key,parts.join('.'));});await page.reload();await page.locator('#vpsState[data-state=online]').waitFor();assert.equal(grants,3,'expired sessions renew automatically');
 fs.writeFileSync('/tmp/pt-nexus-vps-report.json',JSON.stringify({grants,metrics,sizes:report},null,2));console.log('PASS VPS: automatic connect, cache reuse, nonce return, URL cleanup, pause/retry, expiry renewal, 22 tools in two visible groups, desktop fit at four sizes and mobile overflow.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
