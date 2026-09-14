type StockRow = { symbol:string; price:number; changePct:number; lastTradeAt:string|null };
type NewsRow = { title:string; publishedAt:number; source:string };
type WeatherRow = { location:string; temperature:number; apparent:number; humidity:number; wind:number; weatherCode:number };
type RssRow = { title:string; source:string; feedId:string };
type Env = { RSS_ORBIT:any };

const STOCK_SOURCE = 'https://raw.githubusercontent.com/XiminHu66/stock-alert/main/data/quotes.json';
const WSCN_SOURCE = 'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global-channel&client=pc&limit=24&first_page=true';
const WATCH = ['QQQ','SPY','SMH','NVDA','AMD','TSM','MSFT','GOOGL'];
const RSS_FEEDS = [
  {id:'wallstreetcn',name:'华尔街见闻'},
  {id:'ftchinese',name:'FT中文网'},
  {id:'techbang',name:'T客邦'},
  {id:'rfi-cn',name:'RFI中文'},
  {id:'bbc-zh',name:'BBC中文'},
  {id:'rthk',name:'香港电台'},
  {id:'sspai',name:'少数派'},
  {id:'ithome',name:'IT之家'},
  {id:'solidot',name:'Solidot'},
  {id:'appinn',name:'小众软件'},
  {id:'infoq-cn',name:'InfoQ中文'},
  {id:'gcores',name:'机核'}
] as const;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=60',
  'access-control-allow-origin': '*',
  'x-content-type-options': 'nosniff'
};

function cleanText(value:unknown){
  return String(value ?? '')
    .replace(/<[^>]*>/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'")
    .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/\s+/g,' ').trim();
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});}
async function timedFetch(url:string,timeout=8000,accept='application/json'){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{signal:controller.signal,headers:{'user-agent':'Pocket-Nexus/1.1','accept':accept}});}
  finally{clearTimeout(timer);}
}

async function loadStocks():Promise<{generatedAt:string|null;items:StockRow[]}> {
  const response=await timedFetch(STOCK_SOURCE);
  if(!response.ok)throw new Error(`stocks ${response.status}`);
  const data=await response.json() as any;
  const symbols=data?.symbols ?? {};
  const items:StockRow[]=WATCH.map(symbol=>{
    const row=symbols[symbol] ?? {};
    return {
      symbol,
      price:Number(row.price ?? 0),
      changePct:Number(row.changePct ?? 0),
      lastTradeAt:typeof row.lastTradeAt==='string'?row.lastTradeAt:null
    };
  }).filter(row=>Number.isFinite(row.price)&&row.price>0);
  return {generatedAt:typeof data?.generatedAt==='string'?data.generatedAt:null,items};
}

async function loadNews():Promise<NewsRow[]> {
  const response=await timedFetch(WSCN_SOURCE);
  if(!response.ok)throw new Error(`news ${response.status}`);
  const data=await response.json() as any;
  const sourceItems=Array.isArray(data?.data?.items)?data.data.items:[];
  return sourceItems.map((row:any)=>({
    title:cleanText(row?.content_text || row?.content || row?.title || ''),
    publishedAt:Number(row?.display_time || row?.created_at || 0),
    source:'华尔街见闻'
  })).filter((row:NewsRow)=>row.title.length>0).slice(0,8);
}

async function loadWeather(request:Request):Promise<WeatherRow> {
  const cf=(request as any).cf ?? {};
  const url=new URL(request.url);
  const lat=Number(url.searchParams.get('lat') ?? cf.latitude);
  const lon=Number(url.searchParams.get('lon') ?? cf.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('location_unavailable');
  const location=String(url.searchParams.get('name') ?? cf.city ?? '当前位置');
  const weatherUrl='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat)+
    '&longitude='+encodeURIComponent(lon)+
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';
  const response=await timedFetch(weatherUrl);
  if(!response.ok)throw new Error(`weather ${response.status}`);
  const data=await response.json() as any;
  const current=data?.current ?? {};
  return {
    location,
    temperature:Number(current.temperature_2m ?? 0),
    apparent:Number(current.apparent_temperature ?? 0),
    humidity:Number(current.relative_humidity_2m ?? 0),
    wind:Number(current.wind_speed_10m ?? 0),
    weatherCode:Number(current.weather_code ?? -1)
  };
}

function rssBlocks(xml:string){
  const itemMatches=[...xml.matchAll(/<item\b[\s\S]*?<\/item\s*>/gi)].map(match=>match[0]);
  if(itemMatches.length)return itemMatches;
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry\s*>/gi)].map(match=>match[0]);
}
function rssTag(block:string,tag:string){
  const safe=tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=block.match(new RegExp(`<${safe}\\b[^>]*>([\\s\\S]*?)<\\/${safe}\\s*>`,'i'));
  return cleanText(match?.[1] ?? '');
}
async function loadRandomRss(env:Env):Promise<RssRow>{
  if(!env?.RSS_ORBIT)throw new Error('rss_binding_missing');
  const seed=Math.floor(Math.random()*RSS_FEEDS.length);
  let lastError='rss_unavailable';
  for(let attempt=0;attempt<Math.min(5,RSS_FEEDS.length);attempt++){
    const feed=RSS_FEEDS[(seed+attempt)%RSS_FEEDS.length];
    try{
      const request=new Request(`https://rss-orbit.internal/feed/${feed.id}`,{
        headers:{'user-agent':'Pocket-Nexus/1.1','accept':'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'}
      });
      const response=await env.RSS_ORBIT.fetch(request);
      if(!response.ok)throw new Error(`rss_${response.status}`);
      const xml=await response.text();
      const blocks=rssBlocks(xml).slice(0,40);
      if(!blocks.length)throw new Error('rss_empty');
      const block=blocks[Math.floor(Math.random()*blocks.length)];
      const title=rssTag(block,'title');
      if(!title)throw new Error('rss_title_missing');
      return {title,source:feed.name,feedId:feed.id};
    }catch(error){lastError=error instanceof Error?error.message:'rss_unavailable';}
  }
  throw new Error(lastError);
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(request.method!=='GET')return json({error:'method_not_allowed'},405);
    try{
      if(url.pathname==='/'||url.pathname==='/health')return json({ok:true,service:'pocket-nexus-api',time:new Date().toISOString()});
      if(url.pathname==='/api/stocks'){
        const stocks=await loadStocks();
        return json({ok:true,...stocks});
      }
      if(url.pathname==='/api/news'){
        const items=await loadNews();
        return json({ok:true,generatedAt:new Date().toISOString(),items});
      }
      if(url.pathname==='/api/weather'){
        const weather=await loadWeather(request);
        return json({ok:true,generatedAt:new Date().toISOString(),...weather});
      }
      if(url.pathname==='/api/rss-random'){
        const item=await loadRandomRss(env);
        return json({ok:true,generatedAt:new Date().toISOString(),item});
      }
      if(url.pathname==='/api/brief'){
        const [stocksResult,newsResult,weatherResult]=await Promise.allSettled([loadStocks(),loadNews(),loadWeather(request)]);
        return json({
          ok:true,
          generatedAt:new Date().toISOString(),
          stocks:stocksResult.status==='fulfilled'?stocksResult.value:null,
          news:newsResult.status==='fulfilled'?newsResult.value:[],
          weather:weatherResult.status==='fulfilled'?weatherResult.value:null,
          errors:[stocksResult,newsResult,weatherResult].map((r,i)=>r.status==='rejected'?(['stocks','news','weather'][i]):null).filter(Boolean)
        });
      }
      return json({error:'not_found'},404);
    }catch(error){
      return json({ok:false,error:error instanceof Error?error.message:'unknown_error'},502);
    }
  }
};