import {actionsQuotas} from './actions-usage.mjs?v=4';
import {overviewHTML,automaticHTML,coverageHTML,fmt,date} from './view.mjs?v=5';
import {assess,validateMeasurement,esc,safeURL,finite} from './model.mjs?v=3';
import {readPublicGithub} from './public-reader.mjs';
import {RESOURCE_API,resourceSession,connectResources,clearResourceSession,returningToNexus} from './auth.mjs?v=2';
const EMBEDDED=new URL(location.href).searchParams.get('embedded')==='nexus'&&window.parent!==window;
const VIEWS=['overview','workflows','projects','settings'],requested=new URL(location.href).searchParams.get('view');
if(EMBEDDED){document.documentElement.dataset.embedded='nexus';try{window.ptNexusActive=window.parent.document.body.dataset.nexusView==='monitor'&&!window.parent.document.hidden;}catch{window.ptNexusActive=false;}}
const active=()=>!returningToNexus&&!document.hidden&&(!EMBEDDED||window.ptNexusActive!==false);
const requests=new Set();
let activityEpoch=0,paused=false,resumePending=false,connecting=false;
const $=s=>document.querySelector(s),KEY='pt.resources.v4',TTL=5*60000;
let PRIVATE=!!resourceSession();
const read=()=>{try{const current=localStorage.getItem(KEY);if(current)return JSON.parse(current);const prior=JSON.parse(localStorage.getItem('pt.resources.v3')||'{}');if(prior.auto)delete prior.auto['github-billing'];return prior;}catch{return {}}};
let saved=read(),data=null,view=VIEWS.includes(requested)?requested:EMBEDDED?'overview':VIEWS.includes(saved.view)?saved.view:'overview',editing='',busy=false,autoBusy=false,lastAuto=0;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved));return true}catch{$('#notice').textContent='浏览器存储不可用；此次数据仅保留到关闭页面。';return false}};
const link=(url,text)=>`<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
const labels={safe:'余量充足',warning:'需要留意',danger:'危险区',stale:'采样已过期',unknown:'用量待核实'};
function quotaRows(){const order=['GitHub Actions','Oracle VPS','Cloudflare'];const rows=(data?.quotas||[]).filter(q=>!['gh-compute','gh-storage'].includes(q.id)).map(q=>{const m=saved.measurements?.[q.id];return m&&Date.parse(m.observedAt)>Date.parse(q.observedAt||'1970-01-01')?{...q,...m}:q;});return [...(data?actionsQuotas(data):[]),...rows].sort((a,b)=>order.indexOf(a.provider)-order.indexOf(b.provider));}
function overview(){return overviewHTML(data,quotaRows(),saved.red||85);}
function workflowView(){return `<div class="section-head"><div><h2>全部工作流</h2><p>查看触发方式、运行平台与产物保留；自动读取名称与状态 · 触发规则保留源码盘点时间</p></div></div><div class="filters"><input type="search" id="wf-search" aria-label="搜索工作流" placeholder="搜索仓库、工作流或触发方式…"><select id="wf-filter" aria-label="筛选触发方式"><option value="all">全部触发方式</option><option value="schedule">有定时触发</option><option value="windows">包含 Windows</option><option value="disabled">已停用</option></select></div><div class="table-wrap"><table><thead><tr><th>仓库 / 工作流</th><th>触发与状态</th><th>运行平台 / 超时</th><th>产物保留</th><th>入口</th></tr></thead><tbody id="wf-body"></tbody></table></div>`;}
function filterWorkflows(){const needle=$('#wf-search').value.trim().toLowerCase(),filter=$('#wf-filter').value;const rows=data.repositories.flatMap(r=>r.workflows.map(w=>({...w,repo:r.name}))).filter(w=>JSON.stringify(w).toLowerCase().includes(needle)&&(filter==='all'||filter==='schedule'&&w.crons?.length||filter==='windows'&&w.runners?.some(r=>r.includes('windows'))||filter==='disabled'&&w.state?.startsWith('disabled')));$('#wf-body').innerHTML=rows.map(w=>`<tr><td><strong>${esc(w.name)}</strong><small>${esc(w.repo)} · ${esc(w.path)}</small></td><td>${esc(w.state==='active'?'启用':w.state==='source_verified'?'源码已核对 · 运行状态未读取':w.state||'运行状态未读取')}<small>${esc((w.events||[]).join(' · ')||'供应商托管')}</small>${(w.crons||[]).map(c=>`<code>${esc(c)}</code><br>`).join('')}${w.note?`<small>${esc(w.note)}</small>`:''}</td><td>${esc((w.runners||[]).join(', ')||'未取得')}<small>${esc(w.timeout||'未取得')}</small></td><td>${esc(w.retention||'无上传 / 未取得')}</td><td>${link(w.url,'查看')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">没有符合条件的工作流</td></tr>';}
function projectView(){return `<div class="filters"><input id="project-search" type="search" aria-label="搜索项目" placeholder="搜索仓库或服务…"><select id="project-filter" aria-label="筛选项目"><option value="resources">计费资源</option><option value="GitHub">GitHub 仓库</option><option value="Cloudflare">Cloudflare</option><option value="VPS">Oracle VPS</option><option value="Pages">静态子页面</option></select><select id="project-sort" aria-label="项目排序"><option value="storage">占用最多优先</option><option value="workflows">工作流最多优先</option><option value="name">按名称</option></select></div><p class="muted">静态子页面不单独消耗运行额度，已收在筛选中。产物和缓存与月度账单分开计算。</p><div class="table-wrap"><table><thead><tr><th>项目</th><th>资源 / 状态</th><th>采样时间</th><th>入口</th></tr></thead><tbody id="project-body"></tbody></table></div>`;}
function filterProjects(){const term=$('#project-search').value.trim().toLowerCase(),platform=$('#project-filter').value,sort=$('#project-sort').value;const items=[...data.repositories.map(r=>({name:r.name,platform:'GitHub',note:r.visibility==='private'?'私有':'公开',workflows:r.workflows.length,bytes:(r.artifacts?.bytes||0)+(r.cache?.bytes||0),detail:(r.artifacts?`产物 ${fmt(r.artifacts.bytes/1024**2)} MiB${r.artifacts.partial?'（部分分页）':''}`:r.workflows.length?'产物未取得':'无工作流')+(r.cache?` · 缓存 ${fmt(r.cache.bytes/1024**2)} MiB`:''),observedAt:r.artifacts?.observedAt||r.cache?.observedAt||r.inventoryObservedAt,url:r.url})),...(data.projects||[])].filter(p=>(platform==='resources'?p.platform!=='Pages':p.platform===platform)&&JSON.stringify(p).toLowerCase().includes(term));items.sort((a,b)=>sort==='storage'?(b.bytes||0)-(a.bytes||0)||a.name.localeCompare(b.name):sort==='workflows'?(b.workflows||0)-(a.workflows||0)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));$('#project-body').innerHTML=items.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.platform)}${p.note?' · '+esc(p.note):''}</small></td><td>${esc(p.detail?.replace('线上账户列表与实际用量未连接','部署清单来自配置；用量见总览')||'仅配置盘点；未验证在线')}${p.platform==='GitHub'?`<small>${p.workflows} 个工作流</small>`:''}</td><td><small>${p.observedAt?date(p.observedAt):'配置盘点 '+date(data.generatedAt)}</small></td><td>${p.url?link(p.url,'查看'):''}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">没有符合条件的项目</td></tr>';}
function settingsView(){return automaticHTML(data)+coverageHTML(data,quotaRows(),saved.red||85)+`<div class="settings-grid"><section class="panel"><h2>预警</h2><label>红线（已用百分比）<input id="red-setting" type="number" min="71" max="99" value="${saved.red||85}"></label><p>70% 标黄，默认 85% 标红。未知、过期和不完整数据不会判为安全。Cloudflare 上限为 Free 套餐参考；Actions 按私有运行用量折算额度，公共标准运行单列；计算额度与存储分别判断。</p></section><section class="panel"><h2>更新与授权</h2><p>打开监控后自动连接；页面可见时每五分钟检查，离开暂停。清单缓存六小时，用量缓存一小时，Browser 历史缓存十五分钟。无新增定时任务、模型或 Actions 调用。</p><a href="./setup.html">授权设置 / 更换 Token →</a><button class="text-button" id="reconnect">重新连接身份</button></section></div><details class="panel" data-disclosure="local-data"><summary>本机核对值与导出</summary><p>手动值只保存在此浏览器；导出可能包含私有仓库资料。</p><div class="actions"><button id="export">导出快照</button><button id="import">导入核对值</button><input type="file" id="import-file" accept="application/json" hidden><button id="reset">清除核对值</button></div></details>`;}
const filters={};
function render(){if(!data)return;
 for(const id of ['wf-search','wf-filter','project-search','project-filter','project-sort'])if($('#'+id))filters[id]=$('#'+id).value;
 const open=[...document.querySelectorAll('details[open][data-disclosure]')].map(e=>e.dataset.disclosure);
 $('#workspace').innerHTML=({overview,workflows:workflowView,projects:projectView,settings:settingsView})[view]();
 for(const [id,value]of Object.entries(filters))if($('#'+id))$('#'+id).value=value;
 for(const d of document.querySelectorAll('details[data-disclosure]'))if(open.includes(d.dataset.disclosure))d.open=true;
 $('#page-title').textContent=({overview:'资源概览',workflows:'工作流',projects:'项目与占用',settings:'读取检查'})[view];$('#red-label').textContent=saved.red||85;
 $('#connect').hidden=PRIVATE;$('#setup-link').hidden=PRIVATE;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
 document.querySelectorAll('[data-view-link]').forEach(b=>b.onclick=()=>setView(b.dataset.viewLink));
 document.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>{const id=b.dataset.inspect;setView('settings');const d=document.querySelector('[data-disclosure="coverage"]');if(d)d.open=true;const row=[...document.querySelectorAll('[data-metric-id]')].find(e=>e.dataset.metricId===id);row?.scrollIntoView({block:'center'});row?.classList.add('inspected');});
 if(view==='workflows'){filterWorkflows();$('#wf-search').oninput=filterWorkflows;$('#wf-filter').onchange=filterWorkflows;}
 if(view==='projects'){filterProjects();$('#project-search').oninput=filterProjects;$('#project-filter').onchange=filterProjects;$('#project-sort').onchange=filterProjects;}
 if(view==='settings')bindSettings();}
function setView(next){if(!['overview','workflows','projects','settings'].includes(next))return;view=next;if(!EMBEDDED){saved.view=view;persist();}else window.parent.postMessage({type:'pt-resource-view',view},location.origin);render();}
function bindSettings(){
 $('#reconnect').onclick=()=>$('#connect').click();
 $('#red-setting').onchange=e=>{const n=Number(e.target.value);if(n>=71&&n<=99){saved.red=n;persist();$('#red-label').textContent=n;}};
 $('#export').onclick=()=>{const blob=new Blob([JSON.stringify({...data,quotas:quotaRows()},null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='pt-resource-snapshot.json';a.click();URL.revokeObjectURL(u);};
 $('#import').onclick=()=>$('#import-file').click();$('#import-file').onchange=async e=>{try{const f=e.target.files[0];if(!f||f.size>2000000)throw Error('请选择小于 2 MB 的 JSON 快照。');const d=JSON.parse(await f.text());if(!Array.isArray(d.quotas))throw Error('文件缺少 quotas 字段。');const next={...saved.measurements};for(const q of d.quotas){if(!data.quotas.some(x=>x.id===q.id)||q.used===null)continue;next[q.id]=validateMeasurement(q);}saved.measurements=next;persist();$('#notice').textContent='已导入核对值，仅保存在此浏览器。';}catch(e){$('#notice').textContent=e.message;}};
 $('#reset').onclick=()=>{saved.measurements={};persist();$('#notice').textContent='已清除当前浏览器的手动核对值；来源快照保留。';render();};
}
function applyAutomatic(packet){
 const provider=packet.status?.provider;if(provider){data.automatic={...data.automatic,[provider]:packet.status};}
 for(const row of packet.repositories||[]){const prior=data.repositories.find(r=>r.name===row.name);if(prior)Object.assign(prior,row);else if(Array.isArray(row.workflows))data.repositories.push(row);}
 for(const row of packet.quotas||[]){const q=data.quotas.find(q=>q.id===row.id);if(q&&finite(row.used))Object.assign(q,row);}
 if(packet.billing)data.billing=packet.billing;
 if(packet.actionUsage)data.actionUsage=packet.actionUsage;
}
async function refreshAutomatic(force=false){
 if(!active()||!PRIVATE||!data||autoBusy)return;autoBusy=true;const epoch=activityEpoch;
 const providers=['github-inventory','github-storage','github-billing','cloudflare','browser'];
 try{const results=await Promise.allSettled(providers.map(async provider=>{
  const cached=saved.auto?.[provider];if(!force&&cached&&Date.now()-cached.fetchedAt<15*60000)return cached.packet;
  const packet=await getJSON(RESOURCE_API+(provider==='browser'?'/browser':'/auto?provider='+provider),45000);saved.auto={...saved.auto,[provider]:{fetchedAt:Date.now(),packet}};return packet;
 }));
 if(!active()||epoch!==activityEpoch)return;
 if(results.slice(0,2).some(r=>r.status!=='fulfilled'||r.value.status?.state==='unavailable')&&data.connections?.find(c=>c.id==='github')?.mode.includes('公开')){
  try{let fallback=saved.publicAuto;if(!fallback||Date.now()-fallback.fetchedAt>3600000){fallback={packet:await readPublicGithub(data.repositories),fetchedAt:Date.now()};saved.publicAuto=fallback;}
   results[0]={status:'fulfilled',value:fallback.packet.inventory};results[1]={status:'fulfilled',value:fallback.packet.storage};
  }catch{ /* Keep the dated source snapshot if public REST is also unavailable. */ }
 }
 // Inventory and storage can finish in either order; always apply metadata first.
 for(const [i,r]of results.entries())if(r.status==='fulfilled')applyAutomatic(r.value);else data.automatic={...data.automatic,[providers[i]]:{provider:providers[i],state:'unavailable',checkedAt:new Date().toISOString(),error:'request_failed',observedAt:data.automatic?.[providers[i]]?.observedAt}};
 const connected=results.filter(r=>r.status==='fulfilled'&&['ok','partial'].includes(r.value.status?.state)).length,needs=results.filter(r=>r.status==='fulfilled'&&r.value.status?.state==='needs_authorization').length;
 lastAuto=Date.now();persist();render();$('#notice').textContent=`自动检查完成：${connected} 项已自动更新${needs?' · '+needs+' 项需要一次性授权':''} · 已保留各项采样时间`;
 }catch{$('#notice').textContent='自动检查暂不可用，已保留上次数据和采样时间。';}
 finally{autoBusy=false;if(resumePending&&active()){resumePending=false;queueMicrotask(()=>refresh());}}
}
function openEdit(id){const q=quotaRows().find(q=>q.id===id);editing=id;$('#edit-title').textContent=q.name+' · '+q.unit;$('#used').value=q.used??'';$('#limit').value=q.limit??'';const d=q.observedAt?new Date(q.observedAt):new Date();$('#observed').value=new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);$('#note').value=q.note||'';$('#edit-error').textContent='';$('#edit-dialog').showModal();}
$('#close-edit').onclick=()=>$('#edit-dialog').close();$('#clear-edit').onclick=()=>{delete saved.measurements?.[editing];persist();$('#edit-dialog').close();render();};
$('#edit-form').onsubmit=e=>{e.preventDefault();try{const m=validateMeasurement({used:Number($('#used').value),limit:Number($('#limit').value),observedAt:new Date($('#observed').value).toISOString(),note:$('#note').value});saved.measurements={...saved.measurements,[editing]:m};persist();$('#edit-dialog').close();render();}catch(e){$('#edit-error').textContent=e.message;}};
async function getJSON(url,timeout=14000){
 if(!active())throw new DOMException('页面已暂停','AbortError');const controller=new AbortController();requests.add(controller);
 try{const secured=url.startsWith(RESOURCE_API),r=await fetch(url,{credentials:'omit',headers:secured?{authorization:'Bearer '+resourceSession()}:{},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)])});if(r.status===401&&secured){clearResourceSession();PRIVATE=false;$('#connect').hidden=false;throw Error('后台连接已过期，正在恢复连接。');}if(!r.ok)throw Object.assign(Error('读取失败（'+r.status+'）'),{status:r.status});return await r.json();}finally{requests.delete(controller);}
}
async function refreshRepo(button){if(busy)return;const name=button.dataset.repo;button.disabled=true;busy=true;try{const d=await getJSON('https://api.github.com/repos/XiminHu66/'+encodeURIComponent(name)+'/actions/artifacts?per_page=100'),rows=(d.artifacts||[]).filter(x=>!x.expired);const r=data.repositories.find(r=>r.name===name);r.artifacts={bytes:rows.reduce((n,x)=>n+x.size_in_bytes,0),count:rows.length,partial:d.total_count>100,observedAt:new Date().toISOString()};saved.repos={...saved.repos,[name]:r.artifacts};persist();filterProjects();$('#notice').textContent=name+' 的产物占用已读取；月度账单未改变。';}catch(e){$('#notice').textContent=e.message+'；已保留上次数据。';button.disabled=false;}finally{busy=false;}}
function applyVps(raw,status){const m=raw;if(!Number.isFinite(Date.parse(m?.sampleAt))||!finite(m.memory?.totalBytes)||m.memory.totalBytes<=0||!finite(m.disk?.totalBytes)||m.disk.totalBytes<=0||!finite(m.memory?.usedBytes)||!finite(m.disk?.usedBytes))throw Object.assign(Error('服务器返回的采样不完整。'),{code:'invalid_sample'});data.vpsServices=status?.items||[];data.vpsStatus={state:m.stale===true||Date.now()-Date.parse(m.sampleAt)>180000?'last_good':'ok',observedAt:m.sampleAt};const at=m.sampleAt,defs=[['vps-memory',m.memory.usedBytes/1024**3,m.memory.totalBytes/1024**3],['vps-disk',m.disk.usedBytes/1024**3,m.disk.totalBytes/1024**3],['vps-cpu',m.cpu?.percent,100]];for(const [id,used,limit]of defs){if(!finite(used)||!finite(limit)||!limit)continue;const q=data.quotas.find(q=>q.id===id);if(q)Object.assign(q,{used,limit,observedAt:at,source:'VPS 现有采样接口'});}
 for(const p of data.projects||[]){if(p.service){const s=status?.items?.find(s=>s.name===p.service);if(s)p.detail='本次状态：'+(s.ok?'在线':'不可用')+' · '+date(at);}}
}
// Ignore work canceled by visibility changes; retry only transient reads, once.
async function readVps(epoch){
 for(let attempt=0;attempt<2;attempt++){
  try{return await getJSON(RESOURCE_API+'/vps',22000);}catch(e){
   if(!active()||epoch!==activityEpoch||e.name==='AbortError'||e.status===401)throw e;
   if(attempt||!(e.name==='TimeoutError'||e.name==='TypeError'||[408,502,503,504].includes(e.status)))throw e;
  }
 }
}
function vpsFailure(e){return e.name==='TimeoutError'?'连接超时，重试后仍未成功':e.name==='TypeError'?'网络暂不可达，重试后仍未成功':e.code==='invalid_sample'?'采样缺少必要字段，已保留上次数据':e.status?'采样接口暂不可用（'+e.status+'），已保留上次数据':'采样暂不可用，已保留上次数据';}
function connectBackend(manual=false){
 if(connecting||!active())return;
 $('#notice').textContent='正在自动连接资源后台…';connecting=true;
 try{
  const result=connectResources(manual,EMBEDDED?view:null);
  if(result?.then)result.then(()=>{connecting=false;const wasPrivate=PRIVATE;PRIVATE=!!resourceSession();if(!PRIVATE)throw Error('连接尚未完成，请重试连接。');if(!wasPrivate)data=null;delete document.documentElement.dataset.connectionRequired;notifyHost();if(active())void refresh();}).catch(e=>{connecting=false;document.documentElement.dataset.connectionRequired='true';$('#notice').textContent=e.message;notifyHost();});
 }catch(e){connecting=false;document.documentElement.dataset.connectionRequired='true';$('#notice').textContent=e.message;}
}
function notifyHost(){if(EMBEDDED)window.parent.postMessage({type:'pt-resource-status',connected:PRIVATE,busy:busy||autoBusy,connecting,message:$('#notice').textContent},location.origin);}
async function refresh(force=false){if(!active()||busy||autoBusy||connecting)return;busy=true;const startedPrivate=PRIVATE,epoch=activityEpoch;$('#refresh').disabled=true;$('#refresh').textContent='正在检查…';try{
 PRIVATE=!!resourceSession();
 if(!PRIVATE){connectBackend(force);if(connecting)return;}
 if(!data){data=await getJSON(PRIVATE?RESOURCE_API+'/data':'./public.json');for(const r of data.repositories){if(saved.repos?.[r.name])r.artifacts=saved.repos[r.name];}render();}
 if(!PRIVATE){$('#public-banner').hidden=false;return;}
 if(force){const fresh=await getJSON(RESOURCE_API+'/data');data.connections=fresh.connections;}
 $('#public-banner').hidden=true;
 const cache=saved.vps;
 if(!force&&cache&&Date.now()-cache.fetchedAt<TTL&&!cache.metrics?.stale&&Date.now()-Date.parse(cache.metrics?.sampleAt)<180000){applyVps(cache.metrics,cache.status);$('#notice').textContent='已复用最近一次 VPS 采样。';}
 else{try{const m=await readVps(epoch);if(!active()||epoch!==activityEpoch)return;const status={items:m.services};applyVps(m,status);saved.vps={metrics:m,status,fetchedAt:Date.now()};persist();$('#notice').textContent='VPS 已读取；正在自动检查 GitHub 与 Cloudflare。';}catch(e){if(!active()||epoch!==activityEpoch||e.name==='AbortError')return;if(cache){try{applyVps(cache.metrics,cache.status);}catch{}}if(PRIVATE)data.vpsStatus={...data.vpsStatus,state:'unavailable',checkedAt:new Date().toISOString(),coverage:vpsFailure(e)};$('#notice').textContent=vpsFailure(e)+'；其余资源继续更新。';}}
 render();
 }catch(e){if(active()&&epoch===activityEpoch)$('#notice').textContent=e.message;}finally{busy=false;if(data&&PRIVATE&&epoch===activityEpoch)await refreshAutomatic(force);$('#refresh').disabled=false;$('#refresh').textContent='↻ 检查更新';if(startedPrivate&&!PRIVATE&&active())connectBackend();notifyHost();if(resumePending&&active()){resumePending=false;queueMicrotask(()=>refresh());}}}
$('#connect').onclick=()=>{connectBackend(true);notifyHost();};$('#refresh').onclick=()=>refresh(true);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function activation(){if(!active()){if(!paused){paused=true;activityEpoch++;}for(const controller of requests)controller.abort();}else{if(paused&&(busy||autoBusy))resumePending=true;paused=false;if(!data||Date.now()-lastAuto>15*60000)void refresh();}}
window.addEventListener('nexus-activate',activation);document.addEventListener('visibilitychange',activation);
if(EMBEDDED)window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='pt-resource-host')return;
 window.ptNexusActive=event.data.active===true;
 document.documentElement.dataset.theme=event.data.theme==='dark'?'dark':'light';
 if(VIEWS.includes(event.data.view)&&event.data.view!==view)setView(event.data.view);
 if(event.data.action==='refresh'){void refresh(event.data.force===true);}else activation();
 notifyHost();
});
if(EMBEDDED){const observer=new MutationObserver(notifyHost);observer.observe($('#notice'),{childList:true,characterData:true,subtree:true});observer.observe($('#refresh'),{attributes:true,attributeFilter:['disabled']});}
if(!returningToNexus)refresh();
