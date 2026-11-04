export const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function periodKey(at,period){const d=new Date(at);return Number.isFinite(+d)?d.toISOString().slice(0,period==='month'?7:10):'';}
export function assess(q,now=Date.now(),red=85){
 const valid=finite(q.used)&&finite(q.limit)&&q.limit>0,at=Date.parse(q.observedAt),fresh=Number.isFinite(at)&&at<=now+60000&&now-at<=(q.maxAgeHours||24)*3600000;
 const same=q.period==='point'||periodKey(now,q.period)===periodKey(q.observedAt,q.period),ratio=valid?q.used/q.limit*100:null;
 let state=!valid?'unknown':!fresh||!same?'stale':ratio>=red?'danger':ratio>=70?'warning':q.lowerBound||q.coveragePartial?'unknown':'safe';
 let projected=null;
 if(valid&&fresh&&same&&q.cumulative&&q.period==='month'){
  const d=new Date(now),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1),sample=Date.parse(q.observedAt),elapsed=sample-start;
  if(elapsed>=86400000){projected=q.used/elapsed*(end-start);if(projected/q.limit*100>=red&&state==='safe')state='warning';}
 }
 return {state,ratio,projected,remaining:valid?Math.max(0,q.limit-q.used):null};
}
export function validateMeasurement(v,now=Date.now()){
 if(!finite(v.used)||!finite(v.limit)||v.limit<=0||!Number.isFinite(Date.parse(v.observedAt))||Date.parse(v.observedAt)>now+60000)throw Error('请输入有效的用量、正数上限和实际采样时间。');
 return {used:v.used,limit:v.limit,observedAt:new Date(v.observedAt).toISOString(),note:String(v.note||'').slice(0,180),source:'手动核对 · 当前浏览器'};
}
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:'#';}catch{return '#';}};
