import { normalizeFinancials } from './research';
const fields=['TotalRevenue','OperatingIncome','NetIncome','GrossProfit','OperatingCashFlow','CapitalExpenditure','StockBasedCompensation','DilutedAverageShares'];
async function upstream(url:string){const r=await fetch(url,{headers:{accept:'application/json','user-agent':'PTUniverseResearch/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('行情来源 HTTP '+r.status);const raw=await r.text();if(raw.length>2_000_000)throw Error('来源响应过大');return JSON.parse(raw)}
export async function investmentRoute(request:Request,env:Env){
 const u=new URL(request.url);if(u.pathname!=='/api/investment/quote')return null;
 if(request.method!=='GET')return {status:405,body:{error:'仅支持 GET'}};
 const symbol=(u.searchParams.get('symbol')||'').toUpperCase();if(!/^[A-Z^][A-Z0-9.^-]{0,14}$/.test(symbol))return {status:400,body:{error:'股票代码无效'}};
 const key='investment/quote/'+symbol,cached=await env.PT_UNIVERSE_DATA.get(key,'json');if(cached)return {body:cached};
 try{
 const ticker=encodeURIComponent(symbol.replace(/\.([AB])$/,'-$1')),raw=await upstream(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`),q=raw.chart?.result?.[0];if(!q?.meta?.regularMarketPrice)throw Error('未取得有效股票报价');
 const data=q.indicators?.quote?.[0]||{},history=(q.timestamp||[]).map((t:number,i:number)=>({d:new Date(t*1000).toISOString().slice(0,10),o:data.open?.[i],h:data.high?.[i],l:data.low?.[i],c:data.close?.[i],v:data.volume?.[i]})).filter((h:any)=>[h.o,h.h,h.l,h.c].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0));
 const quote={symbol,name:q.meta.longName||q.meta.shortName||symbol,currency:q.meta.currency,price:q.meta.regularMarketPrice,lastTradeAt:new Date(q.meta.regularMarketTime*1000).toISOString(),history,sourceURL:`https://finance.yahoo.com/quote/${ticker}/`,provider:'Yahoo Finance · 延迟报价',checkedAt:new Date().toISOString()};
 let company:any=null,financialError:string|null=null;
 if(q.meta.instrumentType!=='ETF'&&q.meta.instrumentType!=='INDEX')try{
  const fk='investment/financials/'+symbol;company=await env.PT_UNIVERSE_DATA.get(fk,'json');if(!company){const epoch=Math.floor(Date.now()/1000),f=await upstream(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}?type=${fields.map(x=>'quarterly'+x).join(',')}&period1=${epoch-3*366*86400}&period2=${epoch}`),quarters=normalizeFinancials(f,symbol);if(quarters.length<3)throw Error('有效季度不足');company={ticker:symbol,name:quote.name,quarters,updatedAt:new Date().toISOString(),sourceURL:`https://finance.yahoo.com/quote/${ticker}/financials/`,provider:'Yahoo Finance 标准化财报',stale:false};await env.PT_UNIVERSE_DATA.put(fk,JSON.stringify(company),{expirationTtl:21600})}
 }catch(e){financialError=String(e)}
 else financialError='ETF / 指数不套用公司营收与现金流规则';
 const body={quote,company,financialError};await env.PT_UNIVERSE_DATA.put(key,JSON.stringify(body),{expirationTtl:300});return {body};
 }catch(e){return {status:502,body:{error:String(e)}}}
}
