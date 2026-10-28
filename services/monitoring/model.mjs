import {createHash} from 'node:crypto';

export const TYPES=['shopping','uscis','hotel'];
export const HOTEL_FIELDS=['property','checkIn','checkOut','rooms','adults','children','roomType','bedType','mealPlan','cancellation','payment','currency'];
export const fingerprint=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const text=v=>String(v??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
export class MonitorError extends Error{constructor(code,message){super(message);this.code=code;}}
export function money(value){
 const s=String(value??'').trim().replace(/\u00a0/g,' '),m=[...s.matchAll(/(?:^|[^\d.,])([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)(?![\d.,])/g)];
 if(m.length!==1)return null;const n=Math.round(Number(m[0][1].replaceAll(',',''))*100);return Number.isSafeInteger(n)&&n>0&&n<1e11?n:null;
}
const short=(v,n=200)=>String(v??'').trim().slice(0,n);
export function validateObject(input,{now=Date.now()}={}){
 if(!input||!TYPES.includes(input.type))throw new MonitorError('invalid','请选择监控类型');
 const type=input.type,title=short(input.title),hours=Number(input.hours??(type==='uscis'?24:6));
 if(!title)throw new MonitorError('invalid','请填写名称');
 if(![1,2,3,6,12,24].includes(hours))throw new MonitorError('invalid','检查间隔无效');
 const config={...input.config};
 if(type==='uscis'){
  config.receipt=short(config.receipt).replace(/[\s-]/g,'').toUpperCase();
  if(!/^[A-Z]{3}\d{10}$/.test(config.receipt))throw new MonitorError('invalid','Receipt number 应为3个字母和10个数字');
 }else if(type==='shopping'){
  config.variant=short(config.variant);config.seller=short(config.seller);config.currency=short(config.currency||'USD').toUpperCase();
  config.targetMinor=config.targetMinor==null?null:Number(config.targetMinor);
  if(config.targetMinor!==null&&(!Number.isSafeInteger(config.targetMinor)||config.targetMinor<=0))throw new MonitorError('invalid','目标价无效');
 }else{
  for(const key of HOTEL_FIELDS)config[key]=short(config[key],1000);
  for(const key of ['rooms','adults']){config[key]=Number(config[key]);if(!Number.isInteger(config[key])||config[key]<1||config[key]>20)throw new MonitorError('invalid','请填写房间数和成人数');}
  config.children=config.children||'无';config.currency=config.currency.toUpperCase();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(config.checkOut)||config.checkOut<=config.checkIn)throw new MonitorError('invalid','入住和退房日期无效');
  config.originalTotal=Number(config.originalTotal);if(!Number.isSafeInteger(config.originalTotal)||config.originalTotal<=0)throw new MonitorError('invalid','请填写整段住宿含税总价');
  config.cancelLoss=Number(config.cancelLoss||0);if(!Number.isSafeInteger(config.cancelLoss)||config.cancelLoss<0)throw new MonitorError('invalid','取消损失无效');
  for(const k of ['cancelBy','claimBy']){config[k]=short(config[k]);if(config[k]&&!Number.isFinite(Date.parse(config[k])))throw new MonitorError('invalid','请填写带时区的截止时间');}
  config.policyURL=short(config.policyURL,2000);config.policyNotes=short(config.policyNotes,2500);config.policyVerified=config.policyVerified===true;config.platform=short(config.platform||'Booking.com');
 }
 if(type!=='uscis'&&!/^[A-Z]{3}$/.test(config.currency))throw new MonitorError('invalid','请输入三字母币种');
 return {type,title,hours:type==='uscis'?24:hours,config,createdAt:new Date(now).toISOString()};
}
export function normalizeSource(input,type){
 const url=short(input.url,2048);let u;try{u=new URL(url)}catch{throw new MonitorError('invalid','请输入完整报价链接');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw new MonitorError('invalid','仅支持不带账号信息的HTTPS链接');
 if(type==='hotel'&&['booking.com','www.booking.com'].includes(u.hostname))for(const k of ['sid','auth','token','label','aid'])u.searchParams.delete(k);
 u.hash='';
 return {url:u.href,label:short(input.label||u.hostname,120),browser:input.browser===true,priceSelector:short(input.priceSelector,600),termsSelector:short(input.termsSelector,600),quotedTotal:input.quotedTotal===true,currency:short(input.currency||'USD').toUpperCase(),contextVerified:false,termsHash:null,confirmedContext:null};
}
export function parseProduct(html,explicit=null){
 if(explicit?.priceText){const amount=money(explicit.priceText);if(amount===null)throw new MonitorError('ambiguous','价格区域必须只有一个明确金额');return {priceMinor:amount,currency:explicit.currency||'',title:explicit.title||'',availability:explicit.availability||'unknown',identity:explicit.identity||null};}
 const roots=[];for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{roots.push(JSON.parse(m[1]));}catch{}}
 const products=[];function walk(v){if(!v||typeof v!=='object')return;if((Array.isArray(v['@type'])?v['@type']:[v['@type']]).includes('Product'))products.push(v);for(const x of Object.values(v))if(typeof x==='object')Array.isArray(x)?x.forEach(walk):walk(x);}roots.forEach(walk);
 const quotes=[];for(const p of products){for(const offer of [p.offers].flat().filter(Boolean)){if(offer['@type']==='AggregateOffer'||offer.lowPrice!==undefined)continue;const amount=money(offer.price??offer.priceSpecification?.price),currency=offer.priceCurrency??offer.priceSpecification?.priceCurrency;if(amount!==null&&/^[A-Z]{3}$/.test(currency||''))quotes.push({priceMinor:amount,currency,title:text(p.name),availability:String(offer.availability||'unknown').split('/').at(-1),identity:{sku:p.sku||p.productID||null,seller:offer.seller?.name||null},variant:text(p.name)});}}
 const unique=[...new Map(quotes.map(q=>[fingerprint([q.priceMinor,q.currency,q.identity,q.variant]),q])).values()];
 if(unique.length!==1)throw new MonitorError('ambiguous',unique.length?'发现多个规格或报价，请指定价格区域':'未取得唯一商品价格，请使用浏览器或指定价格区域');return unique[0];
}
export function hotelDecision(object,source,quote,now=Date.now()){
 const c=object.config,reasons=[];if(!source.contextVerified)reasons.push('报价条件尚未核对');
 if(!quote.termsText||source.termsHash!==fingerprint(quote.termsText))reasons.push('房型或政策内容需要重新核对');
 if(fingerprint(source.confirmedContext)!==fingerprint(Object.fromEntries(HOTEL_FIELDS.map(k=>[k,c[k]]))))reasons.push('订单条件已变更');
 if(!source.quotedTotal||!quote.totalConfirmed)reasons.push('尚未确认是整段住宿含税总价');
 if(quote.currency!==c.currency)reasons.push('币种不一致');
 if(!Number.isSafeInteger(quote.priceMinor)||quote.priceMinor<=0)reasons.push('报价无效');
 const saving=reasons.length?null:c.originalTotal-quote.priceMinor;
 const match=reasons.length||!c.policyVerified||!c.policyURL||!c.claimBy||Date.parse(c.claimBy)<=now?false:saving>0;
 const rebook=reasons.length||!c.cancelBy||Date.parse(c.cancelBy)<=now?false:saving-c.cancelLoss>0;
 if(!c.policyVerified||!c.policyURL||!c.claimBy)reasons.push('价格匹配政策或申请截止时间未核实');
 return {saving,netSaving:saving===null?null:saving-c.cancelLoss,matchCandidate:match,rebookCandidate:rebook,reasons};
}
export function detectChange(object,source,previous,current,now=Date.now()){
 if(!previous)return null;
 if(object.type==='uscis')return fingerprint([previous.status,previous.body])!==fingerprint([current.status,current.body])?{kind:'case_changed',title:'案件状态有更新',detail:current.status}:null;
 if(object.type==='shopping'){
  if(fingerprint(previous.identity)!==fingerprint(current.identity)||previous.currency!==current.currency)return {kind:'context_changed',title:'报价条件发生变化',detail:'请重新核对规格、卖家或币种'};
  if(current.priceMinor===previous.priceMinor)return null;
  const target=object.config.targetMinor;if(current.priceMinor<previous.priceMinor&&(target===null||current.priceMinor<=target))return {kind:'price_drop',title:'商品价格下降',detail:'当前报价已满足你的价格规则'};return null;
 }
 const d=hotelDecision(object,source,current,now);if(current.priceMinor===previous.priceMinor)return null;
 return d.matchCandidate||d.rebookCandidate?{kind:'hotel_opportunity',title:'酒店出现低价机会',detail:d.matchCandidate?'发现可核对的价格匹配候选':'发现可核对的重新预订机会',decision:d}:null;
}
