// Controller/DOM fixtures, not public-upstream or production verification.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../workers/pt-universe-api/package.json',import.meta.url)),{build}=require('esbuild'),{parseHTML}=require('linkedom');
const source=await readFile(new URL('../../apps/deal-lab/app.js',import.meta.url),'utf8');
const output=await build({stdin:{contents:source+'\nglobalThis.testLab={query,state,setPage,work,searchProducts,selectVariant,loadGame};',resolveDir:new URL('../../apps/deal-lab/',import.meta.url).pathname},bundle:true,format:'iife',platform:'browser',write:false});
const {window}=parseHTML(await readFile(new URL('../../apps/deal-lab/index.html',import.meta.url),'utf8'));
const local=new Map(),session=new Map(),issued=Math.floor(Date.now()/1000),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
session.set('pt.monitor.session.v1','header.'+encode({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-monitor',sub:'pt-backend-owner',scope:'monitor:manage',iat:issued,exp:issued+3600,nonce:'a'.repeat(48)})+'.fixture');
const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
let clock=Date.now(),requests=[],requestTimes=[],cancelWait=false;class Clock extends Date{static now(){return clock;}}
let configured=true;
const context=vm.createContext({window,document:window.document,location:{origin:'https://ximinhu66.github.io',pathname:'/PT-Universe/apps/deal-lab/',search:'',hash:'',assign(){}},history:{replaceState(){}},localStorage:storage(local),sessionStorage:storage(session),URL,URLSearchParams,AbortController,AbortSignal,DOMException,Date:Clock,Intl,atob,console,setTimeout:(fn,ms)=>{if(cancelWait)queueMicrotask(()=>context.testLab.setPage('games'));queueMicrotask(()=>{clock+=ms;fn();});return 1;},clearTimeout(){},fetch:async(url,init)=>{
 if(url.endsWith('/status'))return Response.json({authorized:true,sources:{serpapi:{configured,budget:{cooldown:5}},cheapshark:{budget:{cooldown:2}},steamstore:{budget:{cooldown:1}},fx:{budget:{cooldown:1}},itad:{configured:false}}});
 const q=JSON.parse(init.body);requests.push(q);requestTimes.push(clock);clock+=750;let data;
 if(q.provider==='serpapi'){
  if(q.operation==='search')data={shopping_results:[{title:'Headphones',product_id:'1',immersive_product_page_token:'a'},{title:'Headphones Plus',product_id:'2',immersive_product_page_token:'b'}]};
  else data={search_metadata:{processed_at:'2026-10-29 20:00:00 UTC'},product_results:{title:'Headphones '+q.args.page_token,stores:[{name:'Retailer',price:'$10.00',extracted_price:10,link:'https://example.com/offer'}]}};
 }else if(q.provider==='fx')data={date:'2026-10-29',rates:{EUR:1,USD:1,CNY:7}};
 else if(q.provider==='steamstore')data={available:true,country:q.args.country,appid:1,game:{name:'Game',price_overview:{currency:q.args.country==='CN'?'CNY':'USD',final:q.args.country==='CN'?5000:1000}}};
 else if(q.operation==='stores')data=[{storeID:'1',storeName:'Steam'}];
 else data=[{title:'Game',salePrice:'7.00',storeID:'1',dealID:'abc',steamAppID:'1'}];
 return Response.json({...q,data,httpStatus:200,cache:'miss',fetchedAt:new Date().toISOString()});
}});
window.history=context.history;vm.runInContext(output.outputFiles[0].text,context);await new Promise(setImmediate);
const lab=context.testLab;assert.equal(requests.length,0,'opening a page never triggers upstream work');
window.document.querySelector('#productTerm').value='Headphones';window.document.querySelector('form.toolbar [data-work]').click();
for(let i=0;i<40&&lab.state.busy;i++)await new Promise(setImmediate);
assert.deepEqual(requests.map(q=>q.operation),['search','product'],'one search must automatically load matching details and quotes');
assert.ok(requestTimes[1]-requestTimes[0]>=5750,'cooldown starts after the prior response, accounting for network latency');
assert.equal(lab.state.selected.identifier,'a');assert.equal(lab.state.variantData.get('a').offers.length,1);
await lab.selectVariant(lab.state.variants[1]);assert.equal(lab.state.selected.identifier,'b');assert.equal(requests.filter(q=>q.operation==='search').length,1,'switching pack tabs does not rerun keyword search');
lab.state.cooldowns.serpapi=clock+2000;cancelWait=true;const before=requests.length;await lab.work(signal=>lab.query('serpapi','product',{page_token:'c'},signal));assert.equal(requests.length,before,'navigation cancels queued API work');assert.equal(lab.state.page,'games');cancelWait=false;
lab.state.countries=['CN','US'];await lab.work(signal=>lab.loadGame({id:1,name:'Game'},signal));assert.deepEqual(Array.from(lab.state.offers,x=>x.currency),['CNY','USD','USD']);assert.equal(requests.some(q=>q.provider==='shopsavvy'),false);assert.equal(requests.some(q=>q.provider==='itad'),false,'missing optional key is skipped independently');
assert.ok(!window.document.querySelector('.loading'),'completed comparisons clear the in-progress indicator');
assert.ok(!window.document.querySelector('[data-page=playground]'));
configured=false;lab.state.status.sources.serpapi.configured=false;lab.setPage('products');const previous=requests.length;await lab.searchProducts();assert.equal(requests.length,previous,'missing key triggers no searches');assert.ok(window.document.querySelector('#notice').textContent.includes('SERPAPI_KEY'));assert.ok(![...local.keys(),...session.keys()].some(k=>/serpapi.*key|api.key/i.test(k)));
console.log('PASS: bounded SerpApi search + selected product, separate variant requests, full response cooldown, cancellation, missing-key no-call, no key storage and unchanged CN/US games.');
