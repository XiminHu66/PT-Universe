// Explicit release acceptance: exactly three attempted generations, no POST retry.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev',SITE='https://ximinhu66.github.io/PT-Universe/',id=randomUUID(),token=randomBytes(32).toString('hex');
const headers={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',origin:'https://ximinhu66.github.io','content-type':'application/json'};
const report={at:new Date().toISOString(),attempts:0,reports:[],errors:[]};
const save=()=>writeFileSync('/tmp/check-chain-live.json',JSON.stringify(report,null,2));
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('GET '+r.status);return r;}
async function post(path,body,auth=false){const r=await fetch(API+path,{method:'POST',headers:{...headers,...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(115000)}),d=await r.json();if(!r.ok)throw Error(r.status+' '+(d.error||'request failed'));return d;}
await post('/api/sync/register',{id,token});
const cases=[{query:'streamdeck neo',mode:'product'},{query:'FiiO K11 R2R',mode:'product'},{query:'华为刹车会被踩断',mode:'claim'}];
for(const task of cases){
 const entry={...task};report.reports.push(entry);
 try{
  const search=await (await get(API+'/api/hub/check/search?'+new URLSearchParams({q:task.query,mode:task.mode}))).json();
  entry.search={query:search.search_query,candidates:search.items,providers:search.providers};
  assert.ok(search.items?.length,'No candidates');
  const urls=search.items.filter(s=>s.recommended).map(s=>s.url);assert.ok(urls.length,'No relevant readable defaults');
  entry.request={...task,urls,autoSelect:true};entry.latencyMs=Date.now();
  assert.ok(report.attempts<3);report.attempts++;save();
  const result=await post('/api/check/'+id+'/analyze',entry.request,true);
  entry.latencyMs=Date.now()-entry.latencyMs;entry.result=result;save();
  assert.equal(result.cached,false);assert.equal(result.output.humanVerified,false);assert.ok(result.sources.every(s=>s.paragraphs.length));
  assert.ok(result.output.evidence.length,'No paragraph evidence selected');
  for(const e of result.output.evidence){const s=result.sources.find(s=>s.id===e.sourceId),p=s?.paragraphs.find(p=>p.id===e.paragraphId);assert.equal(e.quote,p?.text);assert.equal(e.text,'来源原文摘录');assert.ok(!/All Rights Reserved|版权所有/.test(e.quote));}
  const material=result.sources.flatMap(s=>s.paragraphs).map(p=>p.text).join('\n');
  const answer=[result.output.summary,...[...result.output.reasoning,...result.output.pros,...result.output.cons].map(p=>p.text),result.output.fit,...result.output.unknowns].join('\n');
  if(task.query==='streamdeck neo'){
   assert.equal(search.search_query,'stream deck neo');assert.ok(result.sources.every(s=>/neo/i.test(s.title+' '+s.url)));
   assert.match(material,/8 x customizable LCD keys|eight.*(?:keys|buttons)/i);assert.match(material,/2 x Touch Points|two.*Touch Points/i);
   assert.match(answer,/Neo/i);assert.match(answer,/(?:8|八|eight).*?(?:LCD|按键|键)/i);
  }else if(task.mode==='product'){
   assert.ok(result.sources.every(s=>/r[\s-]*2[\s-]*r/i.test(s.title+' '+s.url)));assert.match(material,/resistor|电阻/i);assert.match(material,/NOS/i);
   assert.match(answer,/R2R/i);assert.match(answer,/电阻|resistor/i);assert.match(answer,/NOS|OS.*模式/i);assert.ok(result.coverage.reviews>=1,'No independent review coverage');
  }else{
   assert.ok(result.coverage.reports>=1,'Only social retellings used');assert.ok(new Set(result.sources.map(s=>new URL(s.url).hostname)).size>=2);
   assert.match(answer,/测试|工况|条件|具体|车型/);assert.match(answer,/不能|不足|无法|不代表|不等于|缺少|泛化/);
  }
  entry.semanticPassed=true;
  // Same fingerprint is already persisted. Never retry a generation or change its inputs.
  const repeat=await post('/api/check/'+id+'/analyze',entry.request,true);assert.equal(repeat.cached,true);entry.repeatCached=true;
 }catch(e){entry.error=e.message;report.errors.push(task.query+': '+e.message);}
 save();console.log('CASE',JSON.stringify({query:task.query,passed:entry.semanticPassed===true,coverage:entry.result?.coverage,model:entry.result?.model,latencyMs:entry.latencyMs,summary:entry.result?.output.summary,reasoning:entry.result?.output.reasoning,pros:entry.result?.output.pros,cons:entry.result?.output.cons,unknowns:entry.result?.output.unknowns,sources:entry.result?.sources.map(s=>({title:s.title,url:s.url,type:s.source_type,paragraphs:s.paragraphs.length,total:s.total_paragraphs,partial:s.partial})),rejected:entry.result?.rejected_sources,error:entry.error,repeatCached:entry.repeatCached}));
 // Stay within public search cooldown even when a failed preflight is fast.
 await new Promise(r=>setTimeout(r,3000));
}
// Render the genuine saved outputs in the production app without any additional AI requests.
if(process.env.CHECK_CHAIN_BROWSER==='true'){
 let browser;
 try{
  const {chromium}=await import('playwright');browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  await ctx.route('**/api/check/**',r=>r.abort());
  const archive=report.reports.filter(e=>e.result).map(e=>({id:randomUUID(),query:e.query,mode:e.mode,verdict:'unverified',note:'',evidence:[],products:[],sources:e.search.candidates,created_at:report.at,ai:{...e.result,query:e.query,mode:e.mode}}));
  await ctx.addInitScript(a=>localStorage.setItem('ptu.checkdesk.cases',JSON.stringify(a)),archive);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Wait for Pages to expose this release; GET polling consumes no model quota.
  let ready=false;for(let i=0;i<24;i++){const html=await (await get(SITE+'apps/check-desk/?release='+Date.now())).text();if(html.includes('app.js?v=20261009-3')){ready=true;break;}await new Promise(r=>setTimeout(r,5000));}assert.ok(ready,'Frontend release not available');
  await page.goto(SITE+'apps/daily-nexus/?view=check');const frame=page.frameLocator('#checkFrame');await frame.locator('#query').waitFor();
  for(const e of archive){await frame.locator('#openArchive').click();await frame.locator('#archiveList .hub-row').filter({hasText:e.query}).locator('[data-load-case]').click();assert.equal(await frame.locator('#aiResult .ai-summary').innerText(),e.ai.output.summary);assert.ok((await frame.locator('#aiResult').innerText()).includes('匹配正文'));assert.equal(await frame.locator('#verdict').inputValue(),'unverified');await frame.locator('.ai-summary').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/check-chain-'+(e.mode==='claim'?'claim':e.query.includes('R2R')?'r2r':'neo')+'.png'});}
  assert.deepEqual(errors,[]);report.browserPassed=true;
 }catch(e){report.errors.push('Browser: '+e.message);}finally{await browser?.close();save();}
}
console.log('CHECK_CHAIN',JSON.stringify({attempts:report.attempts,passed:report.reports.filter(e=>e.semanticPassed).length,browserPassed:report.browserPassed,errors:report.errors}));
if(report.errors.length)process.exitCode=1;
