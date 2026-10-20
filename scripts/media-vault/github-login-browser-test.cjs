// Fully intercepted browser and real local SQLite. Never creates a live app,
// issue, grant or download; GitHub pages below are explicit local fixtures.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=process.cwd(),site='https://ximinhu66.github.io',worker='https://pt-media-hybrid.summer07-nanjolno.workers.dev',child=spawn('python3',[path.join(root,'workers/media-vault-hybrid/test-sqlite.py')],{stdio:['pipe','pipe','inherit']}),pending=new Map();let serial=0;
 const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.results);});
 const sql=(ops,batch=false)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,ops,batch})+'\n');});
 function prepare(query,args=[]){return {sql:query,args,bind(...args){return prepare(query,args);},async run(){return (await sql([this]))[0];},async first(){return (await sql([this]))[0].results[0]||null;},async all(){return (await sql([this]))[0];}};}
 const DB={prepare,batch:ops=>sql(ops,true)};
 const {githubLoginRoute,loginManifest}=await import(pathToFileURL(path.join(root,'workers/media-vault-hybrid/src/github-login.js')).href),{integratedRoute}=await import(pathToFileURL(path.join(root,'workers/media-vault-hybrid/src/integrated.js')).href),{handle}=await import(pathToFileURL(path.join(root,'workers/media-vault-hybrid/src/index.js')).href);
 const env={DB,ENABLE_APP_ACCESS:'true',ENABLE_APP_SUBMISSION:'true',ENABLE_DIRECT_STREAM:'true',MEDIA_APP_TEST_MODE:'personal',MEDIA_APP_ACCOUNT_ID:'media-vault-personal',MEDIA_GITHUB_LOGIN:'true',MEDIA_AGENT_TOKEN:'a'.repeat(64),MEDIA_OWNER_TOKEN:'o'.repeat(64)};
 for(const statement of (await fs.readFile(path.join(root,'workers/media-vault-hybrid/oauth-schema.sql'),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(statement).run();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}),context=await browser.newContext(),page=await context.newPage(),errors=[],observed=[];let exchanges=0,bootstraps=0,tokenCalls=0,cutOpener=false;
 const fixtureGitHub=async(url,options)=>{
  if(url.includes('/app-manifests/')){bootstraps++;return Response.json({owner:{id:36136585,type:'User'},client_id:'Iv1.'+'b'.repeat(16),client_secret:'s'.repeat(40),permissions:{},events:[],pem:'unused-fixture-pem',webhook_secret:'unused-fixture-webhook'},{status:201});}
  if(url==='https://github.com/login/oauth/access_token'){tokenCalls++;assert.ok(new URLSearchParams(options.body).get('code_verifier'));return Response.json({access_token:'ghu_'+'x'.repeat(40),scope:'',token_type:'bearer'});}
  assert.equal(url,'https://api.github.com/user');return Response.json({id:36136585,type:'User',login:'XiminHu66'});
 };
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),headers=await req.allHeaders();observed.push(u.origin+u.pathname);
  if(u.origin===site){try{const clean=u.pathname.startsWith('/PT-Universe/')?u.pathname.slice('/PT-Universe'.length):u.pathname,name=path.resolve(root,'.'+clean+(clean.endsWith('/')?'index.html':''));assert.ok(name.startsWith(root+'/'));return route.fulfill({body:await fs.readFile(name),contentType:({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(name)]||'application/octet-stream'});}catch{return route.fulfill({status:404});}}
  if(u.origin===worker){
   assert.ok(!u.pathname.includes('/app-auth/pair')&&!u.pathname.includes('/app-auth/approve'),'no legacy or issue approval');
   if(u.pathname==='/media-vault-login/setup/start')assert.equal(headers.origin,worker,'native private setup form must retain a verifiable Origin');
   const request=new Request(req.url(),{method:req.method(),headers,...(['GET','HEAD'].includes(req.method())?{}:{body:req.postData()||''})});
   const exchange=async(r,e)=>{exchanges++;return integratedRoute(r,e);};
   let response=await githubLoginRoute(request,env,{exchange,fetch:fixtureGitHub});if(!response)response=await handle(request,env);
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  }
  if(u.origin==='https://github.com'&&u.pathname==='/settings/apps/new'){
   const manifest=JSON.parse(new URLSearchParams(req.postData()).get('manifest'));assert.equal(manifest.public,false);assert.deepEqual(manifest.default_permissions,{});assert.deepEqual(manifest.default_events,[]);assert.equal(manifest.hook_attributes.active,false);assert.ok(!req.url().includes('channel'));assert.ok(!JSON.stringify(manifest).includes('client_secret'));
   const callback=worker+'/media-vault-login/setup/callback?'+new URLSearchParams({code:'c'.repeat(40),state:u.searchParams.get('state')});
   return route.fulfill({headers:{'Content-Type':'text/html','Cross-Origin-Opener-Policy':'same-origin'},body:'<!doctype html><title>Local GitHub private app fixture</title><h1>Local fixture: create private login app</h1><p>No repository permissions. No real app is created.</p><a href="'+callback.replaceAll('&','&amp;')+'">Create GitHub App</a>'});
  }
  if(u.origin==='https://github.com'&&u.pathname==='/login/oauth/authorize'){
   assert.equal(u.searchParams.get('scope'),null);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(!req.url().includes('channel'));
   const callback=worker+'/media-vault-login/callback?'+new URLSearchParams({code:'c'.repeat(40),state:u.searchParams.get('state')});
   return route.fulfill({headers:{'Content-Type':'text/html','Cross-Origin-Opener-Policy':'same-origin'},body:'<!doctype html><title>Local GitHub identity fixture</title><h1>Local fixture: sign in as XiminHu66</h1><p>Public identity only; no repository permissions.</p><a href="'+callback.replaceAll('&','&amp;')+'">Authorize Media Vault</a>'});
  }
  return route.fulfill({status:503,json:{error:'All external network disabled in fixture'}});
 });
 try{
  const mainURL=site+'/PT-Universe/apps/media-vault/#video';await page.goto(mainURL);await page.fill('#videoURL','https://example.org/owned.mp4');await page.click('#videoForm button');await page.locator('#vpsConnection[open]').waitFor();
  const waiting=context.waitForEvent('page');await page.click('#vpsConnectNow');const popup=await waiting;await popup.getByRole('link',{name:'Create GitHub App',exact:true}).waitFor();assert.equal(exchanges,0);
  await fs.mkdir('test-results/media-vault',{recursive:true});await popup.screenshot({path:'test-results/media-vault/private-login-first-setup.png'});
  cutOpener=await popup.evaluate(()=>window.opener===null);assert.equal(cutOpener,true,'real COOP fixture must sever opener');await popup.getByRole('link',{name:'Create GitHub App',exact:true}).click({noWaitAfter:true});
  await popup.getByRole('link',{name:'Authorize Media Vault',exact:true}).waitFor();await popup.getByRole('link',{name:'Authorize Media Vault',exact:true}).click({noWaitAfter:true});await page.locator('#queue[open]').waitFor({timeout:20000});assert.equal(page.url(),mainURL);assert.equal(exchanges,1);assert.equal(bootstraps,1);assert.equal(tokenCalls,1);
  assert.match(await page.locator('#vpsConnectStatus').textContent(),/已连接/);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_jobs').first()).n,1);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_login_connections WHERE cipher IS NOT NULL').first()).n,0,'main acknowledgement deletes encrypted handoff');
  const cookies=await context.cookies(worker),parent=cookies.find(c=>c.name==='__Host-mv-account');assert.ok(parent.httpOnly&&parent.secure&&parent.sameSite==='Strict');const grantCount=(await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n;
  await page.reload();await page.waitForFunction(()=>document.querySelector('#vpsConnectStatus').textContent.includes('已连接'));assert.equal(tokenCalls,1);assert.equal((await DB.prepare('SELECT COUNT(*) n FROM mv_hybrid_app_sessions').first()).n,grantCount,'remembered reload performs no new login or grant');
  await page.click('#vpsConnectStatus');await page.locator('#vpsDevices button').waitFor();assert.match(await page.locator('#vpsDevices').textContent(),/当前设备/);await page.screenshot({path:'test-results/media-vault/private-login-device-management.png'});await page.click('#vpsForget');await page.waitForFunction(()=>document.querySelector('#vpsConnectStatus').textContent==='连接 VPS');assert.equal((await DB.prepare("SELECT COUNT(*) n FROM mv_hybrid_app_sessions WHERE status='approved'").first()).n,0,'explicit logout revokes parent and child');
  await page.click('#vpsConnectCancel');await page.click('#vpsConnectStatus');const again=context.waitForEvent('page');await page.click('#vpsConnectNow');const login=await again;await login.getByRole('link',{name:'Authorize Media Vault',exact:true}).waitFor();assert.equal(bootstraps,1,'later login never recreates app');await login.getByRole('link',{name:'Authorize Media Vault',exact:true}).click({noWaitAfter:true});await page.waitForFunction(()=>document.querySelector('#vpsConnectStatus').textContent.includes('已连接'));assert.equal(tokenCalls,2);assert.equal(exchanges,2);
  assert.ok(!observed.some(url=>url.includes('/issues/')));assert.deepEqual(errors,[]);console.log('PASS actual cross-origin Chromium + SQLite private GitHub flow: prefilled private bootstrap, zero repository permissions, PKCE callback, Strict HttpOnly cookie, COOP-severed opener, automatic server handoff/download continuation, acknowledgement, remembered reload, device list and full logout/relogin; all GitHub and source traffic intercepted, no live app or grant');
 }catch(error){for(const p of context.pages()){console.error('FIXTURE PAGE',new URL(p.url()).origin+new URL(p.url()).pathname);console.error((await p.locator('body').innerText().catch(()=>'' )).slice(0,1800));}throw error;}finally{await browser.close();child.stdin.end();lines.close();}
})().catch(e=>{console.error(e);process.exit(1);});
