// Display adapters preserve the original packet separately. Missing fields remain missing.
export const NAMES={shopsavvy:'ShopSavvy MCP',serpapi:'SerpApi Shopping',itad:'IsThereAnyDeal',cheapshark:'CheapShark',gamerpower:'GamerPower',steam:'Steam Wishlist'};
export function safeURL(value){try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}}
export function money(value,currency){if(value===undefined||value===null||value==='')return '';if(typeof value==='object')return money(value.amount,value.currency||currency);if(!Number.isFinite(Number(value)))return String(value);try{return currency?new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value)):String(value)+'（币种未提供）'}catch{return String(value)+' '+String(currency)}}
const strip=s=>String(s||'').replace(/\*\*/g,'').trim();
export function mcpItems(result){
 if(result?.structuredContent){const d=result.structuredContent;for(const k of ['products','offers','results','items'])if(Array.isArray(d[k]))return d[k];}
 const text=(result?.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const productBlocks=text.split(/^### \d+\. /m).slice(1);
 if(productBlocks.length)return productBlocks.map(block=>{const lines=block.split('\n'),field=name=>strip(block.match(new RegExp('^- '+name+': (.+)$','m'))?.[1]);return {title:strip(lines[0]),brand:field('Brand'),asin:field('ASIN'),barcode:field('Barcode'),identifier:field('Path'),text:block};});
 const offers=[...text.matchAll(/^\d+\. \*\*(.+?)\*\* - (.+)\n([\s\S]*?)(?=^\d+\. \*\*|$(?![\s\S]))/gm)];
 if(offers.length)return offers.map(m=>{const block=m[3],field=name=>strip(block.match(new RegExp('^\\s+- '+name+': (.+)$','m'))?.[1]);return {title:strip(m[1]),price:m[2].trim(),source:strip(m[1]),condition:field('Condition'),availability:field('Availability'),checkedAt:field('Last checked'),link:block.match(/\[View Offer\]\((https?:\/\/.+)\)/)?.[1],text:m[0]};});
 return text?[{title:'ShopSavvy 返回内容',text}]:[];
}
export function normalize(packet){
 const {provider:p,operation:op,data:d}=packet;
 const productTitle=p==='shopsavvy'?(d?.result?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').match(/Current Offers for ([^\n]+)/)?.[1]||packet.contextTitle:'';
 if(!d)return [];
 let rows=[];
 if(p==='shopsavvy')rows=op==='tools'?(d.tools||[]).map(t=>({title:t.name,text:t.description,tool:t})):mcpItems(d.result);
 else if(p==='steam')rows=d.items||[];
 else if(p==='cheapshark'){
  if(op==='game')rows=(d.deals||[]).map(x=>({...x,title:d.info?.title,thumb:d.info?.thumb,steamAppID:d.info?.steamAppID,cheapestPriceEver:d.cheapestPriceEver,gameID:packet.args?.id}));
  else if(op==='deal')rows=[{...d.gameInfo,title:d.gameInfo?.name,thumb:d.gameInfo?.thumb,cheapestPriceEver:d.cheapestPrice,dealID:packet.args?.id},...(d.cheaperStores||[]).map(x=>({...x,title:d.gameInfo?.name}))];
  else rows=Array.isArray(d)?d:[];
 }else if(p==='serpapi')rows=op==='product'?(d.product_results?.stores||d.stores||[d.product_results||d]):[...(d.shopping_results||[]),...(d.inline_shopping_results||[]),...(d.categorized_shopping_results||[]).flatMap(x=>x.shopping_results||[])];
 else if(p==='itad'){
  if(op==='prices')rows=(Array.isArray(d)?d:[]).flatMap(g=>(g.deals||[]).map(x=>({...x,gameID:g.id,title:packet.contextTitle||x.shop?.name,source:x.shop?.name,link:x.url})));
  else if(op==='overview')rows=(d.prices||[]).map(g=>({...g,title:g.title||packet.contextTitle||g.id,price:g.current?.price,historyLow:g.lowest?.price,source:g.current?.shop?.name,link:g.current?.url}));
  else if(op==='history'&&Array.isArray(d))rows=d.map(x=>({...x,title:packet.contextTitle||x.shop?.name,price:x.deal?.price,cut:x.deal?.cut,source:x.shop?.name}));
  else if(Array.isArray(d))rows=d;
  else if(Array.isArray(d.list))rows=d.list;
  else if(d.game)rows=[d.game];
  else if(d.id||d.title)rows=[d];
 }else rows=Array.isArray(d)?d:[];
 return rows.filter(x=>x&&typeof x==='object').map(raw=>{
  const title=String(raw.title||raw.name||raw.storeName||raw.external||raw.gameInfo?.name||raw.appid||raw.id||'详情');
  const currency=p==='cheapshark'?'USD':raw.price?.currency||raw.currency||'';
  const price=raw.salePrice??raw.price??raw.cheapest??raw.current_price??raw.extracted_price;
  let url=raw.link||raw.url||raw.open_giveaway_url||raw.gamerpower_url||'';
  const dealID=raw.dealID||raw.cheapestDealID;
  if(p==='cheapshark'&&dealID){let id=String(dealID);try{id=decodeURIComponent(id)}catch{}url='https://www.cheapshark.com/redirect?dealID='+encodeURIComponent(id);}
  if(!url&&raw.steamAppID)url='https://store.steampowered.com/app/'+encodeURIComponent(raw.steamAppID)+'/';
  return {raw,title,productTitle,price:money(price,currency),currency,url:safeURL(url),image:safeURL(raw.thumbnail||raw.image||raw.image_url||raw.thumb||raw.assets?.boxart||raw.assets?.banner145||''),identifier:raw.identifier||raw.path||raw.asin||raw.barcode||raw.id||'',gameID:raw.gameID||(p==='itad'?raw.id:null),appid:raw.appid||raw.steamAppID,historyLow:money(raw.cheapestPriceEver?.price??raw.cheapestPriceEver??raw.historyLow??raw.lowest,currency),discount:raw.savings!==undefined?Number(raw.savings).toFixed(1)+'%':raw.cut!==undefined?raw.cut+'%':raw.discount||'',source:raw.source||raw.merchant||raw.shop?.name||(raw.storeID?'商店 #'+raw.storeID:''),rank:raw.rank,change:raw.change,isNew:raw.isNew,text:raw.text||raw.description||'',release:raw.release,checkedAt:raw.checkedAt||raw.timestamp||raw.lastChange};
 });
}
export function giveawayKind(item){const t=String(item.type||'').toLowerCase();if(t.includes('beta'))return 'Beta / 测试';if(t.includes('dlc'))return 'DLC';if(t.includes('loot'))return /\bdlc\b/i.test(item.title||'')?'DLC（Loot 分类）':'Loot / 道具（可能含 DLC）';return t==='game'?'完整游戏 · 权益以原文为准':t||'活动';}
