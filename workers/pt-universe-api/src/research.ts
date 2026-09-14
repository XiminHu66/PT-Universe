/** Public, fixed-upstream PC comparison and single-company financial verification. */
const UA='PTUniverseResearch/1.0 (+https://github.com/XiminHu66/PT-Universe)';
const CHEAP='https://www.cheapshark.com/api/1.0/';
const STEAM='https://store.steampowered.com/api/';
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
async function get(url:string){
 const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','cache-control':'no-cache'},signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw new Error(`上游 HTTP ${r.status}`);
 return r.json<any>();
}
function id(value:string|null){if(!value||!/^\d{1,12}$/.test(value))throw new Error('无效游戏编号');return value}
const redirect=(deal:string)=>'https://www.cheapshark.com/redirect?dealID='+encodeURIComponent(decodeURIComponent(deal));
export function summarizeOffers(offers:any[]){
 const valid=offers.filter(o=>Number.isFinite(o.price)&&o.price>=0&&o.currency==='USD').sort((a,b)=>a.price-b.price);
 return {offers:valid,lowest:valid[0]||null,maxDiscount:valid.length?Math.max(...valid.map(o=>o.discount||0)):null};
}
async function searchGames(query:string){
 const q=query.trim();if(q.length<2||q.length>80)throw new Error('请输入 2–80 个字符的游戏名');
 const [steam,cheap]=await Promise.allSettled([
  get(STEAM+'storesearch/?cc=us&l=english&term='+encodeURIComponent(q)),
  get(CHEAP+'games?limit=20&title='+encodeURIComponent(q))]);
 const candidates=new Map<string,any>(),sources=[];
 if(steam.status==='fulfilled'){
  for(const x of steam.value.items||[]){if(x.type!=='app')continue;const sid=String(x.id);candidates.set('steam:'+sid,{key:'steam:'+sid,steamId:sid,title:x.name,thumb:x.tiny_image,source:'Steam',url:`https://store.steampowered.com/app/${sid}/`})}
  sources.push({name:'Steam 官方搜索',ok:true});
 }else sources.push({name:'Steam 官方搜索',ok:false,error:String(steam.reason)});
 if(cheap.status==='fulfilled'&&Array.isArray(cheap.value)){
  for(const x of cheap.value){const sid=x.steamAppID?String(x.steamAppID):null,key=sid?'steam:'+sid:'cheap:'+x.gameID,prior=candidates.get(key);candidates.set(key,{...prior,key,steamId:sid,cheapId:String(x.gameID),title:prior?.title||x.external,thumb:prior?.thumb||x.thumb,source:prior?'Steam + 第三方':'第三方 PC 商店'})}
  sources.push({name:'CheapShark PC 游戏索引',ok:true});
 }else sources.push({name:'CheapShark PC 游戏索引',ok:false,error:cheap.status==='rejected'?String(cheap.reason):'无效响应'});
 if(!sources.some(s=>s.ok))throw new Error('游戏搜索来源暂不可用，请稍后重试');
 return {query:q,items:[...candidates.values()].slice(0,25),sources,checkedAt:new Date().toISOString(),region:'US',currency:'USD'};
}
async function gamePrices(steamId:string|null,cheapId:string|null){
 if(steamId)id(steamId);if(cheapId)id(cheapId);if(!steamId&&!cheapId)throw new Error('请选择游戏');
 const checkedAt=new Date().toISOString(),offers:any[]=[],sources:any[]=[];
 const results=await Promise.allSettled([
  steamId?get(STEAM+'appdetails?appids='+steamId+'&cc=us&l=english'):Promise.resolve(null),
  cheapId?get(CHEAP+'games?id='+cheapId):get(CHEAP+'deals?steamAppID='+steamId+'&sortBy=Price&pageSize=60'),
  get(CHEAP+'stores')]);
 const stores:Record<string,string>={};if(results[2].status==='fulfilled')for(const s of results[2].value||[])stores[s.storeID]=s.storeName;
 let title='',kind='game',officialVerified=false,history=null;
 if(steamId){
  const r=results[0];const app=r.status==='fulfilled'?r.value?.[steamId]:null;
  if(app?.success){
   const d=app.data;title=d.name;kind=d.type;officialVerified=true;
   if(!['game','dlc'].includes(kind))throw new Error('请选择 PC 游戏本体或明确标记的 DLC');
   const p=d.price_overview;
   if(d.is_free||p?.currency==='USD')offers.push({store:'Steam',storeId:'1',official:true,price:d.is_free?0:p.final/100,regular:d.is_free?0:p.initial/100,discount:d.is_free?0:p.discount_percent,currency:'USD',url:`https://store.steampowered.com/app/${steamId}/`,channel:'Steam 官方商店',edition:kind==='dlc'?'DLC':'本页面所选游戏',checkedAt});
   sources.push({name:'Steam 官方价格',ok:true,note:!p&&!d.is_free?'未发售、当前不可购买或没有美区报价':null});
  }else sources.push({name:'Steam 官方价格',ok:false,error:'Steam 暂未返回可核验的游戏信息'});
 }
 const c=results[1];
 if(c.status==='fulfilled'){
  const raw=c.value;const rows=cheapId?raw.deals:raw;
  if(cheapId){if(steamId&&raw.info?.steamAppID&&String(raw.info.steamAppID)!==steamId)throw new Error('游戏编号不匹配，请重新选择准确版本');title=title||raw.info?.title||'';const h=raw.cheapestPriceEver;if(h&&Number.isFinite(Number(h.price)))history={price:Number(h.price),date:h.date?new Date(h.date*1000).toISOString():null,source:'CheapShark 历史记录'};}
  if(!Array.isArray(rows))throw new Error('第三方报价格式无效');
  for(const o of rows){
   if(!cheapId&&String(o.steamAppID)!==steamId)continue;
   if(officialVerified&&String(o.storeID)==='1')continue;
   const price=Number(cheapId?o.price:o.salePrice),regular=Number(cheapId?o.retailPrice:o.normalPrice);
   if(!Number.isFinite(price)||price<0)continue;
   title=title||o.title||'';
   offers.push({store:stores[o.storeID]||'商店 '+o.storeID,storeId:String(o.storeID),official:false,price,regular,discount:regular>0?Math.max(0,(1-price/regular)*100):0,currency:'USD',url:redirect(o.dealID),channel:String(o.storeID)==='1'?'Steam（聚合报价，官方暂未核验）':'第三方 PC 商店',edition:'以此报价商品页的版本和激活地区为准',checkedAt});
  }
  sources.push({name:'CheapShark 第三方报价',ok:true,count:rows.length});
 }else sources.push({name:'CheapShark 第三方报价',ok:false,error:String(c.reason)});
 if(!sources.some(s=>s.ok))throw new Error('价格来源暂不可用');
 const unique=[...new Map(offers.map(o=>[o.storeId+'|'+o.url,o])).values()];
 return {title,kind,steamId,cheapId,...summarizeOffers(unique),history,sources,checkedAt,region:'US',currency:'USD',coverage:'已成功查询渠道中的最低价；未覆盖所有商店、会员价或优惠券'};
}
const fields={revenue:'TotalRevenue',operatingIncome:'OperatingIncome',netIncome:'NetIncome',grossProfit:'GrossProfit',ocf:'OperatingCashFlow',capex:'CapitalExpenditure',sbc:'StockBasedCompensation',shares:'DilutedAverageShares'};
const companies:Record<string,string>={NVDA:'NVIDIA',AAPL:'Apple',MSFT:'Microsoft',GOOGL:'Alphabet',META:'Meta',TSLA:'Tesla',PLTR:'Palantir',AMD:'AMD',AVGO:'Broadcom',ANET:'Arista Networks',DELL:'Dell',W:'Wayfair'};
export function normalizeFinancials(payload:any,ticker:string){
 const quarters:Record<string,any>={};
 for(const row of payload.timeseries?.result||[]){
  const type=row.meta?.type?.[0],field=Object.entries(fields).find(([,v])=>'quarterly'+v===type)?.[0];if(!field)continue;
  for(const point of row[type]||[]){
   if(point.periodType!=='3M'||(point.currencyCode&&point.currencyCode!=='USD'&&field!=='shares'))continue;
   const end=point.asOfDate;if(!/^\d{4}-\d{2}-\d{2}$/.test(end))continue;
   const q=quarters[end]||{end,...Object.fromEntries(Object.keys(fields).map(k=>[k,null])),filed:null,sourceURL:`https://finance.yahoo.com/quote/${ticker}/financials/`,note:'Yahoo 标准化单季数据，可能包含重述'};
   const value=numeric(point.reportedValue?.raw);q[field]=field==='capex'&&value!==null?-value:value;quarters[end]=q;
  }
 }
 return Object.values(quarters).filter(q=>q.revenue!==null).sort((a,b)=>a.end.localeCompare(b.end)).map(q=>({...q,fcf:q.ocf!==null&&q.capex!==null?q.ocf-q.capex:null}));
}
async function financials(ticker:string){
 if(!Object.hasOwn(companies,ticker))throw new Error('请选择支持的财报公司');
 const epoch=Math.floor(Date.now()/1000),types=Object.values(fields).map(v=>'quarterly'+v).join(',');
 const url=`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}?type=${types}&period1=${epoch-3*366*86400}&period2=${epoch}`;
 const raw=await get(url),quarters=normalizeFinancials(raw,ticker);
 if(quarters.length<3)throw new Error('当前来源不足三个有效季度，保留已有练习数据');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(quarters))));
 const fingerprint=[...digest].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,16);
 return {ticker,name:companies[ticker],quarters,provider:'Yahoo Finance 标准化财报（即时核对）',sourceURL:`https://finance.yahoo.com/quote/${ticker}/financials/`,updatedAt:new Date().toISOString(),stale:false,fingerprint,live:true};
}
export async function researchRoute(request:Request):Promise<any|null>{
 const url=new URL(request.url);
 if(!['/api/pc/search','/api/pc/prices','/api/training/financials'].includes(url.pathname))return null;
 if(request.method!=='GET')throw new Error('仅支持 GET');
 if(url.pathname==='/api/training/financials')return financials((url.searchParams.get('symbol')||'').toUpperCase());
 // Short shared price/search cache reduces duplicate upstream requests; no browser rendering.
 const key=new Request(url.origin+url.pathname+'?'+new URLSearchParams([...url.searchParams].filter(([k])=>['q','steamId','cheapId'].includes(k)).sort()),{method:'GET'});
 const cache=await caches.open('pt-pc-prices-v1');
 const cached=await cache.match(key);
 if(cached)return {...await cached.json<any>(),cached:true};
 const result=url.pathname==='/api/pc/search'?await searchGames(url.searchParams.get('q')||''):await gamePrices(url.searchParams.get('steamId'),url.searchParams.get('cheapId'));
 await cache.put(key,new Response(JSON.stringify(result),{headers:{'content-type':'application/json','cache-control':'public,max-age=120'}}));
 return {...result,cached:false};
}
