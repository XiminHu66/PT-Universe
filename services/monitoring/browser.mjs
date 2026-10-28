import {MonitorError} from './model.mjs';
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
  await client.call('Page.navigate',{url},session);await wait(5000);
  if(receipt){
   const expression=`(()=>{const input=document.querySelector('#receipt_number,input[name="appReceiptNum"]');if(!input)return false;input.value=${JSON.stringify(receipt)};input.dispatchEvent(new Event('input',{bubbles:true}));const form=input.form;if(!form)return false;form.requestSubmit();return true})()`;
   const filled=await client.call('Runtime.evaluate',{expression,returnByValue:true},session);if(!filled.result?.value)throw new MonitorError('parse','USCIS查询表单未找到，可能需要人工验证');await wait(6000);
  }
  const expression=`(${function(config){
   const select=s=>{if(!s)return [];try{return [...document.querySelectorAll(s)].filter(n=>n.getClientRects().length).map(n=>n.innerText?.trim()).filter(Boolean)}catch{return []}};
   const defaultPrice=config.hotel?'[data-testid="price-and-discounted-price"]':'#corePrice_feature_div .a-price .a-offscreen,#corePriceDisplay_desktop_feature_div .a-price .a-offscreen,[itemprop="price"]';
   const nodes=[...new Set(select(config.priceSelector||defaultPrice))];
   const terms=select(config.termsSelector);const status=document.querySelector('.rows.text-center h1,.text-center h1,.appointment-sec h1')?.innerText?.trim();
   const section=document.querySelector('.rows.text-center,.appointment-sec');
   return {url:location.href,html:document.documentElement.outerHTML.slice(0,1800000),title:document.title,body:document.body.innerText.slice(0,150000),priceText:nodes.length===1?nodes[0]:null,priceCount:nodes.length,termsText:terms.length===1?terms[0]:null,currency:document.querySelector('[property="product:price:currency"],[itemprop="priceCurrency"]')?.content||'',status,statusBody:section?.innerText?.trim(),identity:{sku:document.querySelector('#ASIN')?.value||null,seller:document.querySelector('#sellerProfileTriggerId')?.innerText?.trim()||null}};
  }.toString()})(${JSON.stringify({...source,hotel:screenshot})})`;
  const evaluated=await client.call('Runtime.evaluate',{expression,returnByValue:true},session),result=evaluated.result?.value;
  if(!result)throw new MonitorError('parse','无法读取网页内容');if(!trustedBrowserHost(new URL(result.url).hostname))throw new MonitorError('redirect','网页跳转到未支持的网站');
  if(/robot check|verify (?:you are|that you)|access denied|just a moment|complete the security|captcha challenge|验证您是|验证码/i.test(result.body)||/validateCaptcha|challenge-platform/i.test(result.html))throw new MonitorError('challenge','网站要求验证，本次检查未成功');
  if(screenshot){const image=await client.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);result.screenshot=image.data;}
  return result;
 }catch(e){if(e instanceof MonitorError)throw e;throw new MonitorError('browser','浏览器连接暂不可用，请重试或切换普通采集');}
 finally{if(client&&context)await client.call('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});client?.close();}
}
