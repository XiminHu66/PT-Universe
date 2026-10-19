// Entire browser/network is a local fixture. No live GitHub issue or grant.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const root=process.cwd(),site='https://ximinhu66.github.io',worker='https://pt-media-hybrid.summer07-nanjolno.workers.dev',publicId='a'.repeat(24),parent='f'.repeat(64),token='e'.repeat(64),jobId='b'.repeat(24),expires=Date.now()+30*86400000;
 const {integratedRoute}=await import(pathToFileURL(path.join(root,'workers/media-vault-hybrid/src/integrated.js')).href);
 const {approvalBody,APPROVAL_PREFIX}=await import(pathToFileURL(path.join(root,'apps/media-vault/device-approval.js')).href);
 const {validateSelfApproval}=await import(pathToFileURL(path.join(root,'workers/media-vault-hybrid/self-approve-device.mjs')).href);
 const env={ENABLE_APP_ACCESS:'true',MEDIA_APP_TEST_MODE:'personal',MEDIA_APP_ACCOUNT_ID:'media-vault-personal'};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}),context=await browser.newContext(),page=await context.newPage(),errors=[],submitted=[];let approved=false,paired=0,exchanged=0;
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 const cors={'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 const session={status:'approved',session_id:'c'.repeat(24),scope:'personal-vps-downloads',expires_at:expires,jobs_remaining:200,tickets_remaining:100,can_submit:true,can_download:true};
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),headers=await req.allHeaders();
  if(u.origin===site){try{const clean=u.pathname.startsWith('/PT-Universe/')?u.pathname.slice('/PT-Universe'.length):u.pathname;const name=path.resolve(root,'.'+clean+(clean.endsWith('/')?'index.html':''));assert.ok(name.startsWith(root+'/'));return route.fulfill({body:await fs.readFile(name),contentType:({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(name)]||'application/octet-stream'});}catch{return route.fulfill({status:404});}}
  if(u.origin===worker){
   if(u.pathname.startsWith('/media-vault-connect/')){const response=await integratedRoute(new Request(req.url()),env);assert.ok(response);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});}
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
   if(u.pathname==='/app-auth/logout')return route.fulfill({json:{ok:true},headers:{'Set-Cookie':'__Host-mv-account=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}});
   if(u.pathname==='/app-auth/pair'){paired++;return route.fulfill({status:201,json:{status:'pending',session_id:publicId,pair_code:'d'.repeat(32),expires_at:Date.now()+300000},headers:{'Set-Cookie':'__Host-mv-account='+parent+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=604800'}});}
   if(u.pathname==='/app-auth/session'){if(!headers.cookie?.includes(parent))return route.fulfill({status:403,json:{error:'No fixture cookie'}});return route.fulfill({json:approved?{...session,session_id:publicId}:{status:'pending',session_id:publicId,pair_code:'d'.repeat(32),expires_at:Date.now()+300000}});}
   if(u.pathname==='/app-auth/media-vault-connect'){assert.ok(approved);assert.ok(headers.cookie?.includes(parent));assert.equal(req.postDataJSON().remember,true);exchanged++;return route.fulfill({json:{token,session_id:session.session_id,expires_at:expires}});}
   assert.equal(headers.authorization,'Bearer '+token);const json=data=>route.fulfill({headers:cors,json:data});
   if(u.pathname==='/vault-api/session')return json(session);
   if(u.pathname==='/vault-api/jobs'){if(req.method()==='POST'){submitted.push(req.postDataJSON());return route.fulfill({status:202,headers:cors,json:{id:jobId}});}return json({jobs:submitted.map(j=>({id:jobId,kind:j.kind,status:'running',title:'Local fixture download',completed:0,total:100}))});}
   if(u.pathname==='/vault-api/pikpak/accounts')return json({accounts:[]});
   if(u.pathname==='/vault-api/quota')return json({tracking:'active',limit_bytes:100*1024**3,transferred_bytes:0,reserved_bytes:0,remaining_bytes:100*1024**3});
   return route.fulfill({status:404,headers:cors,json:{error:'Unknown fixture operation'}});
  }
  if(u.origin==='https://github.com'&&u.pathname==='/XiminHu66/PT-Universe/issues/new'){
   assert.equal(u.searchParams.get('title'),APPROVAL_PREFIX+publicId);assert.equal(u.searchParams.get('body'),approvalBody(publicId,true));assert.ok(!req.url().includes(parent)&&!req.url().includes(token));
   return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local GitHub confirmation fixture</title><h1>Local fixture: confirm this device</h1><p>No real account or issue is used.</p><button id="submit">Submit new issue</button><p id="status"></p><script>document.querySelector("#submit").onclick=async()=>{const r=await fetch("/fixture-confirm",{method:"POST"});document.querySelector("#status").textContent=r.ok?"Confirmed; return to Media Vault":"Failed";};</script>'});
  }
  if(u.origin==='https://github.com'&&u.pathname==='/fixture-confirm'&&req.method()==='POST'){
   const person={id:36136585,login:'XiminHu66',type:'User'};validateSelfApproval({action:'opened',sender:person,repository:{full_name:'XiminHu66/PT-Universe',owner:person},issue:{number:1,user:person,state:'open',title:APPROVAL_PREFIX+publicId,body:approvalBody(publicId,true),created_at:new Date().toISOString()}},{eventName:'issues',repository:'XiminHu66/PT-Universe',actor:'XiminHu66'});approved=true;return route.fulfill({json:{ok:true}});
  }
  return route.fulfill({status:503,json:{error:'All external network disabled in fixture'}});
 });
 try{
  const mainURL=site+'/PT-Universe/apps/media-vault/#video';await page.goto(mainURL);await page.fill('#videoURL','https://example.org/owned.mp4');await page.click('#videoForm button');await page.locator('#vpsConnection[open]').waitFor();
  const popupWaiting=context.waitForEvent('page');await page.click('#vpsConnectNow');const popup=await popupWaiting;await page.locator('#vpsSelfApprove').waitFor({state:'visible'});assert.equal(submitted.length,0);assert.equal(paired,1);assert.equal(exchanged,0);assert.equal(await page.locator('#vpsConnectNow').isVisible(),false);
  const githubWaiting=context.waitForEvent('page');await page.click('#vpsSelfApprove');const github=await githubWaiting;await github.getByRole('button',{name:'Submit new issue',exact:true}).waitFor();assert.match(await github.title(),/Local/);
  const closed=popup.waitForEvent('close');await github.getByRole('button',{name:'Submit new issue',exact:true}).click();await closed;await page.locator('#queue[open]').waitFor();assert.equal(page.url(),mainURL);assert.equal(submitted.length,1);assert.equal(submitted[0].kind,'video');assert.equal(exchanged,1);assert.match(await page.locator('#vpsConnectStatus').textContent(),/已连接/);assert.equal(await page.locator('#vpsConnection').evaluate(e=>e.open),false);
  const pages=context.pages().length;await page.reload();await page.waitForFunction(()=>document.querySelector('#vpsConnectStatus').textContent.includes('已连接'));assert.equal(context.pages().length,pages);assert.equal(paired,1);assert.equal(exchanged,1,'remembered reload never pairs or approves again');
  assert.deepEqual(errors,[]);console.log('PASS real browser cross-origin self-confirmation fixture: actual Worker popup HTML/modules and Strict HttpOnly cookie; explicit GitHub form confirmation; automatic postMessage, popup close, original download continuation, 30-day remembered reload; zero live issue, grant or source requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
