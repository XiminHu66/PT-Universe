
export const $=s=>document.querySelector(s);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=s=>{try{const u=new URL(s,location.href);return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
export const link=(url,label)=>'<a href="'+esc(safeURL(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';
export const money=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):'—';
export const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
export const compact=n=>Number.isFinite(n)?(Math.abs(n)>=1e9?(n/1e9).toFixed(2)+'B':Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':n.toLocaleString('en-US')):'—';
export const change=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a-b)/Math.abs(b):null;
export const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const stamp=s=>s?new Date(s).toLocaleString('zh-CN',{timeZone:'America/Los_Angeles',hour12:false})+' PT':'尚无成功快照';
export function read(key,fallback){try{return JSON.parse(localStorage.getItem('ptu.labs.'+key))??fallback}catch{return fallback}}
export function save(key,v){try{localStorage.setItem('ptu.labs.'+key,JSON.stringify(v));return true}catch{toast('保存失败：本机存储不可用，请导出备份');return false}}
export function toast(text){document.querySelector('.toast')?.remove();const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=text;document.body.append(e);setTimeout(()=>e.remove(),3500)}
export async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('数据读取失败 HTTP '+r.status);return r.json()}
export function download(name,data,type='application/json'){const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export function backups(key,get,set){$('#export').onclick=()=>download(key+'-'+day()+'.json',{version:1,project:key,data:get()});$('#import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw new Error('文件过大');const v=JSON.parse(await file.text());if(v.version!==1||v.project!==key)throw new Error('请选择本项目导出的备份');set(v.data);toast('已导入')}catch(err){toast('导入失败：'+err.message)}finally{e.target.value=''}}}
export function expired(value,hours=36,now=Date.now()){const t=Date.parse(value);return !Number.isFinite(t)||t>now+300000||now-t>hours*3600000}
export function freshness(data,now=Date.now()){
 const hours=data.refresh?.maxAgeHours||36;
 const rows=(data.sources||[]).filter(s=>!s.optional);
 const failed=rows.filter(s=>!s.ok);
 const old=rows.filter(s=>expired(s.lastSuccessAt||(s.ok?data.updatedAt:null),hours,now));
 const overdue=expired(data.updatedAt,hours,now)||old.length>0;
 const state=overdue?'expired':failed.length?'partial':'ok';
 return {state,failed:failed.length,old:old.length,total:rows.length,hours};
}
export function health(data){const rows=data.sources||[],f=freshness(data);return '<details><summary>数据来源与运行状态 · '+(f.total-f.failed)+'/'+f.total+' 抓取成功</summary><div class="stack">'+rows.map(s=>{const last=s.lastSuccessAt||(s.ok?data.updatedAt:null),old=expired(last,f.hours),label=s.optional&&!s.ok?'备用源不可用':!s.ok?'获取失败／保留旧数据':old?'快照已过期':'正常';return '<div>'+(s.url?link(s.url,s.name):esc(s.name))+' <span class="'+(s.ok&&!old?'good':s.optional?'muted':'bad')+'">'+label+'</span><small> '+esc(s.error||s.count+' 条')+'</small><br><small>最近成功：'+esc(stamp(last))+' · 最近尝试：'+esc(stamp(s.checkedAt||data.attemptedAt))+'</small></div>'}).join('')+'</div><p class="muted">“最近成功”表示重新核对来源的时间，财报所属季度以表格日期为准。补跑只重试未成功的来源；读取快照不会启动抓取。</p></details>'}
let healthTimer;
export function meta(data){
 const draw=()=>{
  const f=freshness(data);$('#updated').textContent='最近取得新数据：'+stamp(data.updatedAt);
  $('#health').innerHTML=health(data);
  let banner=$('#freshness');if(!banner){banner=document.createElement('div');banner.id='freshness';banner.setAttribute('role','status');$('#app').before(banner)}
  banner.className='freshness '+f.state;banner.dataset.state=f.state;
  const title=f.state==='expired'?'数据已过期，请核对来源':f.state==='partial'?'部分来源更新失败，已保留旧数据':'数据更新正常';
  const detail=f.state==='ok'?'每日约 08:35 PT 更新；失败后自动重试并按小时补跑。':(f.failed?f.failed+' 个来源获取失败。':'')+(f.old?f.old+' 个来源超过 '+f.hours+' 小时未成功更新或尚无成功记录。':'')+'其他成功来源仍会独立更新。';
  banner.innerHTML='<strong>'+title+'</strong><span>'+esc(detail)+'</span><small>最近完整成功：'+esc(stamp(data.refresh?.lastCompleteAt))+' · 最近尝试：'+esc(stamp(data.refresh?.lastAttemptAt||data.attemptedAt))+'</small>';
 };
 draw();clearInterval(healthTimer);healthTimer=setInterval(draw,60000);
}
export function boot(){let t;try{t=JSON.parse(localStorage.getItem('ptu.theme'))}catch{}document.documentElement.dataset.theme=t||'light';$('#theme').onclick=()=>{const v=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=v;localStorage.setItem('ptu.theme',JSON.stringify(v))};$('#refresh').onclick=()=>{location.reload()};}
export const labels={revenue:'营收',operatingIncome:'营业利润',netIncome:'净利润',grossProfit:'毛利润',ocf:'经营现金流',capex:'资本支出',fcf:'自由现金流',sbc:'股权激励 SBC',shares:'稀释加权平均股数'};
export function financialTable(qs){return '<div class="table-wrap"><table><thead><tr><th>USD／股数</th>'+qs.map(q=>'<th>'+esc(q.end)+'</th>').join('')+'</tr></thead><tbody>'+Object.entries(labels).map(([k,l])=>'<tr><td>'+l+'</td>'+qs.map(q=>'<td>'+compact(q[k])+'</td>').join('')+'</tr>').join('')+'<tr><td>营业利润率</td>'+qs.map(q=>'<td>'+pct(q.revenue&&Number.isFinite(q.operatingIncome)?q.operatingIncome/q.revenue:null)+'</td>').join('')+'</tr></tbody></table></div>'}
export function bars(qs){const vs=qs.map(q=>q.revenue),max=Math.max(...vs.filter(Number.isFinite),1);return '<svg viewBox="0 0 640 160" class="chart" role="img" aria-label="季度营收柱状图">'+qs.map((q,i)=>{const w=600/qs.length,x=30+i*w,h=(q.revenue||0)/max*105;return '<rect x="'+x+'" y="'+(120-h)+'" width="'+Math.max(w-12,4)+'" height="'+h+'" rx="4"><title>'+esc(q.end)+' '+compact(q.revenue)+'</title></rect><text x="'+x+'" y="146">'+esc(q.end.slice(2))+'</text>'}).join('')+'</svg>'}
