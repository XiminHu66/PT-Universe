/* Production security-state audit. No user data is inspected or collected. */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const [name,url] of [
      ['root','https://ximinhu66.github.io/PT-Universe/'],
      ['daily-nexus','https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=home'],
      ['daily-nexus-tools','https://ximinhu66.github.io/PT-Universe/apps/daily-nexus/?view=tools']
    ]) {
      const context = await browser.newContext({serviceWorkers:'block'});
      const page = await context.newPage();
      const states=[], insecure=[], logs=[], bad=[], errors=[];
      const cdp=await context.newCDPSession(page);
      await cdp.send('Security.enable');
      cdp.on('Security.visibleSecurityStateChanged',e=>states.push({state:e.visibleSecurityState?.securityState,explanations:(e.visibleSecurityState?.securityStateIssueIds||[])}));
      cdp.on('Security.securityStateChanged',e=>states.push({state:e.securityState,explanations:e.explanations?.map(x=>x.summary)}));
      page.on('console',msg=>{if(/mixed content|insecure/i.test(msg.text()))logs.push(msg.text().slice(0,350))});
      page.on('request',req=>{if(req.url().startsWith('http://'))insecure.push({kind:req.resourceType(),url:req.url().slice(0,160)})});
      page.on('requestfailed',req=>{if(/http:\/\//i.test(req.url())||/mixed.content/i.test(req.failure()?.errorText||''))bad.push({url:req.url().slice(0,160),error:req.failure()?.errorText})});
      page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
      try {
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
        await page.waitForTimeout(7500);
        console.log('SECURITY_AUDIT '+JSON.stringify({name,status:response?.status(),page:page.url(),states:states.slice(-8),insecure:insecure.slice(0,12),insecureCount:insecure.length,bad:bad.slice(0,10),messages:logs.slice(0,12),errors:errors.slice(0,10)}));
      }catch(e){console.log('SECURITY_AUDIT '+JSON.stringify({name,error:e.message,states:states.slice(-8)}))}
      await context.close();
    }
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
