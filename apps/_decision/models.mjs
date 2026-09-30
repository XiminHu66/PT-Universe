// Pure decision rules. Missing or stale evidence never becomes a positive signal.
export const num = v => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
export const fresh = (at, hours = 36, now = Date.now()) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= now + 300000 && now - Date.parse(at) <= hours * 3600000;
export const dateIn = (at = Date.now(), zone = 'America/Los_Angeles') => new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export function metric(c, key) {
  const q=c?.quarters?.at(-1); if(!q) return null;
  const y=c.quarters.find(p=>Math.abs((Date.parse(q.end)-Date.parse(p.end))/86400000-365)<18);
  const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?a/b:null;
  if(key==='fcf') return Number.isFinite(q.fcf)?q.fcf/1e6:null;
  if(key==='margin'||key==='sbcRatio') {const v=ratio(q[key==='margin'?'operatingIncome':'sbc'],q.revenue);return v===null?null:v*100;}
  const k=key==='revenueYoY'?'revenue':key==='sharesYoY'?'shares':null;
  if(!k)return null;const v=ratio(q[k],y?.[k]);return v===null?null:(v-1)*100;
}
export function thesisState(t,c,now=Date.now()) {
  const v=metric(c,t.metric);
  if(v===null||c?.stale||!fresh(c?.updatedAt,36,now))return {state:'unknown',value:v};
  return {state:(t.op==='gte'?v>=t.threshold:v<=t.threshold)?'met':'broken',value:v};
}
export function holdingReview(h, quote, company, theses, weight, now=Date.now()) {
  const reasons=[], usable=num(quote?.price)>0&&fresh(quote?.lastTradeAt,96,now);
  const price=usable?num(quote.price):null;
  const prev=h.reviews?.at(-1);
  if(!usable)reasons.push({key:'quote-missing',text:'行情缺失或超过 96 小时，先核对报价',kind:'unknown'});
  else {
    if(num(h.lower)!==null&&price<=h.lower)reasons.push({key:'lower',text:`触及复查下界 ${h.lower}`,kind:'review'});
    if(num(h.upper)!==null&&price>=h.upper)reasons.push({key:'upper',text:`触及复查上界 ${h.upper}`,kind:'review'});
    if(prev?.price>0&&Math.abs(price/prev.price-1)*100>=h.movePct)reasons.push({key:'move',text:`较上次复查变动 ${((price/prev.price-1)*100).toFixed(1)}%`,kind:'review'});
  }
  if(num(weight)!==null&&num(h.maxWeight)!==null&&weight>h.maxWeight)reasons.push({key:'weight',text:`已录入股票仓位占比 ${weight.toFixed(1)}%，超过 ${h.maxWeight}%`,kind:'review'});
  if(h.reviewDate&&h.reviewDate<=dateIn(now))reasons.push({key:'due',text:'已到计划复查日',kind:'review'});
  if(!prev)reasons.push({key:'first',text:'尚未记录初次判断',kind:'review'});
  if(company?.quarters?.at(-1)?.end&&prev?.quarter&&company.quarters.at(-1).end!==prev.quarter)reasons.push({key:'quarter',text:`新季度财报：${company.quarters.at(-1).end}`,kind:'review'});
  for(const t of theses.filter(t=>t.ticker===h.symbol)) {
    const s=thesisState(t,company,now);
    if(s.state!=='met')reasons.push({key:'thesis-'+t.id,text:`${t.title}：${s.state==='unknown'?'证据待确认':'条件未满足'}`,kind:s.state==='unknown'?'unknown':'review'});
  }
  return {price,reasons,quarter:company?.quarters?.at(-1)?.end||null,thesis:theses.filter(t=>t.ticker===h.symbol).map(t=>({title:t.title,...thesisState(t,company,now)}))};
}
export function purchaseState(c, now=Date.now()) {
  const o=c.observations?.at(-1);
  if(c.status==='purchased')return {state:'done',text:'已购买'};
  if(c.snoozeUntil&&c.snoozeUntil>dateIn(now))return {state:'snooze',text:'暂缓至 '+c.snoozeUntil};
  if(!o||!fresh(o.at,72,now))return {state:'unknown',text:'需要新的价格证据'};
  if(o.currency!==c.currency)return {state:'unknown',text:'币种不同，不能直接比较'};
  if(c.variant&&o.variant.trim().toLowerCase()!==c.variant.trim().toLowerCase())return {state:'unknown',text:'版本不符或尚未确认'};
  if(c.compatibility!=='yes')return {state:'unknown',text:c.compatibility==='no'?'不兼容':'兼容性待确认'};
  if(!(num(o.price)>0))return {state:'unknown',text:'价格无效'};
  return o.price<=c.target?{state:'ready',text:'满足候选购买条件'}:{state:'wait',text:'继续等价 · 差 '+(o.price-c.target).toFixed(2)+' '+c.currency};
}
export function watchCheck(w, before, after) {
  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
  if(!before)return {state:'baseline',text:'已建立基线，下一次内容与此比较'};
  if(normalize(before.text)===normalize(after.text))return {state:'unchanged',text:'正文无变化'};
  if(w.rule==='change')return {state:'review',text:'内容有变化，请对照等待条件确认'};
  const match=s=>w.rule==='contains'?normalize(s).toLowerCase().includes(w.value.toLowerCase()):w.rule==='absent'?!normalize(s).toLowerCase().includes(w.value.toLowerCase()):false;
  if(['contains','absent'].includes(w.rule))return match(after.text)?{state:match(before.text)?'noise':'matched',text:match(before.text)?'条件此前已满足，未发生新的触发':'等待条件新近满足'}:{state:'noise',text:'内容变化，但未满足等待条件'};
  // Numeric checks require a capture group in a user-provided label pattern? No regex execution:
  // the entire observation must be a numeric value, preventing prices/dates from being guessed.
  const a=num(after.text.trim()),b=num(before.text.trim()),v=num(w.value);
  if(a===null||v===null)return {state:'unknown',text:'数值规则只接受一个纯数字，请粘贴目标字段的值'};
  const ok=n=>n!==null&&(w.rule==='lte'?n<=v:n>=v);
  return {state:ok(a)&&!ok(b)?'matched':ok(a)?'noise':'noise',text:ok(a)&&!ok(b)?'数值新近达到阈值':ok(a)?'仍满足阈值，没有新的触发':'尚未达到阈值'};
}
export function diffLines(before,after) {
  const a=[...new Set(String(before||'').split(/\n/).map(s=>s.trim()).filter(Boolean))],b=[...new Set(String(after||'').split(/\n/).map(s=>s.trim()).filter(Boolean))];
  return {added:b.filter(s=>!a.includes(s)),removed:a.filter(s=>!b.includes(s))};
}
export function signalResult(s, market, now=Date.now()) {
  if(s.method!=='next-open')return {state:'unscored',text:'仅观察：原信号条件不适合统一日线评估'};
  const item=market.symbols?.[s.symbol];if(!item)return {state:'missing',text:'快照未覆盖此标的'};
  const published=Date.parse(s.publishedAt);if(!Number.isFinite(published))return {state:'missing',text:'发出时间无效'};
  const pubDay=dateIn(published,'America/New_York');
  const today=dateIn(now,'America/New_York');
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  // Exclude unfinished daily bars and always enter AFTER publication's NY calendar date.
  const bars=(item.history||[]).filter(b=>b.d>pubDay&&(b.d<today||(b.d===today&&hour>=17))&&b.o>0&&b.c>0).sort((a,b)=>a.d.localeCompare(b.d));
  const all=(item.history||[]).map(b=>b.d).sort();
  if(all.length&&pubDay<all[0])return {state:'missing',text:'信号早于可用行情历史，不能猜测入场日'};
  if(!bars.length)return {state:'pending',text:'等待发出后首个完整交易日'};
  const first=bars[0], window=bars.slice(0,s.horizon),last=window.at(-1),sign=s.direction==='short'?-1:1;
  const ret=(last.c/first.o-1)*100*sign;
  const retrospective=Date.parse(s.recordedAt)>published+24*3600000||dateIn(s.recordedAt,'America/New_York')>=first.d;
  const benchmark=market.symbols?.SPY?.history||[],bs=benchmark.find(b=>b.d===first.d),be=benchmark.find(b=>b.d===last.d);
  const benchmarkReturn=bs?.o>0&&be?.c>0?(be.c/bs.o-1)*100:null;
  const adverse=Math.min(0,...window.map(b=>((s.direction==='short'?b.h:b.l)/first.o-1)*100*sign).filter(Number.isFinite));
  return {state:window.length>=s.horizon?'complete':'tracking',text:window.length>=s.horizon?'观察窗口完成':`跟踪中 ${window.length}/${s.horizon} 交易日`,entry:first.o,entryDate:first.d,exit:last.c,exitDate:last.d,returnPct:ret,adverse,benchmarkReturn,retrospective,sourceAt:market.generatedAt};
}
export function signalSummary(rows) {
  const completed=rows.filter(r=>r.result.state==='complete'&&!r.result.retrospective),retrospective=rows.filter(r=>r.result.retrospective);
  return {total:rows.length,completed:completed.length,retrospective:retrospective.length,pending:rows.filter(r=>['pending','tracking'].includes(r.result.state)).length,unscored:rows.filter(r=>['unscored','missing'].includes(r.result.state)).length,wins:completed.filter(r=>r.result.returnPct>0).length,average:completed.length?completed.reduce((a,r)=>a+r.result.returnPct,0)/completed.length:null};
}
export function planEvents(events, {date,city,freeOnly,start=10,hours=4,query=''}) {
  return events.filter(e=>e.start?.slice(0,10)===date&&(!city||e.city===city)&&(!freeOnly||e.free)&&!e.stale&&(!query||[e.title,e.category,e.description].join(' ').toLowerCase().includes(query.toLowerCase())))
    .filter(e=>{if(e.start.length<16)return true;const mins=Number(e.start.slice(11,13))*60+Number(e.start.slice(14,16));return mins>=start*60&&mins+150<=(start+hours)*60;})
    .sort((a,b)=>Number(b.free)-Number(a.free)||a.start.localeCompare(b.start));
}
