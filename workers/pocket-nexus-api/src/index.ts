type StockRow = { symbol:string; price:number; changePct:number; lastTradeAt:string|null };
type NewsRow = { title:string; publishedAt:number; source:string };

const STOCK_SOURCE = 'https://raw.githubusercontent.com/XiminHu66/stock-alert/main/data/quotes.json';
const WSCN_SOURCE = 'https://api-one-wscn.awtmt.com/apiv1/content/lives?channel=global-channel&client=pc&limit=24&first_page=true';
const WATCH = ['QQQ','SPY','SMH','NVDA','AMD','TSM','MSFT','GOOGL'];
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
    .replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});}
async function timedFetch(url:string,timeout=8000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{signal:controller.signal,headers:{'user-agent':'Pocket-Nexus/1.0','accept':'application/json'}});}
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

export default {
  async fetch(request:Request):Promise<Response>{
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
      if(url.pathname==='/api/brief'){
        const [stocksResult,newsResult]=await Promise.allSettled([loadStocks(),loadNews()]);
        return json({
          ok:true,
          generatedAt:new Date().toISOString(),
          stocks:stocksResult.status==='fulfilled'?stocksResult.value:null,
          news:newsResult.status==='fulfilled'?newsResult.value:[],
          errors:[stocksResult,newsResult].map((r,i)=>r.status==='rejected'?(i===0?'stocks':'news'):null).filter(Boolean)
        });
      }
      return json({error:'not_found'},404);
    }catch(error){
      return json({ok:false,error:error instanceof Error?error.message:'unknown_error'},502);
    }
  }
};
