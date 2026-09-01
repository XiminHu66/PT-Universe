const DATA_URL='data/feed.json';
const DEFAULT_PROXY_URL='https://rss-orbit-proxy.summer07-nanjolno.workers.dev';
const MAX_ITEMS_PER_SOURCE=100;
const DEFAULT_CATEGORIES={finance:{name:'财经',icon:'↗',color:'#dd8a35'},world:{name:'时事',icon:'◎',color:'#5b8fd7'},tech:{name:'科技',icon:'◇',color:'#7b72d8'},game:{name:'游戏',icon:'✦',color:'#cf6f85'},other:{name:'其他',icon:'○',color:'#7c8b83'}};
const KEYS={read:'pt.rss.read',saved:'pt.rss.saved',hidden:'pt.rss.hidden',deleted:'pt.rss.deleted',sourceOverrides:'pt.rss.sourceOverrides',categories:'pt.rss.categories',health:'pt.rss.health',theme:'pt.rss.theme',custom:'pt.rss.custom',customItems:'pt.rss.customItems',readerRatio:'pt.rss.readerRatio',fontScale:'pt.rss.fontScale',proxyUrl:'pt.rss.proxyUrl'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const store={get(k,f){try{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v)}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
function loadCategories(){const saved=store.get(KEYS.categories,[]),seen=new Set(),entries=[];if(Array.isArray(saved))saved.forEach(item=>{const base=DEFAULT_CATEGORIES[item?.id];if(!base||seen.has(item.id))return;seen.add(item.id);entries.push([item.id,{...base,name:String(item.name||base.name).trim().slice(0,18)||base.name}])});Object.entries(DEFAULT_CATEGORIES).forEach(([id,value])=>{if(!seen.has(id))entries.push([id,{...value}])});return Object.fromEntries(entries)}
let CATEGORIES=loadCategories();
let data={items:[],sources:[],stats:{},generated_at:null};
let customFeeds=store.get(KEYS.custom,[]),customItems=store.get(KEYS.customItems,[]);
let readIds=new Set(store.get(KEYS.read,[])),savedIds=new Set(store.get(KEYS.saved,[])),hiddenIds=new Set(store.get(KEYS.hidden,[]));
let deletedIds=new Set(store.get(KEYS.deleted,[])),sourceOverrides=store.get(KEYS.sourceOverrides,{}),editingSourceId=null;
let sourceHealth=store.get(KEYS.health,{});
if(!sourceOverrides||Array.isArray(sourceOverrides)||typeof sourceOverrides!=='object')sourceOverrides={};
if(!sourceHealth||Array.isArray(sourceHealth)||typeof sourceHealth!=='object')sourceHealth={};
let view='all',category=null,feed=null,quickFilter='all',query='',sortDesc=true,visibleLimit=40,selectedId=null,renderedItems=[],toastTimer,manualRefreshAt=null;

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function safeUrl(v='',base=location.href){try{const u=new URL(v,base);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function proxyBase(){const raw=String(store.get(KEYS.proxyUrl,DEFAULT_PROXY_URL)||'').trim();if(!raw)return '';const url=safeUrl(raw);return url?url.replace(/\/+$/,''):''}
function proxyImage(url,width=480){try{const u=new URL(url);const target=`${u.host}${u.pathname}${u.search}`;return `https://images.weserv.nl/?url=${encodeURIComponent(target)}&w=${width}&output=webp&il` }catch{return ''}}
function hideBrokenImage(img){img.hidden=true;if(img.classList.contains('article-image'))img.closest('.article-card')?.classList.add('no-image');img.removeAttribute('src')}
function wireImage(img,width){
  const original=safeUrl(img.dataset.original||img.getAttribute('src'));if(!original){hideBrokenImage(img);return}
  let triedProxy=false;
  img.onerror=()=>{if(!triedProxy){triedProxy=true;const fallback=proxyImage(original,width);if(fallback&&fallback!==img.src){img.src=fallback;return}}hideBrokenImage(img)};
  img.onload=()=>{if((img.naturalWidth&&img.naturalWidth<40)||(img.naturalHeight&&img.naturalHeight<40)){if(!triedProxy){triedProxy=true;img.src=proxyImage(original,width)}else hideBrokenImage(img)}};
  img.src=original;
}
function hash(v){let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
async function stableId(sourceId,link,title){const value=`${sourceId}|${link||title}`;if(window.crypto?.subtle){const bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24)}return `${sourceId}-${hash(value)}`}
function saveSet(key,set){store.set(key,[...set].slice(-4000))}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function categoryInfo(id){return CATEGORIES[id]||CATEGORIES.other}
function categoryEntries(){return Object.entries(CATEGORIES)}
function saveCategories(){store.set(KEYS.categories,categoryEntries().map(([id,value])=>({id,name:value.name})))}
function renderCategoryOptions(selected=$('#newFeedCategory')?.value){const input=$('#newFeedCategory');if(!input)return;input.innerHTML=categoryEntries().map(([id,value])=>`<option value="${id}">${esc(value.name)}</option>`).join('');input.value=CATEGORIES[selected]?selected:(CATEGORIES.tech?'tech':categoryEntries()[0]?.[0]||'other')}
function setSourceHealth(id,value,persist=true){sourceHealth[id]={...sourceHealth[id],...value};if(persist)store.set(KEYS.health,sourceHealth)}
function healthStamp(value){if(!value)return'';const date=new Date(value);return Number.isFinite(date.getTime())?fullDate(date):''}
function sourceHealthInfo(source){const health=sourceHealth[source.id];if(health?.state==='checking')return{state:'checking',label:'检查中'};if(health?.state==='ok')return{state:'ok',label:`健康${health.cache==='COMPAT'?' · 兼容模式':''}${health.item_count!=null?` · ${health.item_count} 篇`:''}${healthStamp(health.checked_at)?` · ${healthStamp(health.checked_at)}`:''}`};if(health?.state==='stale')return{state:'stale',label:`源异常，使用缓存${healthStamp(health.checked_at)?` · ${healthStamp(health.checked_at)}`:''}`};if(health?.state==='error')return{state:'error',label:`异常${health.error?` · ${health.error}`:''}${healthStamp(health.checked_at)?` · ${healthStamp(health.checked_at)}`:''}`};if(source.status==='ok'||source.status==='cached')return{state:'stale',label:'缓存可用，等待健康检测'};return{state:'unknown',label:'未检测'}}
function sourceColor(id){const item=allSources().find(x=>x.id===id);return categoryInfo(item?.category).color}
function defaultSources(){return(data.sources||[]).filter(x=>!deletedIds.has(x.id)).map(source=>{const override=sourceOverrides[source.id];if(!override)return source;const url=override.url||source.url;return{...source,...override,url,proxy_id:url===source.url}})}
function allSources(){const map=new Map();[...defaultSources(),...customFeeds].forEach(x=>map.set(x.id,x));return [...map.values()]}
function allItems(){const merged=new Map();[...(data.items||[]),...customItems].forEach(x=>{if(x?.id)merged.set(x.id,x)});return [...merged.values()]}
function enabledItems(){return allItems().filter(item=>!hiddenIds.has(item.source_id)&&!deletedIds.has(item.source_id))}
function applySourcePreferences(items=[]){return items.map(item=>{const override=sourceOverrides[item.source_id];return override?{...item,source:override.name||item.source,category:override.category||item.category}:item})}
function isToday(value){const d=new Date(value),now=new Date();return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()}
function timeLabel(value){const d=new Date(value),diff=Date.now()-d.getTime();if(!Number.isFinite(diff))return '';if(diff<3600000)return `${Math.max(1,Math.floor(diff/60000))} 分钟前`;if(diff<86400000)return `${Math.floor(diff/3600000)} 小时前`;if(diff<604800000)return `${Math.floor(diff/86400000)} 天前`;return new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(d)}
function fullDate(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):''}
function sourceInitial(name=''){return [...name.trim()][0]||'R'}

function filteredItems(){
  let items=enabledItems();
  if(view==='today')items=items.filter(x=>isToday(x.published_at));
  if(view==='unread')items=items.filter(x=>!readIds.has(x.id));
  if(view==='saved')items=items.filter(x=>savedIds.has(x.id));
  if(category)items=items.filter(x=>x.category===category);
  if(feed)items=items.filter(x=>x.source_id===feed);
  if(quickFilter==='unread')items=items.filter(x=>!readIds.has(x.id));
  if(quickFilter==='saved')items=items.filter(x=>savedIds.has(x.id));
  if(quickFilter==='image')items=items.filter(x=>safeUrl(x.image));
  if(query){const q=query.toLowerCase();items=items.filter(x=>[x.title,x.summary,x.source,x.author].join(' ').toLowerCase().includes(q))}
  return items.sort((a,b)=>(new Date(b.published_at)-new Date(a.published_at))*(sortDesc?1:-1));
}

function renderNavigation(){
  const items=enabledItems(),unreadItems=items.filter(x=>!readIds.has(x.id)),unread=unreadItems.length;
  $('#allCount').textContent=unread;$('#todayCount').textContent=unreadItems.filter(x=>isToday(x.published_at)).length;$('#unreadCount').textContent=unread;$('#savedCount').textContent=items.filter(x=>savedIds.has(x.id)).length;
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view&&!category&&!feed));
  $('#categoryNav').innerHTML=categoryEntries().map(([id,c])=>{const total=items.filter(x=>x.category===id).length,count=unreadItems.filter(x=>x.category===id).length;if(!total&&id==='other')return '';return `<button class="feed-item ${category===id?'active':''}" data-category="${id}" style="--dot:${c.color}"><i></i><span>${c.icon} ${esc(c.name)}</span><em title="未读文章数">${count}</em></button>`}).join('');
  const sources=allSources().filter(x=>!hiddenIds.has(x.id));
  $('#sourceCount').textContent=sources.length;$('#feedNav').innerHTML=sources.map(x=>`<button class="feed-item ${feed===x.id?'active':''}" data-feed="${esc(x.id)}" style="--dot:${sourceColor(x.id)}"><i></i><span>${esc(x.name)}</span><em title="未读文章数">${unreadItems.filter(a=>a.source_id===x.id).length}</em></button>`).join('');
  $$('[data-category]').forEach(x=>x.onclick=()=>{category=category===x.dataset.category?null:x.dataset.category;feed=null;view='all';visibleLimit=40;renderAll();closeSidebar()});
  $$('[data-feed]').forEach(x=>x.onclick=()=>{feed=feed===x.dataset.feed?null:x.dataset.feed;category=null;view='all';visibleLimit=40;renderAll();closeSidebar()});
}

function titleState(){
  let title={all:'全部文章',today:'今日更新',unread:'未读文章',saved:'稍后读'}[view];
  let eye={all:'INBOX',today:'TODAY',unread:'UNREAD',saved:'READ LATER'}[view];
  if(category){title=categoryInfo(category).name;eye='CATEGORY'}
  if(feed){title=allSources().find(x=>x.id===feed)?.name||'订阅源';eye='SOURCE'}
  if(query){title=`搜索：${query}`;eye='SEARCH'}
  $('#viewTitle').textContent=title;$('#eyebrow').textContent=eye;
}

function articleCard(item){
  const image=safeUrl(item.image),saved=savedIds.has(item.id),read=readIds.has(item.id),color=sourceColor(item.source_id);
  return `<article class="article-card ${read?'read':''} ${selectedId===item.id?'selected':''} ${image?'':'no-image'}" data-article="${esc(item.id)}" tabindex="0">
    <i class="unread-dot"></i><div class="article-main"><div class="article-meta"><i class="source-dot" style="--dot:${color}"></i><b>${esc(item.source)}</b><span>·</span><span>${timeLabel(item.published_at)}</span>${item.author?`<span>· ${esc(item.author)}</span>`:''}</div><h2>${esc(item.title)}</h2>${item.summary?`<p>${esc(item.summary)}</p>`:''}</div>
    ${image?`<img class="article-image" data-original="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<div class="article-tools"><button class="${saved?'on':''}" data-save="${esc(item.id)}" aria-label="稍后读">${saved?'★':'☆'}</button><button data-open="${esc(item.id)}" aria-label="打开原文">↗</button></div></article>`;
}

function renderList(){
  renderedItems=filteredItems();const shown=renderedItems.slice(0,visibleLimit);
  $('#resultCount').textContent=renderedItems.length;$('#summaryText').textContent=query?'匹配标题、摘要、作者和来源':`${allSources().filter(x=>!hiddenIds.has(x.id)).length} 个来源 · 中文优先`;
  if(!shown.length){$('#articleList').innerHTML='<div class="empty-state"><div><span>◌</span><h2>这里暂时是空的</h2><p>换一个筛选条件，或刷新订阅数据。</p></div></div>'}
  else $('#articleList').innerHTML=shown.map(articleCard).join('');
  $$('.article-image').forEach(img=>wireImage(img,240));
  $('#loadMoreButton').hidden=shown.length>=renderedItems.length;
  $$('[data-article]').forEach(el=>{el.onclick=e=>{if(e.target.closest('[data-save]')||e.target.closest('[data-open]'))return;selectArticle(el.dataset.article)};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectArticle(el.dataset.article)}}});
  $$('[data-save]').forEach(x=>x.onclick=e=>{e.stopPropagation();toggleSaved(x.dataset.save)});
  $$('[data-open]').forEach(x=>x.onclick=e=>{e.stopPropagation();openOriginal(x.dataset.open)});
}

function renderAll(){renderNavigation();titleState();renderList();if(selectedId&&!enabledItems().some(x=>x.id===selectedId))closeReader()}
function selectArticle(id){selectedId=id;readIds.add(id);saveSet(KEYS.read,readIds);renderNavigation();renderList();renderReader();$('#readerPanel').scrollTop=0;$('#readerPanel').classList.add('open')}
function currentArticle(){return allItems().find(x=>x.id===selectedId)}
function renderReader(){const item=currentArticle();if(!item){closeReader();return}$('#readerEmpty').hidden=true;$('#readerArticle').hidden=false;$('#readerSourceIcon').textContent=sourceInitial(item.source);$('#readerSource').textContent=item.source;$('#readerMeta').textContent=`${fullDate(item.published_at)}${item.author?` · ${item.author}`:''}`;$('#readerCategory').textContent=categoryInfo(item.category).name;$('#readerTitle').textContent=item.title;$('#readerSummary').textContent=item.summary||'这个来源没有提供摘要，请打开原文继续阅读。';const image=safeUrl(item.image),readerImage=$('#readerImage');readerImage.hidden=!image;if(image){readerImage.dataset.original=image;wireImage(readerImage,900)}else readerImage.removeAttribute('src');const link=safeUrl(item.link);$('#readerOpen').href=link||'#';$('#readerSave').classList.toggle('on',savedIds.has(item.id));$('#readerSave').textContent=savedIds.has(item.id)?'★ 已收藏':'☆ 稍后读';$('#readerUnread').textContent=readIds.has(item.id)?'标为未读':'标为已读'}
function closeReader(){selectedId=null;$('#readerPanel').classList.remove('open');$('#readerArticle').hidden=true;$('#readerEmpty').hidden=false;renderList()}
function toggleSaved(id){savedIds.has(id)?savedIds.delete(id):savedIds.add(id);saveSet(KEYS.saved,savedIds);renderNavigation();renderList();if(selectedId===id)renderReader();toast(savedIds.has(id)?'已加入稍后读':'已从稍后读移除')}
function toggleRead(id){readIds.has(id)?readIds.delete(id):readIds.add(id);saveSet(KEYS.read,readIds);renderAll();if(selectedId===id)renderReader()}
function openOriginal(id){const item=allItems().find(x=>x.id===id),url=safeUrl(item?.link);if(!url)return;readIds.add(id);saveSet(KEYS.read,readIds);renderAll();window.open(url,'_blank','noopener')}

function categoryRow([id,value],index,total){return `<div class="category-row" style="--dot:${value.color}"><span>${value.icon}</span><input value="${esc(value.name)}" maxlength="18" data-category-name="${id}" aria-label="${esc(value.name)}分类名称"><div><button type="button" data-move-category="${id}" data-direction="-1" aria-label="上移${esc(value.name)}" ${index===0?'disabled':''}>↑</button><button type="button" data-move-category="${id}" data-direction="1" aria-label="下移${esc(value.name)}" ${index===total-1?'disabled':''}>↓</button></div></div>`}
function renderCategoryManager(){const entries=categoryEntries();$('#categoryManager').innerHTML=entries.map((entry,index)=>categoryRow(entry,index,entries.length)).join('');renderCategoryOptions();$$('[data-category-name]').forEach(input=>{input.onchange=()=>renameCategory(input.dataset.categoryName,input.value);input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.blur()}}});$$('[data-move-category]').forEach(button=>button.onclick=()=>moveCategory(button.dataset.moveCategory,Number(button.dataset.direction)))}
function renameCategory(id,value){const name=String(value||'').trim().slice(0,18);if(!CATEGORIES[id]||!name)return renderCategoryManager();CATEGORIES[id]={...CATEGORIES[id],name};saveCategories();renderCategoryManager();renderAll();toast('分类名称已保存')}
function moveCategory(id,direction){const entries=categoryEntries(),index=entries.findIndex(([key])=>key===id),next=index+direction;if(index<0||next<0||next>=entries.length)return;[entries[index],entries[next]]=[entries[next],entries[index]];CATEGORIES=Object.fromEntries(entries);saveCategories();renderCategoryManager();renderAll()}
function sourceRow(source){const health=sourceHealthInfo(source);return `<div class="source-row" style="--dot:${sourceColor(source.id)}"><div class="source-info"><i></i><span><strong>${esc(source.name)}</strong><small><b class="health-dot health-${health.state}"></b>${esc(categoryInfo(source.category).name)} · ${esc(health.label)}</small></span></div><div class="source-actions"><button type="button" class="${hiddenIds.has(source.id)?'':'on'}" data-toggle-source="${esc(source.id)}">${hiddenIds.has(source.id)?'已关闭':'已启用'}</button><button type="button" data-edit-source="${esc(source.id)}">修改</button><button type="button" class="remove" data-delete-source="${esc(source.id)}">删除</button></div></div>`}
function renderManager(){
  const sources=allSources(),restore=$('#restoreSourcesButton');
  renderCategoryManager();
  $('#sourceManager').innerHTML=sources.map(sourceRow).join('')||'<p class="dialog-note">尚未载入订阅源。</p>';
  restore.hidden=!deletedIds.size;restore.textContent=`恢复已删除的默认源${deletedIds.size?`（${deletedIds.size}）`:''}`;
  $$('[data-toggle-source]').forEach(x=>x.onclick=()=>{const id=x.dataset.toggleSource;hiddenIds.has(id)?hiddenIds.delete(id):hiddenIds.add(id);saveSet(KEYS.hidden,hiddenIds);if(hiddenIds.has(id)&&feed===id)feed=null;renderManager();renderAll()});
  $$('[data-edit-source]').forEach(x=>x.onclick=()=>startSourceEdit(x.dataset.editSource));
  $$('[data-delete-source]').forEach(x=>x.onclick=()=>removeSource(x.dataset.deleteSource));
}
function resetSourceForm(){editingSourceId=null;$('#sourceFormTitle').textContent='添加本机订阅';$('#newFeedName').value='';$('#newFeedUrl').value='';renderCategoryOptions(CATEGORIES.tech?'tech':categoryEntries()[0]?.[0]);$('#addFeedButton').textContent='添加并尝试读取';$('#cancelEditButton').hidden=true}
function startSourceEdit(id){const source=allSources().find(x=>x.id===id);if(!source)return;editingSourceId=id;$('#sourceFormTitle').textContent='修改订阅源';$('#newFeedName').value=source.name;$('#newFeedUrl').value=source.url;renderCategoryOptions(source.category);$('#addFeedButton').textContent='保存修改';$('#cancelEditButton').hidden=false;$('#sourceForm').scrollIntoView({block:'nearest'})}
async function saveSource(){
  const name=$('#newFeedName').value.trim(),url=safeUrl($('#newFeedUrl').value.trim()),cat=$('#newFeedCategory').value;
  if(!url)return toast('请输入完整的 RSS 地址');
  if(allSources().some(x=>x.id!==editingSourceId&&x.url===url))return toast('这个订阅已经存在');
  if(!editingSourceId){
    const source={id:`custom-${hash(url)}`,name:name||new URL(url).hostname.replace(/^www\./,''),url,category:cat,custom:true};
    customFeeds.push(source);store.set(KEYS.custom,customFeeds);resetSourceForm();renderManager();
    const ok=await refreshCustomFeed(source,true);renderManager();renderAll();
    toast(ok?'订阅已添加并读取':'订阅已保存；请在健康状态中查看错误');return;
  }
  const current=allSources().find(x=>x.id===editingSourceId);if(!current)return resetSourceForm();
  const updated={...current,name:name||new URL(url).hostname.replace(/^www\./,''),url,category:cat};
  if(current.custom){
    customFeeds=customFeeds.map(x=>x.id===current.id?{...updated,custom:true}:x);
    customItems=customItems.map(x=>x.source_id===current.id?{...x,source:updated.name,category:updated.category}:x);
    store.set(KEYS.custom,customFeeds);store.set(KEYS.customItems,customItems);
  }else{
    sourceOverrides[current.id]={name:updated.name,url:updated.url,category:updated.category};
    store.set(KEYS.sourceOverrides,sourceOverrides);
    data.items=data.items.map(x=>x.source_id===current.id?{...x,source:updated.name,category:updated.category}:x);
  }
  resetSourceForm();renderManager();renderAll();
  let result=null;
  if(current.custom){
    result=await refreshCustomFeed({...updated,custom:true},true);
  }else{
    const preferred=defaultSources().find(x=>x.id===current.id);result=preferred&&await refreshDefaultFeed(preferred,true);
    if(result){data.items=[...result.items,...data.items.filter(x=>x.source_id!==current.id)];data.sources=data.sources.map(x=>x.id===current.id?{...x,status:result.fresh?'live':'cached',item_count:result.items.length,error:''}:x)}
  }
  renderManager();renderAll();toast(result?'订阅已修改并刷新':'订阅已修改；请在健康状态中查看错误');
}
function removeSource(id){const source=allSources().find(x=>x.id===id);if(!source||!confirm(`删除订阅“${source.name}”吗？`))return;if(source.custom){customFeeds=customFeeds.filter(x=>x.id!==id);customItems=customItems.filter(x=>x.source_id!==id);store.set(KEYS.custom,customFeeds);store.set(KEYS.customItems,customItems)}else{deletedIds.add(id);delete sourceOverrides[id];saveSet(KEYS.deleted,deletedIds);store.set(KEYS.sourceOverrides,sourceOverrides)}delete sourceHealth[id];store.set(KEYS.health,sourceHealth);hiddenIds.delete(id);saveSet(KEYS.hidden,hiddenIds);if(feed===id)feed=null;if(editingSourceId===id)resetSourceForm();renderManager();renderAll();toast('订阅已删除')}
function restoreDefaultSources(){deletedIds.clear();saveSet(KEYS.deleted,deletedIds);renderManager();renderAll();toast('已恢复默认订阅源')}

async function fetchCandidate(url,timeout=10000){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort('timeout'),timeout);try{const response=await fetch(url,{signal:ctl.signal,cache:'no-store',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'}});if(!response.ok){let detail='';try{const payload=await response.clone().json();detail=payload?.detail||payload?.error||''}catch{}throw new Error(detail||`HTTP ${response.status}`)}const text=await response.text();if(!text.trim())throw new Error('响应为空');return{text,meta:{cache:response.headers.get('X-RSS-Cache')||'DIRECT',fetchedAt:response.headers.get('X-RSS-Fetched-At')||new Date().toISOString()}}}catch(error){if(ctl.signal.aborted)throw new Error('读取超时');throw error}finally{clearTimeout(timer)}}
async function fetchText(url,sourceId='',force=false){
  let lastError;const proxy=proxyBase();
  if(proxy&&sourceId)return fetchCandidate(`${proxy}/feed/${encodeURIComponent(sourceId)}${force?'?refresh=1':''}`,22000);
  if(proxy){try{return await fetchCandidate(`${proxy}/custom?url=${encodeURIComponent(url)}`,22000)}catch(error){lastError=error}}
  const encoded=encodeURIComponent(url),candidates=[url,`https://api.allorigins.win/raw?url=${encoded}`,`https://api.codetabs.com/v1/proxy?quest=${encoded}`];
  for(const candidate of candidates){try{return await fetchCandidate(candidate)}catch(error){lastError=error}}
  throw lastError||new Error('feed unavailable');
}
async function parseCustomFeed(xml,source){
  const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))throw new Error('RSS XML 无法解析');
  const nodes=[...doc.querySelectorAll('item, entry')].slice(0,MAX_ITEMS_PER_SOURCE);if(!nodes.length)throw new Error('没有找到文章');
  const pick=(node,names)=>{for(const name of names){const value=node.querySelector(name)?.textContent?.trim();if(value)return value}return ''};
  const items=await Promise.all(nodes.map(async node=>{const title=pick(node,['title']),rawLink=node.querySelector('link')?.getAttribute('href')||pick(node,['link']),link=safeUrl(rawLink,source.url),summaryHtml=pick(node,['description','summary','content\\:encoded','content']),date=pick(node,['pubDate','published','updated']);if(!title||!link)return null;const summaryDoc=new DOMParser().parseFromString(summaryHtml,'text/html'),rawImage=node.querySelector('enclosure[type^="image"]')?.getAttribute('url')||node.querySelector('media\\:thumbnail, media\\:content')?.getAttribute('url')||summaryDoc.querySelector('img')?.getAttribute('src')||'',image=rawImage?safeUrl(rawImage,link):'';return{id:await stableId(source.id,link,title),source_id:source.id,source:source.name,category:source.category,title,summary:summaryDoc.body.textContent.trim().replace(/\\s+/g,' ').slice(0,620),link,image,author:pick(node,['author name','dc\\:creator','author']),published_at:Number.isFinite(new Date(date).getTime())?new Date(date).toISOString():new Date().toISOString()}}));
  return items.filter(Boolean);
}
function mergeSourceHistory(fresh,history,sourceId){
  const merged=new Map();
  [...fresh,...history.filter(x=>x.source_id===sourceId)]
    .sort((a,b)=>new Date(b.published_at)-new Date(a.published_at))
    .forEach(item=>{if(item?.id&&!merged.has(item.id))merged.set(item.id,item)});
  return [...merged.values()].slice(0,MAX_ITEMS_PER_SOURCE);
}
function healthError(error){const value=String(error?.message||error||'读取失败').replace(/^upstream_/,'源站 HTTP ').replace(/^compat_upstream_/,'兼容源 HTTP ').replace('compat_invalid_data','兼容源数据异常').replace('Failed to fetch','网络或源站拒绝访问').replace('invalid_feed','不是有效的 RSS');return value.slice(0,72)}
async function refreshCustomFeed(source,quiet=false){
  setSourceHealth(source.id,{state:'checking'},false);if($('#manageDialog').open)renderManager();
  try{
    const {text,meta}=await fetchText(source.url),items=await parseCustomFeed(text,source);
    const retained=mergeSourceHistory(items,customItems,source.id);
    customItems=[...retained,...customItems.filter(x=>x.source_id!==source.id)];store.set(KEYS.customItems,customItems);
    setSourceHealth(source.id,{state:meta.cache==='STALE'?'stale':'ok',item_count:retained.length,checked_at:meta.fetchedAt,cache:meta.cache,error:''});
    if(!quiet)toast(`${source.name}：保留 ${retained.length} 篇`);return true;
  }catch(error){setSourceHealth(source.id,{state:'error',checked_at:new Date().toISOString(),error:healthError(error)});if(!quiet)toast(`${source.name} 暂时无法读取`);return false}
}
async function refreshCustomFeeds(){const sources=customFeeds.filter(x=>!hiddenIds.has(x.id));if(!sources.length)return{sourceCount:0,totalSources:0,itemCount:0};const results=await Promise.all(sources.map(async source=>({source,ok:await refreshCustomFeed(source,true)}))),successful=results.filter(x=>x.ok);return{sourceCount:successful.length,totalSources:sources.length,itemCount:successful.reduce((sum,x)=>sum+customItems.filter(item=>item.source_id===x.source.id).length,0)}}

async function refreshDefaultFeed(source,force=false){
  setSourceHealth(source.id,{state:'checking'},false);
  try{
    const proxyId=source.proxy_id===false?'':source.id,{text,meta}=await fetchText(source.url,proxyId,force),items=await parseCustomFeed(text,source),stale=meta.cache==='STALE';
    const retained=mergeSourceHistory(items,data.items,source.id);
    setSourceHealth(source.id,{state:stale?'stale':'ok',item_count:retained.length,checked_at:meta.fetchedAt,cache:meta.cache,error:''});
    return retained.length?{source,items:retained,fresh:!stale}:null;
  }catch(error){setSourceHealth(source.id,{state:'error',checked_at:new Date().toISOString(),error:healthError(error)});return null}
}
async function refreshDefaultFeeds(force=false){
  const sources=defaultSources().filter(x=>!hiddenIds.has(x.id)),results=await Promise.all(sources.map(source=>refreshDefaultFeed(source,force))),successful=results.filter(Boolean),fresh=successful.filter(x=>x.fresh);
  for(const result of successful){data.items=[...result.items,...data.items.filter(x=>x.source_id!==result.source.id)];data.sources=data.sources.map(x=>x.id===result.source.id?{...x,status:result.fresh?(force?'live':'cached'):'stale',item_count:result.items.length,error:''}:x)}
  if(force&&successful.length)manualRefreshAt=new Date();
  return{sourceCount:fresh.length,cachedCount:successful.length-fresh.length,totalSources:sources.length,itemCount:successful.reduce((sum,x)=>sum+x.items.length,0)};
}

function exportOpml(){const sources=allSources().filter(x=>!hiddenIds.has(x.id));const groups={};sources.forEach(x=>(groups[categoryInfo(x.category).name]??=[]).push(x));const body=Object.entries(groups).map(([name,list])=>`<outline text="${esc(name)}" title="${esc(name)}">${list.map(x=>`<outline type="rss" text="${esc(x.name)}" title="${esc(x.name)}" xmlUrl="${esc(x.url)}"/>`).join('')}</outline>`).join('');const xml=`<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>RSS Orbit subscriptions</title><dateCreated>${new Date().toUTCString()}</dateCreated></head><body>${body}</body></opml>`;const blob=new Blob([xml],{type:'text/xml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`rss-orbit-${new Date().toISOString().slice(0,10)}.opml`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function importOpml(file){try{const doc=new DOMParser().parseFromString(await file.text(),'text/xml');if(doc.querySelector('parsererror'))throw new Error();let added=0;[...doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]')].forEach(node=>{const url=node.getAttribute('xmlUrl')||node.getAttribute('xmlurl'),safe=safeUrl(url);if(!safe||allSources().some(x=>x.url===safe))return;const parent=node.parentElement?.getAttribute('text')||'',match=categoryEntries().find(([,x])=>parent.includes(x.name));customFeeds.push({id:`custom-${hash(safe)}`,name:node.getAttribute('title')||node.getAttribute('text')||new URL(safe).hostname,url:safe,category:match?.[0]||'other',custom:true});added++});store.set(KEYS.custom,customFeeds);renderManager();renderAll();toast(`已导入 ${added} 个订阅，正在尝试读取`);await refreshCustomFeeds();renderManager();renderAll()}catch{toast('这个 OPML 文件无法读取')}finally{$('#opmlInput').value=''}}

function renderProxySettings(state=''){const input=$('#proxyUrlInput'),status=$('#proxyStatus'),url=proxyBase();if(input&&state!=='error')input.value=url;if(!status)return;status.className='';if(state==='error'){status.className='error';status.textContent='连接失败，请检查 Worker 地址'}else if(state==='ok'||url){status.className='ok';status.textContent=url?`已连接 · ${new URL(url).hostname}`:'连接成功'}else status.textContent='尚未连接 Cloudflare Worker'}
async function connectProxy(){const input=$('#proxyUrlInput'),button=$('#proxyConnectButton'),raw=input.value.trim();if(!raw){store.set(KEYS.proxyUrl,'');renderProxySettings();toast('已关闭实时刷新代理');return}const url=safeUrl(raw);if(!url||!url.startsWith('https://'))return toast('请输入完整的 HTTPS Worker 地址');const base=url.replace(/\/+$/,'');button.disabled=true;button.textContent='正在测试…';try{const response=await fetch(`${base}/health?t=${Date.now()}`,{cache:'no-store'}),payload=await response.json();if(!response.ok||payload?.service!=='rss-orbit-proxy'||payload?.feeds!==12)throw new Error();store.set(KEYS.proxyUrl,base);renderProxySettings('ok');toast('Cloudflare Worker 已连接')}catch{renderProxySettings('error');toast('Worker 连接失败，请检查部署地址')}finally{button.disabled=false;button.textContent='保存并测试'}}

function setTheme(theme){document.documentElement.dataset.theme=theme;store.set(KEYS.theme,theme);document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d1210':'#f4f7f4'}
function applyReaderRatio(value=store.get(KEYS.readerRatio,42),persist=false){const requested=Math.min(72,Math.max(28,Number(value)||42));if(persist)store.set(KEYS.readerRatio,requested);const input=$('#readerWidthInput'),output=$('#readerWidthOutput');if(innerWidth<=900){if(input){input.max=72;input.value=requested}if(output)output.textContent=`${requested}%`;return}const side=246,listMin=300,readerMin=320,available=Math.max(0,innerWidth-side),maxWidth=Math.max(readerMin,available-listMin),width=Math.min(maxWidth,Math.max(readerMin,Math.round(available*requested/100))),actual=Math.round(width/available*100),maxRatio=Math.min(72,Math.round(maxWidth/available*100));document.documentElement.style.setProperty('--reader',`${width}px`);if(input){input.max=Math.max(28,maxRatio);input.value=Math.min(requested,maxRatio)}if(output)output.textContent=`${actual}%`}
function applyFontScale(value=store.get(KEYS.fontScale,110),persist=false){const scale=Math.min(140,Math.max(90,Number(value)||110));if(persist)store.set(KEYS.fontScale,scale);for(let size=8;size<=40;size++)document.documentElement.style.setProperty(`--fs-${size}`,`${(size*scale/100).toFixed(2)}px`);const input=$('#fontScaleInput'),output=$('#fontScaleOutput');if(input)input.value=scale;if(output)output.textContent=`${scale}%`}
function closeSidebar(){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}
function openManage(){resetSourceForm();renderManager();renderProxySettings();$('#manageDialog').showModal();closeSidebar()}
function showPane(name){$$('[data-pane]').forEach(x=>x.classList.toggle('active',x.dataset.pane===name));$$('.dialog-pane').forEach(x=>x.classList.toggle('active',x.id===`pane-${name}`))}
function syncStatus(){if(manualRefreshAt){$('#syncDot').className='ok';$('#syncText').textContent=`手动刷新于 ${fullDate(manualRefreshAt)}`;return}const stamp=data.generated_at?new Date(data.generated_at):null;if(stamp&&Number.isFinite(stamp.getTime())){$('#syncDot').className='ok';$('#syncText').textContent=`Cloudflare 更新于 ${fullDate(stamp)}`}else{$('#syncDot').className='error';$('#syncText').textContent='等待 Cloudflare 首次抓取'}}
async function loadCloudflareStatus(){const proxy=proxyBase();if(!proxy)return;try{const response=await fetch(`${proxy}/health?t=${Date.now()}`,{cache:'no-store'}),payload=await response.json();if(!response.ok)return;if(payload?.last_refresh)data.generated_at=payload.last_refresh;const checkedAt=payload?.last_refresh||new Date().toISOString();if(payload?.source_health){Object.entries(payload.source_health).forEach(([id,value])=>setSourceHealth(id,{state:value?.ok?'ok':'error',checked_at:value?.fetched_at||checkedAt,cache:'CRON',error:value?.ok?'':healthError(value?.error),item_count:sourceHealth[id]?.item_count},false));store.set(KEYS.health,sourceHealth)}else if(payload?.last_result){const failed=new Set(payload.last_result.failed||[]);defaultSources().forEach(source=>setSourceHealth(source.id,{state:failed.has(source.id)?'error':'ok',checked_at:checkedAt,cache:'CRON',error:failed.has(source.id)?'定时抓取失败':''},false));store.set(KEYS.health,sourceHealth)}}catch{}}
async function loadData(){const btn=$('#refreshButton');btn.classList.add('loading');try{const response=await fetch(DATA_URL);if(!response.ok)throw new Error();const payload=await response.json();if(Array.isArray(payload.items))data={...payload,items:applySourcePreferences(payload.items),generated_at:null};const cached=await refreshDefaultFeeds(false);await loadCloudflareStatus();await refreshCustomFeeds();syncStatus();renderAll();if(!cached.sourceCount)toast('Cloudflare 缓存暂时不可用，正在显示内置备用数据')}catch{$('#syncDot').className='error';$('#syncText').textContent='数据缓存暂时不可用';renderAll()}finally{btn.classList.remove('loading')}}
async function refreshNow(){const btn=$('#refreshButton');if(btn.classList.contains('loading'))return;btn.classList.add('loading');btn.disabled=true;toast(proxyBase()?'正在通过 Cloudflare 即时刷新全部 RSS…':'正在直接读取 RSS 源…');try{const defaults=await refreshDefaultFeeds(true),custom=await refreshCustomFeeds(),fresh=defaults.sourceCount+custom.sourceCount,total=defaults.totalSources+custom.totalSources,itemCount=defaults.itemCount+custom.itemCount,unavailable=total-fresh;if(fresh)manualRefreshAt=new Date();syncStatus();if($('#manageDialog').open)renderManager();renderAll();if(fresh===total)toast(`全部 ${fresh} 个来源已实时刷新 · ${itemCount} 篇`);else if(fresh)toast(`实时更新 ${fresh}/${total} 个来源；${unavailable} 个请查看健康状态`);else toast('全部来源当前无法实时刷新，已保留已有内容')}finally{btn.classList.remove('loading');btn.disabled=false}}

$$('.nav-item').forEach(x=>x.onclick=()=>{view=x.dataset.view;category=null;feed=null;quickFilter='all';visibleLimit=40;$$('.filter-pill').forEach(y=>y.classList.toggle('active',y.dataset.filter==='all'));renderAll();closeSidebar()});
$$('.filter-pill').forEach(x=>x.onclick=()=>{quickFilter=x.dataset.filter;visibleLimit=40;$$('.filter-pill').forEach(y=>y.classList.toggle('active',y===x));renderList()});
$('#searchInput').oninput=e=>{query=e.target.value.trim();visibleLimit=40;renderAll()};
$('#sortButton').onclick=()=>{sortDesc=!sortDesc;$('#sortButton').textContent=sortDesc?'最新优先 ↓':'最早优先 ↑';renderList()};
$('#loadMoreButton').onclick=()=>{visibleLimit+=40;renderList()};
$('#markAllButton').onclick=()=>{const ids=filteredItems().map(x=>x.id);ids.forEach(id=>readIds.add(id));saveSet(KEYS.read,readIds);renderAll();toast(`已将 ${ids.length} 篇标为已读`)};
$('#refreshButton').onclick=refreshNow;$('#themeButton').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('#readerClose').onclick=closeReader;$('#readerSave').onclick=()=>selectedId&&toggleSaved(selectedId);$('#readerUnread').onclick=()=>selectedId&&toggleRead(selectedId);$('#readerOpen').onclick=()=>{if(selectedId){readIds.add(selectedId);saveSet(KEYS.read,readIds);renderAll()}};
$('#mobileMenu').onclick=()=>{$('#sidebar').classList.add('open');$('#scrim').classList.add('show')};$('#mobileClose').onclick=closeSidebar;$('#scrim').onclick=closeSidebar;
$('#manageButton').onclick=openManage;$('#settingsButton').onclick=openManage;$$('[data-pane]').forEach(x=>x.onclick=()=>showPane(x.dataset.pane));
$('#proxyConnectButton').onclick=connectProxy;
$('#readerWidthInput').oninput=e=>applyReaderRatio(e.target.value,true);
$('#fontScaleInput').oninput=e=>applyFontScale(e.target.value,true);
$('#addFeedButton').onclick=saveSource;$('#cancelEditButton').onclick=resetSourceForm;$('#restoreSourcesButton').onclick=restoreDefaultSources;$('#exportButton').onclick=exportOpml;$('#opmlInput').onchange=e=>e.target.files?.[0]&&importOpml(e.target.files[0]);
$('#resetStateButton').onclick=()=>{if(confirm('清除全部已读和稍后读记录吗？')){readIds.clear();savedIds.clear();saveSet(KEYS.read,readIds);saveSet(KEYS.saved,savedIds);renderAll();toast('阅读状态已清除')}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||$('#manageDialog').open)return;if(e.key==='/'){e.preventDefault();$('#searchInput').focus()}if(['j','k'].includes(e.key.toLowerCase())){e.preventDefault();const idx=Math.max(0,renderedItems.findIndex(x=>x.id===selectedId)),next=e.key.toLowerCase()==='j'?Math.min(renderedItems.length-1,selectedId?idx+1:0):Math.max(0,idx-1);if(renderedItems[next]){selectArticle(renderedItems[next].id);document.querySelector(`[data-article="${CSS.escape(renderedItems[next].id)}"]`)?.scrollIntoView({block:'nearest'})}}if(e.key.toLowerCase()==='o'&&selectedId)openOriginal(selectedId);if(e.key.toLowerCase()==='s'&&selectedId)toggleSaved(selectedId);if(e.key.toLowerCase()==='m'&&selectedId)toggleRead(selectedId);if(e.key==='Escape')closeReader()});
window.addEventListener('message',e=>{if(e.data?.type==='pt-universe-theme'&&['light','dark'].includes(e.data.theme))setTheme(e.data.theme)});
window.addEventListener('resize',()=>applyReaderRatio(store.get(KEYS.readerRatio,42)));

setTheme(store.get(KEYS.theme,matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));applyFontScale();applyReaderRatio();renderCategoryOptions();renderAll();loadData();
