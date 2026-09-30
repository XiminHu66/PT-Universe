import {fresh,metric,thesisState,num} from './models.mjs';
import {calculateAnalysis} from './technical.mjs';
export function csvRows(text){let rows=[],row=[],v='',quote=false;const s=text.replace(/^\uFEFF/,'');for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){v+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(v);v=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v);if(row.some(x=>x.trim()))rows.push(row);row=[];v=''}else v+=c}if(quote)throw Error('CSV 引号没有闭合');row.push(v);if(row.some(x=>x.trim()))rows.push(row);return rows;}
const norm=s=>s.toLowerCase().replace(/[\s_\-\/()%]/g,'');
const aliases={symbol:['symbol','ticker','stock','股票代码','代码'],quantity:['quantity','shares','qty','数量','持仓数量'],cost:['cost','averagecost','averagecostbasis','costbasispershare','avgcost','averageprice','每股成本','平均成本'],totalCost:['costbasistotal','totalcostbasis','costbasis','总成本'],description:['description','securitydescription','name','名称'],price:['lastprice','price','currentprice','最新价']};
const number=s=>{const t=String(s??'').trim();if(!t||/^(--|n\/a|pending)$/i.test(t))return null;const v=Number(t.replace(/[$,\s]/g,'').replace(/^\((.*)\)$/,'-$1'));return Number.isFinite(v)?v:null};
export function parsePortfolioCSV(text){const rows=csvRows(text);let header=-1,cols={};for(let i=0;i<Math.min(rows.length,30);i++){const ns=rows[i].map(norm),map={};for(const [k,values] of Object.entries(aliases))map[k]=ns.findIndex(x=>values.includes(x));if(map.symbol>=0&&map.quantity>=0){header=i;cols=map;break}}
if(header<0)throw Error('未找到 Symbol / Quantity 表头。支持 Fidelity 导出或 symbol,quantity,cost 格式。');const positions=new Map(),skipped=[],warnings=[];
for(let i=header+1;i<rows.length;i++){const r=rows[i],symbol=(r[cols.symbol]||'').trim().toUpperCase().replace(/\.([AB])$/,'-$1'),description=(r[cols.description]||'').trim(),quantity=number(r[cols.quantity]);if(!symbol&&!quantity)continue;
if(!/^[A-Z][A-Z0-9.\^-]{0,14}$/.test(symbol)||/\*\*|SPAXX|FDRXX|FCASH|CASH|MONEY MARKET/i.test(symbol+' '+description)||quantity===null||quantity===0){skipped.push({row:i+1,symbol,reason:'现金、期权、未成交、空行或无法识别的证券'});continue}if(quantity<0){skipped.push({row:i+1,symbol,reason:'空头持仓暂不按普通多头股票评估'});continue}
let cost=cols.cost>=0?number(r[cols.cost]):null;if(cost===null&&cols.totalCost>=0){const total=number(r[cols.totalCost]);if(total!==null)cost=total/quantity}if(cost!==null&&cost<0)cost=null;const existing=positions.get(symbol);if(existing){const total=existing.quantity+quantity;existing.cost=existing.cost!==null&&cost!==null?(existing.cost*existing.quantity+cost*quantity)/total:null;existing.quantity=total}else positions.set(symbol,{symbol,quantity,cost,description});if(cost===null)warnings.push(symbol+' 缺成本，盈亏不估算');}
if(!positions.size)throw Error('没有可导入的多头股票或 ETF；请检查表头、数量或导出类型。');return {positions:[...positions.values()],skipped,warnings:[...new Set(warnings)]};}
export function portfolioDecision(h,q,c,theses=[],now=Date.now()){
const reasons=[],evidence=[],p=num(q?.price),usable=p>0&&fresh(q?.lastTradeAt,96,now),a=q?calculateAnalysis(q.history||[],p):null;const result={state:'unknown',label:'数据不足',price:p,analysis:a,reasons,evidence};
if(!usable){reasons.push('报价缺失或超过 96 小时，暂停买卖信号');return result}if(!a||!a.sma50){reasons.push('历史交易日不足 50 日，暂停区间信号');return result}
if(q.currency&&q.currency!=='USD'){reasons.push('非 USD 报价，不能与当前导入成本直接比较');return result}
const last=q.history?.at(-1)?.d;if(!fresh(last,120,now)){reasons.push('日线历史过期，暂停区间信号');return result}
evidence.push('MA20 '+a.sma20.toFixed(2)+' / MA50 '+a.sma50.toFixed(2),'RSI14 '+a.rsi14.toFixed(1)+' / ATR14 '+a.atr.toFixed(2));
const latest=c?.quarters?.at(-1),financialOK=!!latest&&!c.stale&&fresh(c.updatedAt,96,now)&&fresh(latest.end,200*24,now);const broken=financialOK?theses.filter(t=>t.ticker===h.symbol&&thesisState(t,c,now).state==='broken'):[];let goodFundamentals=false;
if(financialOK){const yoy=metric(c,'revenueYoY');goodFundamentals=yoy!==null&&yoy>0&&latest.fcf>0&&latest.operatingIncome>0;evidence.push('财报截至 '+latest.end+' · 营收同比 '+(yoy===null?'缺失':yoy.toFixed(1)+'%')+' · FCF '+(latest.fcf===null?'缺失':(latest.fcf/1e6).toFixed(1)+'M'));}else evidence.push('基本面未取得新鲜完整证据，买入结论最多为技术候选');
const stop=a.buyLow-a.atr,below=p<stop||a.trendScore<=-3;
if(broken.length||below){result.state='sell';result.label=h.quantity>0?'风险卖出复查':'暂不买入';reasons.push(...broken.map(t=>'论点失效：'+t.title));if(below)reasons.push('跌破参考失效位或多条均线转弱；核对跳空、财报和自身持仓理由');}
else if(p>=a.sellLow||a.rsi14>=72){result.state='trim';result.label=h.quantity>0?'减仓 / 止盈候选':'等待回落';reasons.push(p>=a.sellLow?'已进入技术减仓参考区':'RSI 进入偏热区');}
else if(p>=a.buyLow&&p<=a.buyHigh&&a.trendScore>=0&&a.rsi14<60){result.state=goodFundamentals?'buy':financialOK?'wait':'candidate';result.label=goodFundamentals?'买入 / 加仓候选':financialOK?'基本面未通过，暂缓买入':'技术买入候选';reasons.push('价格位于支撑参考区，趋势未明显转弱');if(!goodFundamentals)reasons.push(financialOK?'营收同比、营业利润、自由现金流未同时为正或有缺项，暂缓买入':'先核对财报与持有理由，再考虑买入');}
else {result.state='wait';result.label=h.quantity>0&&a.trendScore>=1?'持有观察':'等待';reasons.push('价格尚未同时满足买入或减仓规则');}
result.buy=[a.buyLow,a.buyHigh];result.sell=[a.sellLow,a.sellHigh];result.invalidation=stop;result.financialOK=financialOK;return result;
}
export function disclosureLag(t){const a=Date.parse(t.transactionDate),b=Date.parse(t.disclosureDate);return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null}
