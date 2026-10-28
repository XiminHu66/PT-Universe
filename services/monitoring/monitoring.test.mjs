import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Store} from './store.mjs';
import {Engine} from './engine.mjs';
import {money,parseProduct,validateObject,normalizeSource,hotelDecision,fingerprint,HOTEL_FIELDS,detectChange,MonitorError} from './model.mjs';
import {publicAddress,safeURL} from './network.mjs';
import {createServer} from 'node:http';
import {createCollector} from './server.mjs';
const hotel={type:'hotel',config:{property:'Hotel Example',checkIn:'2027-01-10',checkOut:'2027-01-12',rooms:1,adults:2,children:'无',roomType:'City View',bedType:'King',mealPlan:'No meals',cancellation:'Free until Jan 8',payment:'Pay later',currency:'USD',originalTotal:50000,cancelLoss:0,cancelBy:'2027-01-08T12:00:00Z',claimBy:'2027-01-01T12:00:00Z',policyVerified:true,policyURL:'https://example.com/policy'}};
const source={contextVerified:true,termsHash:fingerprint('King refundable'),confirmedContext:Object.fromEntries(HOTEL_FIELDS.map(k=>[k,hotel.config[k]])),quotedTotal:true};
const quote={priceMinor:40000,currency:'USD',totalConfirmed:true,termsText:'King refundable'};
test('money rejects ambiguous, zero and mixed prices',()=>{assert.equal(money('$1,234.56'),123456);assert.equal(money('USD 199.00'),19900);for(const s of ['100 200','$99 or $109','19,99','0',''])assert.equal(money(s),null,s)});
test('schema requires valid receipt, dates and integer minor units',()=>{assert.throws(()=>validateObject({type:'uscis',title:'Case',config:{receipt:'IOE123'}}));assert.equal(validateObject({type:'uscis',title:'Case',hours:1,config:{receipt:'ioe1234567890'}}).hours,24);assert.throws(()=>validateObject({type:'shopping',title:'Product',config:{targetMinor:12.5}}));assert.throws(()=>validateObject({...hotel,title:'Stay',config:{...hotel.config,checkOut:'2027-01-01'}}));});
test('metadata price has one unambiguous product and offer',()=>{const p=offer=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Phone',sku:'ONE',offers:offer})}</script>`;assert.equal(parseProduct(p({'@type':'Offer',price:'99.00',priceCurrency:'USD'})).priceMinor,9900);assert.throws(()=>parseProduct(p([{'@type':'Offer',price:99,priceCurrency:'USD'},{'@type':'Offer',price:109,priceCurrency:'USD'}])));assert.throws(()=>parseProduct(p({'@type':'AggregateOffer',lowPrice:99,priceCurrency:'USD'})))});
test('internal and reserved network destinations denied',async()=>{for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);assert.equal(publicAddress('8.8.8.8'),true);await assert.rejects(()=>safeURL('https://example.com',async()=>[{address:'127.0.0.1',family:4}]));await assert.rejects(()=>safeURL('http://example.com'));await assert.rejects(()=>safeURL('https://user:pass@example.com'));});
test('hotel matching and rebooking are independent',()=>{const now=Date.parse('2026-12-31');let d=hotelDecision(hotel,source,quote,now);assert.equal(d.matchCandidate,true);assert.equal(d.rebookCandidate,true);assert.equal(d.netSaving,10000);d=hotelDecision({...hotel,config:{...hotel.config,policyVerified:false}},source,quote,now);assert.equal(d.matchCandidate,false);assert.equal(d.rebookCandidate,true);assert.equal(hotelDecision(hotel,source,quote,Date.parse('2027-01-02')).matchCandidate,false);});
test('missing tax basis, different currency, changed cancellation and unknown context prevent opportunities',()=>{for(const [s,q] of [[{...source,contextVerified:false},quote],[source,{...quote,totalConfirmed:false}],[source,{...quote,currency:'EUR'}],[source,{...quote,termsText:'Non-refundable'}]]){const d=hotelDecision(hotel,s,q,Date.parse('2026-12-31'));assert.equal(d.matchCandidate,false);assert.equal(d.rebookCandidate,false);assert.equal(d.saving,null)}});
test('rebooking cost accounts for cancellation loss and pay-later bookings',()=>{assert.equal(hotelDecision({...hotel,config:{...hotel.config,cancelLoss:12000}},source,quote,Date.parse('2026-12-31')).rebookCandidate,false);assert.equal(hotelDecision(hotel,source,quote,Date.parse('2026-12-31')).netSaving,10000)});
test('seller changes are context changes, not price drops',()=>{const o={type:'shopping',config:{targetMinor:null}},p={priceMinor:10000,currency:'USD',identity:{seller:'A'}},c={...p,priceMinor:9000,identity:{seller:'B'}};assert.equal(detectChange(o,{},p,c).kind,'context_changed');assert.equal(detectChange(o,{},p,{...p,priceMinor:9000}).kind,'price_drop')});
test('case body changes are detected even when heading is unchanged',()=>{assert.equal(detectChange({type:'uscis'},{},{status:'Case Received',body:'A'},{status:'Case Received',body:'B'}).kind,'case_changed');assert.equal(detectChange({type:'uscis'},{},null,{status:'Case Received',body:'B'}),null)});
test('all stored business content is encrypted and survives reopening',()=>{const dir=mkdtempSync(tmpdir()+'/pt-monitor-');try{let s=new Store(dir);const r=s.put('object',{title:'PRIVATE-CASE-IOE1234567890'});assert.equal(s.get(r.id).title,'PRIVATE-CASE-IOE1234567890');s.close();assert.equal(readFileSync(dir+'/monitoring.sqlite').includes('IOE1234567890'),false);s=new Store(dir);assert.equal(s.get(r.id).title,'PRIVATE-CASE-IOE1234567890');s.close()}finally{rmSync(dir,{recursive:true,force:true})}});
test('failed checks keep last valid observation and never create a false price event',async()=>{const dir=mkdtempSync(tmpdir()+'/pt-monitor-'),store=new Store(dir);try{let time=Date.now(),fail=false;const e=new Engine(store,{clock:()=>time,fetcher:async()=>{if(fail)throw new MonitorError('challenge','验证页面');return {html:'<script type="application/ld+json">{"@type":"Product","name":"Phone","offers":{"@type":"Offer","price":"100","priceCurrency":"USD"}}</script>'}}});const o=store.put('object',validateObject({type:'shopping',title:'Phone',config:{currency:'USD'}})),s=store.put('source',{...normalizeSource({url:'https://www.amazon.com/dp/B012345678',browser:false},'shopping'),objectId:o.id,nextDue:0},o.id);await e.check(s.id);const before=store.get(s.id);assert.equal(before.last.priceMinor,10000);await e.confirm(s.id,{observationId:before.last.id});time+=60000;fail=true;await e.check(s.id);const after=store.get(s.id);assert.equal(after.last.id,before.last.id);assert.equal(after.lastSuccess,before.lastSuccess);assert.equal(after.errorCode,'challenge');assert.equal(store.list('observation',o.id).length,1);assert.equal(store.list('event',o.id).length,0);assert.equal(store.list('check',o.id).length,2);}finally{store.close();rmSync(dir,{recursive:true,force:true})}});
test('confirmation binds to current observation and object changes invalidate it',async()=>{const dir=mkdtempSync(tmpdir()+'/pt-monitor-'),store=new Store(dir);try{const e=new Engine(store),o=store.put('object',validateObject({type:'shopping',title:'Phone',config:{currency:'USD'}})),s=store.put('source',{objectId:o.id,last:{id:'old'},lastSuccess:new Date().toISOString(),baselineConfirmed:false},o.id);await assert.rejects(()=>e.confirm(s.id,{observationId:'stale'}));await e.confirm(s.id,{observationId:'old'});assert.equal(store.get(s.id).baselineConfirmed,true);await e.update(o.id,{config:{targetMinor:5000}});assert.equal(store.get(s.id).baselineConfirmed,false);}finally{store.close();rmSync(dir,{recursive:true,force:true})}});
test('booking removes session and referral values from stored source URLs',()=>{const s=normalizeSource({url:'https://www.booking.com/hotel/us/example.html?sid=secret&aid=123&checkin=2027-01-10'},'hotel');assert.ok(!s.url.includes('secret'));assert.ok(s.url.includes('checkin=2027-01-10'))});
test('events are idempotent while a further price drop creates a distinct event',async()=>{const dir=mkdtempSync(tmpdir()+'/pt-monitor-'),store=new Store(dir);try{const e=new Engine(store),o=store.put('object',{title:'Phone'}),s={id:'source'},p=store.put('observation',{priceMinor:9000},o.id),q=store.put('observation',{priceMinor:8000},o.id),v={kind:'price_drop',title:'Drop',detail:'Lower'};await e.event(o,s,v,p.id);await e.event(o,s,v,p.id);await e.event(o,s,v,q.id);assert.equal(store.list('event',o.id).length,2)}finally{store.close();rmSync(dir,{recursive:true,force:true})}});
test('hotel API creates parented sources, confirms a baseline, records a lower quote and downloads evidence',async()=>{
 const dir=mkdtempSync(tmpdir()+'/pt-monitor-'),store=new Store(dir);let price='USD 500.00',clock=Date.now();const engine=new Engine(store,{clock:()=>clock,validateURL:async()=>{},browser:async url=>({url,priceText:price,currency:'USD',termsText:'King refundable',screenshot:null})}),handler=createCollector({engine}),server=createServer((req,res)=>void handler(req,res,new URL(req.url,'https://example.com')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/__pt_monitor/api',origin='https://pt-vps-tools.h1nano.chatgpt.site';
 const call=(p,method='GET',body)=>fetch(base+p,{method,headers:{origin,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await fetch(base+'/state')).status,403);
  const created=await call('/objects','POST',{...hotel,title:'Hotel QA',source:{url:'https://www.hilton.com/quote',priceSelector:'.total',termsSelector:'.terms',quotedTotal:true,browser:true,currency:'USD'}});assert.equal(created.status,201);const object=await created.json();
  for(let i=0;i<20&&engine.running.size;i++)await new Promise(r=>setImmediate(r));
  const d=await call('/objects/'+object.id).then(r=>r.json());assert.equal(d.sources.length,1,'source must belong to its object in details');assert.equal(d.sources[0].last.priceMinor,50000);assert.equal(d.observations.length,1);
  const id=d.sources[0].id;const confirmed=await call('/sources/'+id+'/confirm','POST',{observationId:d.sources[0].last.id,conditionsMatch:true});assert.equal(confirmed.status,200);
  const rateLimit=await call('/sources/'+id+'/check','POST',{});assert.equal(rateLimit.status,429);
  clock+=61000;price='USD 400.00';await engine.check(id);const state=await call('/state').then(r=>r.json());assert.equal(state.objects[0].sources.length,1);assert.equal(state.events.filter(e=>e.kind==='hotel_opportunity').length,1);
  const updated=await call('/objects/'+object.id).then(r=>r.json()),evidence=await call('/evidence/'+updated.sources[0].last.evidenceId).then(r=>r.json());assert.equal(evidence.quote.priceMinor,40000);assert.equal(evidence.orderBaseline.originalTotal,50000);assert.equal(evidence.policySnapshot.verified,true);assert.ok(!JSON.stringify(evidence).includes('encryption.key'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true})}
});

import {verificationPage} from './model.mjs';
import {pageSnapshot,caseFormAction,submitCaseForm} from './browser.mjs';
import vm from 'node:vm';
test('verification detection ignores dormant scripts and product copy, but recognizes actual blocks',()=>{
 assert.equal(verificationPage({title:'Wireless keyboard',body:'Supports security keys and CAPTCHA',html:'<script>var validateCaptcha="challenge-platform";</script>'}),false);
 for(const page of [{title:'Attention Required! | Cloudflare'},{title:'Robot Check'},{headings:'Sorry, you have been blocked'},{body:'Enter the characters you see below'},{activeChallenge:true}])assert.equal(verificationPage(page),true);
});
test('React-style receipt input gets native setter, input/change events, then an enabled button click without a form',()=>{
 let value='',nativeSetterCalls=0,clicked=0;class Input{};Object.defineProperty(Input.prototype,'value',{get:()=>value,set:v=>{nativeSetterCalls++;value=v}});
 const button={textContent:'Check Status',disabled:true,getClientRects:()=>[{}],click:()=>clicked++};
 const input=new Input();Object.assign(input,{id:'modern-input',name:'query',placeholder:'EAC1234567890',getAttribute:()=>null,getClientRects:()=>[{}],dispatchEvent:e=>{if(e.type==='input')button.disabled=false}});
 const document={querySelector:()=>null,querySelectorAll:s=>s==='input'?[input]:s==='button,input[type="submit"]'?[button]:[]};
 const context=vm.createContext({document,HTMLInputElement:Input,Event:class{constructor(type){this.type=type}}});
 const fill=vm.runInContext('('+caseFormAction.toString()+')',context),submit=vm.runInContext('('+submitCaseForm.toString()+')',context);
 assert.equal(fill('IOE0000000000').found,true);assert.equal(value,'IOE0000000000');assert.equal(nativeSetterCalls,1);assert.equal(submit(),true);assert.equal(clicked,1);
});
test('modern case result headings and paragraph extraction exclude the search page title',()=>{
 const p={innerText:'On October 1, 2026, we received your application.',getClientRects:()=>[{}]};const container={querySelectorAll:s=>s==='p'?[p]:[],parentElement:null};
 const headings=['Case Status Online','Check Case Status','Case Was Received'].map(innerText=>({innerText,parentElement:container,getClientRects:()=>[{}]}));
 const document={title:'Case Status Online',readyState:'complete',body:{innerText:'Case Was Received'},documentElement:{outerHTML:'<main>result</main>'},querySelector:()=>null,querySelectorAll:s=>s==='h1,h2,h3'?headings:[]};
 const result=vm.runInNewContext('('+pageSnapshot.toString()+')({casePage:true})',{document,location:{href:'https://egov.uscis.gov/'}});
 assert.equal(result.status,'Case Was Received');assert.equal(result.statusBody,p.innerText);assert.equal(result.activeChallenge,false);
});
test('price extraction prefers the main buybox and never collapses multiple offers into one price',()=>{
 let values=['$239.99'];const document={title:'Product',readyState:'complete',body:{innerText:'Product'},documentElement:{outerHTML:'<main>Product</main>'},querySelector:()=>null,querySelectorAll:s=>s==='#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen'?values.map(innerText=>({innerText,getClientRects:()=>[{}]})):[]};
 const read=()=>vm.runInNewContext('('+pageSnapshot.toString()+')({})',{document,location:{href:'https://www.amazon.com/dp/EXAMPLE'}});
 assert.equal(read().priceText,'$239.99');values=['$239.99','$249.99'];assert.equal(read().priceText,null);assert.equal(read().priceCount,2);
});
test('blocked checks back off for a day and preserve prior observation without generating false changes',async()=>{
 const dir=mkdtempSync(tmpdir()+'/pt-monitor-'),store=new Store(dir);try{
 const now=Date.now(),e=new Engine(store,{clock:()=>now,browser:async()=>{throw new MonitorError('challenge','Blocked')}}),o=store.put('object',validateObject({type:'shopping',title:'Product',hours:1,config:{currency:'USD'}})),s=store.put('source',{objectId:o.id,browser:true,url:'https://www.amazon.com/dp/EXAMPLE',last:{id:'old',priceMinor:10000},lastSuccess:new Date(now-3600000).toISOString()},o.id);
 await e.check(s.id);assert.equal(store.get(s.id).nextDue,now+86400000);assert.equal(store.get(s.id).last.id,'old');assert.equal(store.list('observation',o.id).length,0);assert.equal(store.list('event',o.id).length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true})}
});
