// Actual Windows browser/filesystem compatibility. Every source is a localhost
// fixture. This never visits a deployed Worker or proves the user's own device.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 assert.equal(process.platform,'win32','This acceptance requires an actual Windows runner');
 const root=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'../..');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 const buffers=new Map();for(const f of manifest.files)buffers.set(f.id,await fs.readFile(path.join(root,f.name)));
 const {appCookie}=await import(pathToFileURL(path.join(repo,'workers/media-vault-hybrid/src/account-auth.js')).href);
 const cookie=appCookie('f'.repeat(64),7*24*3600),tickets=new Map(),requests=[];let paired=0,downloaded=0;
 const server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url,'http://localhost');
   if(u.pathname==='/pair'){paired++;res.writeHead(302,{'Set-Cookie':cookie,Location:'/'});res.end();return;}
   if(u.pathname==='/native-download.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(repo,'apps/media-vault/native-download.js')));return;}
   if(!(req.headers.cookie||'').includes('__Host-mv-account='+'f'.repeat(64))){res.writeHead(403);res.end('fixture cookie missing');return;}
   if(u.pathname==='/download-ticket'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body),file=manifest.files.find(f=>f.id===data.id);assert.ok(file);
    const ticket=crypto.randomBytes(32).toString('hex');tickets.set(ticket,file);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ticket}));return;
   }
   if(u.pathname==='/download'){
    const ticket=u.searchParams.get('ticket'),file=tickets.get(ticket);assert.ok(file);tickets.delete(ticket);downloaded++;
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'Cache-Control':'no-store'});
    const bytes=buffers.get(file.id);for(let offset=0;offset<bytes.length;offset+=1024){res.write(bytes.subarray(offset,offset+1024));await new Promise(r=>setImmediate(r));}res.end();return;
   }
   assert.equal(u.pathname,'/');res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end('<meta charset="utf-8"><div id="controls"></div><p id="status"></p><script type="module">import {createNativeSaver} from "/native-download.js";const saver=createNativeSaver({baseURL:location.origin+"/",onState:s=>document.querySelector("#status").textContent=s.phase});const files='+JSON.stringify(manifest.files)+';for(const file of files){const b=document.createElement("button");b.textContent=file.name;b.dataset.id=file.id;b.onclick=()=>saver.save({...file,size:file.bytes,path:file.name});document.querySelector("#controls").append(b);}</script>');
  }catch(e){res.writeHead(500);res.end('fixture error');}
 });
 await new Promise(resolve=>server.listen(0,'localhost',resolve));const base='http://localhost:'+server.address().port;
 const profile=path.join(root,'browser-profile');let context;
 try{
  context=await chromium.launchPersistentContext(profile,{headless:true,acceptDownloads:true});
  let page=context.pages()[0];await page.goto(base+'/pair');await page.locator('button').first().waitFor();await context.close();context=null;
  context=await chromium.launchPersistentContext(profile,{headless:true,acceptDownloads:true});page=context.pages()[0];
  page.on('request',r=>requests.push({url:r.url(),type:r.resourceType()}));
  const response=await page.goto(base+'/');assert.equal(response.status(),200,'Actual persistent Secure/HttpOnly cookie must survive browser process restart');assert.equal(paired,1);
  const cookies=await context.cookies(base);const account=cookies.find(c=>c.name==='__Host-mv-account');assert.ok(account?.httpOnly&&account.secure&&account.expires>Date.now()/1000+6*24*3600);
  const saved=[];await fs.mkdir(path.join(root,'本机保存'),{recursive:true});
  for(const file of manifest.files){
   const waiting=page.waitForEvent('download');await page.locator('button[data-id="'+file.id+'"]').click();const download=await waiting;
   assert.equal(download.suggestedFilename(),file.name);const target=path.join(root,'本机保存',file.name);await download.saveAs(target);assert.equal(await download.failure(),null);
   const bytes=await fs.readFile(target);assert.equal(bytes.length,file.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);saved.push(target);
  }
  assert.equal(downloaded,2);assert.equal(tickets.size,0);assert.ok(!requests.some(r=>r.type==='fetch'&&new URL(r.url).pathname!=='/download-ticket'),'No media body fetched into frontend JS');
  const offline=path.join(root,'verify-local.html');const built=spawnSync(process.execPath,[path.join(repo,'scripts/media-vault/build-local-verifier.mjs'),path.join(root,'manifest.json'),offline],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
  const verifier=await context.newPage();verifier.on('pageerror',e=>console.error('OFFLINE_PAGE_ERROR',e.message));let unexpectedNetwork=0;await verifier.route(/^https?:/,route=>{unexpectedNetwork++;return route.abort();});
  await verifier.goto(pathToFileURL(offline).href);await verifier.setInputFiles('#files',saved);await verifier.click('#verify');await verifier.locator('#status.ok,#status.bad').waitFor();assert.equal(await verifier.locator('#status').getAttribute('class'),'ok',await verifier.locator('#status').innerText());
  const report=JSON.parse(await verifier.locator('#result').innerText());assert.equal(report.windows,true);assert.equal(report.local_files_match_expected,true);assert.equal(report.files.length,2);assert.equal(unexpectedNetwork,0);
  const reportDownload=verifier.waitForEvent('download');await verifier.click('#report');const d=await reportDownload;await d.saveAs(path.join(root,'report.json'));assert.equal(JSON.parse(await fs.readFile(path.join(root,'report.json'),'utf8')).windows,true);
  const bad=path.join(root,'tampered.epub');await fs.writeFile(bad,Buffer.from('wrong'));await verifier.setInputFiles('#files',[bad,saved[1]]);await verifier.click('#verify');await verifier.locator('#status.bad').waitFor();assert.equal(await verifier.locator('#report').isDisabled(),true);
  console.log('PASS actual Windows Chromium native disk saves: Unicode EPUB/CBZ names, exact bytes/SHA-256, one-use tickets, persisted Secure/HttpOnly seven-day cookie across real browser restart; offline XML/images/report and tamper rejection. Local fixtures only; not the user device or elapsed seven-day acceptance.');
 }finally{if(context)await context.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
