export const direction={up:'上升',down:'下降',same:'持平'};
const sign=(a,b)=>a>b?'up':a<b?'down':'same';
const finite=(...values)=>values.every(Number.isFinite);
const pct=n=>(n*100).toFixed(1)+'%';
export function questionPool(c){
 const q=c.quarters.at(-1),p=c.quarters.at(-2),out=[];
 const trend=(id,label,a,b,format=n=>n.toLocaleString('en-US'))=>{if(finite(a,b))out.push({id,label,options:direction,correct:sign(a,b),explanation:format(b)+' → '+format(a)})};
 const yesno=(id,label,condition,explanation)=>out.push({id,label,options:{yes:'是',no:'否'},correct:condition?'yes':'no',explanation});
 trend('revenue','最近一季营收环比',q.revenue,p.revenue);
 if(q.revenue>0&&p.revenue>0){
  if(finite(q.operatingIncome,p.operatingIncome))trend('margin','营业利润率环比',q.operatingIncome/q.revenue,p.operatingIncome/p.revenue,pct);
  if(finite(q.grossProfit,p.grossProfit))trend('gross','毛利率环比',q.grossProfit/q.revenue,p.grossProfit/p.revenue,pct);
  if(finite(q.sbc,p.sbc))trend('sbc','SBC 占营收比例环比',q.sbc/q.revenue,p.sbc/p.revenue,pct);
  if(finite(q.ocf,p.ocf))trend('cashMargin','经营现金流占营收比例环比',q.ocf/q.revenue,p.ocf/p.revenue,pct);
  if(finite(q.fcf,p.fcf))trend('fcfMargin','自由现金流占营收比例环比',q.fcf/q.revenue,p.fcf/p.revenue,pct);
 }
 if(finite(q.ocf,q.netIncome))yesno('cash','经营现金流是否高于净利润？',q.ocf>q.netIncome,'经营现金流 '+q.ocf.toLocaleString('en-US')+'；净利润 '+q.netIncome.toLocaleString('en-US'));
 if(finite(q.fcf))yesno('fcf','自由现金流是否为正？',q.fcf>0,'自由现金流 '+q.fcf.toLocaleString('en-US')+' = 经营现金流 − 资本支出');
 trend('shares','稀释加权平均股数环比',q.shares,p.shares);
 return out;
}
export function buildCases(companies){
 const out=[];
 for(const c of companies){
  const qs=[...c.quarters].sort((a,b)=>a.end.localeCompare(b.end));
  for(let end=1;end<qs.length;end++){
   const group=qs.slice(Math.max(0,end-3),end+1);
   if(!group.every((q,i)=>!i||Math.abs((Date.parse(q.end)-Date.parse(group[i-1].end))/86400000-91)<22))continue;
   const item={id:c.ticker+'-'+qs[end].end,ticker:c.ticker,name:c.name,quarters:group,next:qs[end+1]||null,sourceURL:c.sourceURL};
   if(questionPool(item).length>=3)out.push(item);
  }
 }
 return out;
}
export function valueSignature(quarters){return JSON.stringify(quarters.map(q=>Object.fromEntries(['end','revenue','operatingIncome','netIncome','grossProfit','ocf','capex','sbc','shares','fcf'].map(k=>[k,q[k]??null]))))}
export function shuffle(values){const copy=[...values];for(let i=copy.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
