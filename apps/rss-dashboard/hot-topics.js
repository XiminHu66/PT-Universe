/* Additive view: the existing reader, subscription state and saved articles stay owned by app.js. */
(()=>{
 'use strict';
 const q=s=>document.querySelector(s),button=q('[data-view="saved"]');if(!button)return;
 const KEY='pt.rss.hotTopics.',read=(key,f)=>{try{return JSON.parse(localStorage.getItem(KEY+key))??f;}catch{return f;}},write=(key,v)=>{try{localStorage.setItem(KEY+key,JSON.stringify(v));}catch{}};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safe=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 const canonical=v=>{try{const u=new URL(v);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/.test(k))u.searchParams.delete(k);return u.href;}catch{return v;}};
 const fmt=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
 let active=false,busy=false,payload=read('snapshot',null),kind='all',term='',previous=0,normalSearch='',hidden=new Set(read('hidden',[])),seenRecorded=false,visibleLimit=60;
 const pane=document.createElement('section');pane.id='hotTopicsView';pane.hidden=true;pane.setAttribute('aria-label','今日热点');
 pane.innerHTML='<div class="hot-topics-head"><div><span class="hot-kicker">DAILY SIGNALS</span><h2>今天，哪些消息值得一看</h2><p id="hotTopicsStatus" role="status">热榜与 RSS，统一查看</p></div><button type="button" id="hotTopicsSettings">信息源设置</button></div><div class="hot-topics-filters"><div role="group" aria-label="热点筛选"><button type="button" data-hot-kind="all" class="on">全部</button><button type="button" data-hot-kind="hotlist">热榜</button><button type="button" data-hot-kind="rss">RSS</button><button type="button" data-hot-kind="new">上次查看后新增</button></div><span id="hotTopicsTotal"></span></div><div id="hotTopicsList" aria-live="polite"></div><button type="button" class="load-more" id="hotTopicsMore" hidden>继续加载热点</button><div class="hot-topics-foot">榜单排名按各平台分别显示；RSS 按发布时间排列。点击标题阅读原文。</div>';
 q('.workspace').append(pane);
 const heading=document.createElement('div');heading.id='hotTopicsHeading';heading.hidden=true;heading.innerHTML='<span>TODAY’S TOPICS</span><h1>今日热点</h1>';q('.top-title').append(heading);
 const settingsTab=document.createElement('button');settingsTab.type='button';settingsTab.dataset.hotPane='sources';settingsTab.textContent='热点信息源';q('.dialog-tabs').append(settingsTab);
 const settings=document.createElement('section');settings.className='dialog-pane';settings.id='hotTopicsSources';settings.innerHTML='<p class="dialog-note">合并 RSS Orbit 订阅与现有热点雷达信息源。这里的开关只筛选今日热点，不改变原有订阅、未读或收藏。</p><div class="hot-source-tools"><button type="button" id="hotEnableAll">全部启用</button><button type="button" id="hotDisableAll">全部关闭</button></div><p id="hotSourcesStatus" role="status"></p><div id="hotSourceList"></div>';q('.dialog-shell').append(settings);
 function readerSources(){try{return allSources();}catch{return [];}}
 function readerItems(){try{return allItems();}catch{return [];}}
 function sources(){const map=new Map((payload?.sources||[]).map(s=>[s.id,s]));for(const s of readerSources()){const id='rss:'+s.id;if(!map.has(id))map.set(id,{id,name:s.name,kind:'rss',status:s.status==='error'?'error':'reader',url:s.url});}return [...map.values()];}
 function rows(){
  const local=readerItems().map(x=>({id:x.id,title:x.title,url:x.link,source_id:'rss:'+x.source_id,source:x.source,kind:'rss',published_at:x.published_at,collected_at:x.published_at,first_seen_at:x.published_at,summary:x.summary,rank:null}));
  const map=new Map(),cutoff=Date.now()-86400000;
  for(const x of [...(payload?.items||[]),...local]){
   if(hidden.has(x.source_id)||!safe(x.url)||!x.title)continue;
   const time=Date.parse(x.published_at||x.collected_at||'');if(!Number.isFinite(time)||time<cutoff)continue;
   if(kind==='rss'&&x.kind!=='rss'||kind==='hotlist'&&x.kind!=='hotlist')continue;
   if(kind==='new'&&previous&&Date.parse(x.first_seen_at||x.published_at||x.collected_at)<=previous)continue;
   const key=canonical(x.url),old=map.get(key),source={id:x.source_id,name:x.source,rank:x.rank,change:x.rank_change};
   if(old){if(!old.sources.some(s=>s.id===source.id))old.sources.push(source);if(!old.summary&&x.summary)old.summary=x.summary;continue;}
   map.set(key,{...x,sources:[source],time});
  }
  return [...map.values()].filter(x=>!term||(x.title+' '+x.sources.map(s=>s.name).join(' ')).toLowerCase().includes(term.toLowerCase())).sort((a,b)=>b.time-a.time);
 }
 function render(){
  const items=rows();q('#hotTopicsTotal').textContent=items.length+' 条 · 过去 24 小时';q('#hotTopicsCount').textContent=items.length;
  const status=q('#hotTopicsStatus');
  if(busy)status.textContent='正在读取已采集的热点…';
  else if(payload)status.textContent=(payload.stale?'当前使用上次成功数据 · ':'最近采集 ')+fmt(payload.generated_at)+' · '+sources().length+' 个信息源';
  else status.textContent='VPS 热点暂时不可用；仍可查看原有 RSS 的今日更新。';
  status.classList.toggle('hot-stale',!!payload?.stale);
  q('#hotTopicsList').innerHTML=items.length?items.slice(0,visibleLimit).map(x=>'<article class="hot-topic"><div class="hot-topic-meta"><span class="hot-type '+(x.kind==='hotlist'?'is-hot':'')+'">'+(x.kind==='hotlist'?'热榜':'RSS')+'</span><time>'+esc(fmt(x.published_at||x.collected_at))+'</time>'+(previous&&Date.parse(x.first_seen_at||x.collected_at)>previous?'<span class="hot-new">新增</span>':'')+'</div><h3><a href="'+esc(safe(x.url))+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+' <span>↗</span></a></h3><div class="hot-topic-sources">'+x.sources.slice(0,4).map(s=>'<span>'+esc(s.name)+(s.rank?' · #'+Number(s.rank):'')+(Number.isInteger(s.change)&&s.change!==0?' <b class="'+(s.change>0?'up':'down')+'">'+(s.change>0?'↑':'↓')+Math.abs(s.change)+'</b>':'')+'</span>').join('')+'</div>'+(x.summary?'<details><summary>查看摘要</summary><p>'+esc(String(x.summary).replace(/<[^>]*>/g,' ').slice(0,500))+'</p></details>':'')+'</article>').join(''):'<div class="hot-empty"><span>◌</span><h3>'+(busy?'正在读取热点':'暂时没有符合筛选的消息')+'</h3><p>可切换筛选、调整信息源，或稍后刷新。</p></div>';
  q('#hotTopicsMore').hidden=items.length<=visibleLimit;
  q('[data-view="saved"] b').textContent='今日热点';q('#savedCount').hidden=true;
  if(active)for(const node of document.querySelectorAll('.main-nav .nav-item')){const on=node===button;if(node.classList.contains('active')!==on)node.classList.toggle('active',on);}
 }
 function renderSources(){
  const list=sources();q('#hotSourcesStatus').textContent=(payload?'VPS 热点采集 '+fmt(payload.generated_at)+' · ':'')+'共 '+list.length+' 个信息源，'+list.filter(s=>!hidden.has(s.id)).length+' 个已选';
  q('#hotSourceList').innerHTML=['hotlist','rss'].map(group=>'<section class="hot-source-group"><h3>'+(group==='hotlist'?'平台热榜':'RSS 订阅')+'</h3>'+list.filter(s=>s.kind===group).map(s=>'<label class="hot-source-row"><input type="checkbox" data-hot-source="'+esc(s.id)+'" '+(hidden.has(s.id)?'':'checked')+'><span><strong>'+esc(s.name)+'</strong><small>'+esc(s.status==='ok'?'已采集':s.status==='error'?'来源异常，保留已有内容':s.status==='reader'?'复用原阅读器':'等待采集')+'</small></span></label>').join('')+'</section>').join('');
 }
 async function load(){
  if(busy)return;busy=true;render();
  try{const base=typeof proxyBase==='function'?proxyBase():'https://rss-orbit-proxy.summer07-nanjolno.workers.dev';if(!base)throw Error();
   const r=await fetch(base+'/hot-topics',{cache:'no-store',signal:AbortSignal.timeout(22000)});if(!r.ok)throw Error();const d=await r.json();if(d.revision!=='rss-hot-topics-v1'||!Array.isArray(d.items)||!Array.isArray(d.sources))throw Error();payload=d;write('snapshot',{...d,items:d.items.slice(0,300)});
  }catch{if(payload)payload={...payload,stale:true};}
  finally{busy=false;render();renderSources();if(active&&!seenRecorded){write('lastSeen',Date.now());seenRecorded=true;}}
 }
 function enter(){
  if(!active){normalSearch=q('#searchInput').value;previous=Number(read('lastSeen',0));seenRecorded=false;term='';q('#searchInput').value='';}
  active=true;document.body.classList.add('hot-topics-active');pane.hidden=false;heading.hidden=false;q('#sidebar').classList.remove('open');q('#scrim').classList.remove('show');render();load();
 }
 function leave(){if(!active)return;active=false;document.body.classList.remove('hot-topics-active');pane.hidden=true;heading.hidden=true;q('#searchInput').value=normalSearch;}
 function openSources(){
  const dialog=q('#manageDialog');if(!dialog.open)q('#settingsButton').click();
  for(const node of document.querySelectorAll('.dialog-pane'))node.classList.toggle('active',node===settings);
  for(const node of document.querySelectorAll('.dialog-tabs button'))node.classList.toggle('active',node===settingsTab);
  renderSources();load();
 }
 document.addEventListener('click',e=>{
  const target=e.target.closest?.('button,a');if(!target)return;
  if(target===button){e.preventDefault();e.stopImmediatePropagation();enter();return;}
  if(target===settingsTab||target.id==='hotTopicsSettings'){e.preventDefault();e.stopImmediatePropagation();openSources();return;}
  if(target.matches('[data-pane]'))settingsTab.classList.remove('active');
  if(active&&target.id==='refreshButton'){e.preventDefault();e.stopImmediatePropagation();load();return;}
  if(active&&target.closest('.main-nav,#categoryNav,#feedNav'))leave();
 },true);
 q('#searchInput').addEventListener('input',e=>{if(active){e.stopImmediatePropagation();term=e.target.value.trim();visibleLimit=60;render();}},true);
 document.addEventListener('keydown',e=>{if(active&&!q('#manageDialog').open&&!e.target.matches('input,textarea,select')&&['j','k','o','s','m'].includes(e.key.toLowerCase()))e.stopImmediatePropagation();},true);
 pane.addEventListener('click',e=>{const b=e.target.closest('[data-hot-kind]');if(!b)return;kind=b.dataset.hotKind;visibleLimit=60;for(const node of pane.querySelectorAll('[data-hot-kind]'))node.classList.toggle('on',node===b);render();});
 settings.addEventListener('change',e=>{const id=e.target.dataset.hotSource;if(!id)return;if(e.target.checked)hidden.delete(id);else hidden.add(id);write('hidden',[...hidden]);render();renderSources();});
 q('#hotTopicsMore').onclick=()=>{visibleLimit+=60;render();};
 q('#hotEnableAll').onclick=()=>{hidden.clear();write('hidden',[]);render();renderSources();};
 q('#hotDisableAll').onclick=()=>{hidden=new Set(sources().map(s=>s.id));write('hidden',[...hidden]);render();renderSources();};
 new MutationObserver(()=>{if(active)render();}).observe(q('#feedNav'),{childList:true});
 new MutationObserver(()=>{if(active&&button.classList.contains('active')===false)render();}).observe(q('.main-nav'),{subtree:true,attributes:true,attributeFilter:['class']});
 setInterval(()=>{if(active&&!document.hidden)load();},300000);
 render();if(new URL(location.href).searchParams.get('tab')==='hot-topics')enter();
})();
