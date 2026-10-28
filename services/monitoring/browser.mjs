import {MonitorError,verificationPage} from './model.mjs';
export {verificationPage} from './model.mjs';
import {safeURL} from './network.mjs';
const TRUSTED=['amazon.com','amazon.ca','amazon.co.uk','amazon.co.jp','amazon.de','booking.com','hilton.com','marriott.com','hyatt.com','ihg.com','bestbuy.com','walmart.com','target.com','costco.com','ebay.com','uscis.gov'];
const ASSETS=['bstatic.com','media-amazon.com','ssl-images-amazon.com','amazon-adsystem.com'];
export const trustedBrowserHost=h=>TRUSTED.some(d=>h===d||h.endsWith('.'+d));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class CDP{
 constructor(socket){this.ws=socket;this.seq=0;this.pending=new Map();this.events=new Set();socket.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data)}catch{return}if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error('浏览器操作失败')):p.resolve(m.result)}}else for(const fn of this.events)fn(m)});socket.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('浏览器连接已关闭'))}this.pending.clear()});}
 call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>{this.pending.delete(id);reject(new MonitorError('timeout','浏览器操作超时'))},22000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 close(){this.ws.close();}
}
export function caseFormAction(receipt){
 const visible=n=>!!n?.getClientRects().length;
 const input=[...document.querySelectorAll('input')].find(n=>visible(n)&&(/receipt/i.test([n.id,n.name,n.getAttribute('aria-label')].join(' '))||/^[A-Z]{3}\d{10}$/.test(n.placeholder||'')||[...document.querySelectorAll('label')].some(l=>l.htmlFor===n.id&&/receipt/i.test(l.textContent))));
 if(!input)return {found:false};
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
 if(setter)setter.call(input,receipt);else input.value=receipt;
 input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 return {found:true};
}
export function submitCaseForm(){
 const visible=n=>!!n?.getClientRects().length;
 const button=[...document.querySelectorAll('button,input[type="submit"]')].find(n=>visible(n)&&/check\s+(?:case\s+)?status/i.test(n.textContent||n.value||''));
 if(button){if(button.disabled)return false;button.click();return true;}
 const input=document.querySelector('#receipt_number,input[name="appReceiptNum"]');
 if(input?.form){input.form.requestSubmit();return true;}return false;
}
export function pageSnapshot(config={}){
 const visible=n=>!!n?.getClientRects().length;
 const value=n=>(n?.innerText||n?.textContent||'').trim();
 const select=selector=>{if(!selector)return [];try{return [...document.querySelectorAll(selector)].filter(visible).map(value).filter(Boolean)}catch{return []}};
 const defaultPrice=config.hotel?'[data-testid="price-and-discounted-price"]':'#corePrice_feature_div .a-price .a-offscreen,#corePriceDisplay_desktop_feature_div .a-price .a-offscreen,[itemprop="price"]';
 const priceGroups=config.priceSelector?[config.priceSelector]:config.hotel?[defaultPrice]:['#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen','#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen','[itemprop="price"]'];
 const nodes=[...new Set(priceGroups.map(select).find(values=>values.length)||[])],terms=select(config.termsSelector);
 const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible);
 const results=headings.filter(n=>/case|card|request|interview|application|petition|notice|document|oath|fingerprint|biometric|response|fee|certificate|naturalization|name|birth|decision/i.test(value(n))&&!/case status online|check case status|check status|related tools/i.test(value(n)));
 let statusBody='',status='';if(config.casePage&&results.length===1){
  const heading=results[0];status=value(heading);let scope=heading.parentElement;
  for(let i=0;i<3&&scope;i++,scope=scope.parentElement){const paragraphs=[...scope.querySelectorAll('p')].filter(visible).map(value).filter(v=>v.length>25);if(paragraphs.length){statusBody=paragraphs.join(' ');break;}}
 }
 const inputs=[...document.querySelectorAll('input')].filter(visible);
 const formFound=inputs.some(n=>/receipt/i.test([n.id,n.name,n.getAttribute('aria-label')].join(' '))||/^[A-Z]{3}\d{10}$/.test(n.placeholder||''));
 const activeChallenge=[...document.querySelectorAll('input#captchacharacters,form[action*="validateCaptcha"],#challenge-running,#challenge-stage,iframe[src*="challenges.cloudflare.com"]')].some(visible);
 return {url:location.href,html:document.documentElement.outerHTML.slice(0,1800000),title:document.title,headings:headings.map(value).join(' | '),body:value(document.body).slice(0,150000),activeChallenge,formFound,readyState:document.readyState,priceText:nodes.length===1?nodes[0]:null,priceCount:nodes.length,termsText:terms.length===1?terms[0]:null,currency:document.querySelector('[property="product:price:currency"],[itemprop="priceCurrency"]')?.content||'',status,statusBody,identity:{sku:document.querySelector('#ASIN')?.value||null,seller:value(document.querySelector('#sellerProfileTriggerId'))||null}};
}
export async function browse(url,{source={},receipt='',screenshot=false,endpoint=process.env.MONITOR_BROWSER_URL||'http://172.30.67.2:9222'}={}){
 const target=new URL(url);if(!trustedBrowserHost(target.hostname))throw new MonitorError('unsupported','这个网站暂不支持浏览器检查，可关闭浏览器模式尝试普通采集');
 await safeURL(url);
 let client,context;
 try{
  const version=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error();return r.json()});const address=new URL(version.webSocketDebuggerUrl);const base=new URL(endpoint);address.hostname=base.hostname;address.port=base.port;
  const socket=new WebSocket(address);await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('browser unavailable')),5000);socket.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});socket.addEventListener('error',()=>{clearTimeout(t);reject(Error('browser unavailable'))},{once:true});});client=new CDP(socket);
  context=(await client.call('Target.createBrowserContext')).browserContextId;
  const tab=await client.call('Target.createTarget',{url:'about:blank',browserContextId:context}),session=(await client.call('Target.attachToTarget',{targetId:tab.targetId,flatten:true})).sessionId;
  await client.call('Page.enable',{},session);await client.call('Runtime.enable',{},session);await client.call('Fetch.enable',{patterns:[{urlPattern:'*'}]},session);
  const allowed=h=>trustedBrowserHost(h)||ASSETS.some(d=>h===d||h.endsWith('.'+d));
  client.events.add(m=>{if(m.sessionId!==session||m.method!=='Fetch.requestPaused')return;const p=m.params;void(async()=>{try{const u=new URL(p.request.url);if(!['http:','https:'].includes(u.protocol)||u.protocol!=='https:'||!allowed(u.hostname)||['Image','Media','Font','Stylesheet'].includes(p.resourceType))throw Error();await safeURL(u.href);await client.call('Fetch.continueRequest',{requestId:p.requestId},session)}catch{await client.call('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'},session).catch(()=>{})}})();});
  await client.call('Page.navigate',{url},session);
  const config={...source,hotel:screenshot,casePage:target.hostname==='egov.uscis.gov'};
  const snapshot=async()=>{const r=await client.call('Runtime.evaluate',{expression:`(${pageSnapshot.toString()})(${JSON.stringify(config)})`,returnByValue:true},session);const page=r.result?.value;if(!page)throw new MonitorError('parse','无法读取网页内容');if(verificationPage(page))throw new MonitorError('challenge','源站显示验证或访问拦截，未取得有效结果');return page;};
  let result;
  for(let attempt=0;attempt<30;attempt++){
   result=await snapshot();
   if(config.casePage?result.formFound:result.priceText||/"@type"\s*:\s*"Product"/.test(result.html))break;
   if(attempt>=8&&result.readyState==='complete'&&!config.casePage)break;
   await wait(500);
  }
  if(receipt){
   const filled=await client.call('Runtime.evaluate',{expression:`(${caseFormAction.toString()})(${JSON.stringify(receipt)})`,returnByValue:true},session);
   if(!filled.result?.value?.found)throw new MonitorError('parse','USCIS页面已加载，但未识别到查询输入框；这不是案件状态结果');
   let submitted=false;for(let attempt=0;attempt<8;attempt++){const r=await client.call('Runtime.evaluate',{expression:`(${submitCaseForm.toString()})()`,returnByValue:true},session);if(r.result?.value){submitted=true;break;}await wait(300);}
   if(!submitted)throw new MonitorError('parse','USCIS查询按钮未就绪，本次未提交查询');
   for(let attempt=0;attempt<40;attempt++){result=await snapshot();if(result.status&&result.statusBody)break;if(/invalid receipt|receipt number.*(?:invalid|not recognized)|validation error/i.test(result.body))throw new MonitorError('invalid','官方页面未接受该案件编号，请核对输入');await wait(500);}
   if(!result.status||!result.statusBody)throw new MonitorError('parse','已提交查询，但未取得官方结果；请查看官方页面，本次不记录为状态未变');
  }
  if(!trustedBrowserHost(new URL(result.url).hostname))throw new MonitorError('redirect','网页跳转到未支持的网站');
  if(screenshot){const image=await client.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);result.screenshot=image.data;}
  return result;
 }catch(e){if(e instanceof MonitorError)throw e;throw new MonitorError('browser','浏览器连接暂不可用，请重试或切换普通采集');}
 finally{if(client&&context)await client.call('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});client?.close();}
}
