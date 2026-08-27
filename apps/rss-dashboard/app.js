const DATA_URL='data/feed.json';
const CATEGORIES={finance:{name:'财经',icon:'↗',color:'#dd8a35'},world:{name:'时事',icon:'◎',color:'#5b8fd7'},tech:{name:'科技',icon:'◇',color:'#7b72d8'},game:{name:'游戏',icon:'✦',color:'#cf6f85'},other:{name:'其他',icon:'○',color:'#7c8b83'}};
const KEYS={read:'pt.rss.read',saved:'pt.rss.saved',hidden:'pt.rss.hidden',theme:'pt.rss.theme',custom:'pt.rss.custom',customItems:'pt.rss.customItems'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const store={get(k,f){try{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v)}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
let data={items:[],sources:[],stats:{},generated_at:null};
let customFeeds=store.get(KEYS.custom,[]),customItems=store.get(KEYS.customItems,[]);
let readIds=new Set(store.get(KEYS.read,[])),savedIds=new Set(store.get(KEYS.saved,[])),hiddenIds=new Set(store.get(KEYS.hidden,[]));
let view='all',category=null,feed=null,quickFilter='all',query='',sortDesc=true,visibleLimit=40,selectedId=null,renderedItems=[],toastTimer;

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function safeUrl(v=''){try{const u=new URL(v,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
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
function saveSet(key,set){store.set(key,[...set].slice(-4000))}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function categoryInfo(id){return CATEGORIES[id]||CATEGORIES.other}
function sourceColor(id){const item=allSources().find(x=>x.id===id);return categoryInfo(item?.category).color}
function allSources(){const map=new Map();[...(data.sources||[]),...customFeeds].forEach(x=>map.set(x.id,x));return [...map.values()]}
function allItems(){const merged=new Map();[...(data.items||[]),...customItems].forEach(x=>{if(x?.id)merged.set(x.id,x)});return [...merged.values()]}
function enabledItems(){return allItems().filter(item=>!hiddenIds.has(item.source_id))}
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
  const items=enabledItems(),unread=items.filter(x=>!readIds.has(x.id)).length;
  $('#allCount').textContent=items.length;$('#todayCount').textContent=items.filter(x=>isToday(x.published_at)).length;$('#unreadCount').textContent=unread;$('#savedCount').textContent=items.filter(x=>savedIds.has(x.id)).length;
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view&&!category&&!feed));
  $('#categoryNav').innerHTML=Object.entries(CATEGORIES).map(([id,c])=>{const count=items.filter(x=>x.category===id).length;if(!count&&id==='other')return '';return `<button class="feed-item ${category===id?'active':''}" data-category="${id}" style="--dot:${c.color}"><i></i><span>${c.icon} ${c.name}</span><em>${count}</em></button>`}).join('');
  const sources=allSources().filter(x=>!hiddenIds.has(x.id));
  $('#sourceCount').textContent=sources.length;$('#feedNav').innerHTML=sources.map(x=>`<button class="feed-item ${feed===x.id?'active':''}" data-feed="${esc(x.id)}" style="--dot:${sourceColor(x.id)}"><i></i><span>${esc(x.name)}</span><em>${items.filter(a=>a.source_id===x.id).length}</em></button>`).join('');
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

function renderAll(){renderNavigation();titleState();renderList();if(selectedId&&!allItems().some(x=>x.id===selectedId))closeReader()}
function selectArticle(id){selectedId=id;readIds.add(id);saveSet(KEYS.read,readIds);renderNavigation();renderList();renderReader();$('#readerPanel').scrollTop=0;$('#readerPanel').classList.add('open')}
function currentArticle(){return allItems().find(x=>x.id===selectedId)}
function renderReader(){const item=currentArticle();if(!item){closeReader();return}$('#readerEmpty').hidden=true;$('#readerArticle').hidden=false;$('#readerSourceIcon').textContent=sourceInitial(item.source);$('#readerSource').textContent=item.source;$('#readerMeta').textContent=`${fullDate(item.published_at)}${item.author?` · ${item.author}`:''}`;$('#readerCategory').textContent=categoryInfo(item.category).name;$('#readerTitle').textContent=item.title;$('#readerSummary').textContent=item.summary||'这个来源没有提供摘要，请打开原文继续阅读。';const image=safeUrl(item.image),readerImage=$('#readerImage');readerImage.hidden=!image;if(image){readerImage.dataset.original=image;wireImage(readerImage,900)}else readerImage.removeAttribute('src');const link=safeUrl(item.link);$('#readerOpen').href=link||'#';$('#readerSave').classList.toggle('on',savedIds.has(item.id));$('#readerSave').textContent=savedIds.has(item.id)?'★ 已收藏':'☆ 稍后读';$('#readerUnread').textContent=readIds.has(item.id)?'标为未读':'标为已读'}
function closeReader(){selectedId=null;$('#readerPanel').classList.remove('open');$('#readerArticle').hidden=true;$('#readerEmpty').hidden=false;renderList()}
function toggleSaved(id){savedIds.has(id)?savedIds.delete(id):savedIds.add(id);saveSet(KEYS.saved,savedIds);renderNavigation();renderList();if(selectedId===id)renderReader();toast(savedIds.has(id)?'已加入稍后读':'已从稍后读移除')}
function toggleRead(id){readIds.has(id)?readIds.delete(id):readIds.add(id);saveSet(KEYS.read,readIds);renderAll();if(selectedId===id)renderReader()}
function openOriginal(id){const item=allItems().find(x=>x.id===id),url=safeUrl(item?.link);if(!url)return;readIds.add(id);saveSet(KEYS.read,readIds);renderAll();window.open(url,'_blank','noopener')}

function renderManager(){
  const defaults=data.sources||[];
  $('#sourceManager').innerHTML=[...defaults.map(x=>`<div class="source-row" style="--dot:${sourceColor(x.id)}"><div><i></i><span><strong>${esc(x.name)}</strong><small>${esc(categoryInfo(x.category).name)} · ${x.status==='ok'?'抓取正常':x.status==='cached'?'使用上次缓存':'等待首次抓取'}</small></span></div><button type="button" class="${hiddenIds.has(x.id)?'':'on'}" data-toggle-source="${esc(x.id)}">${hiddenIds.has(x.id)?'已关闭':'已启用'}</button></div>`),...customFeeds.map(x=>`<div class="source-row" style="--dot:${sourceColor(x.id)}"><div><i></i><span><strong>${esc(x.name)}</strong><small>${esc(categoryInfo(x.category).name)} · 本机订阅</small></span></div><button type="button" class="remove" data-remove-source="${esc(x.id)}">移除</button></div>`)].join('')||'<p class="dialog-note">尚未载入订阅源。</p>';
  $$('[data-toggle-source]').forEach(x=>x.onclick=()=>{const id=x.dataset.toggleSource;hiddenIds.has(id)?hiddenIds.delete(id):hiddenIds.add(id);saveSet(KEYS.hidden,hiddenIds);renderManager();renderAll()});
  $$('[data-remove-source]').forEach(x=>x.onclick=()=>{const id=x.dataset.removeSource;customFeeds=customFeeds.filter(f=>f.id!==id);customItems=customItems.filter(i=>i.source_id!==id);store.set(KEYS.custom,customFeeds);store.set(KEYS.customItems,customItems);renderManager();renderAll();toast('已移除本机订阅')});
}

async function fetchText(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);try{let response;try{response=await fetch(url,{signal:ctl.signal,cache:'no-store'})}catch{}if(!response?.ok){const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;response=await fetch(proxy,{signal:ctl.signal,cache:'no-store'})}if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.text()}finally{clearTimeout(timer)}}
function parseCustomFeed(xml,source){
  const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))throw new Error('RSS XML 无法解析');
  const nodes=[...doc.querySelectorAll('item, entry')].slice(0,60);if(!nodes.length)throw new Error('没有找到文章');
  const pick=(node,names)=>{for(const name of names){const value=node.querySelector(name)?.textContent?.trim();if(value)return value}return ''};
  return nodes.map(node=>{const title=pick(node,['title']),link=node.querySelector('link')?.getAttribute('href')||pick(node,['link']),summary=pick(node,['description','summary','content\\:encoded','content']),date=pick(node,['pubDate','published','updated']),image=node.querySelector('enclosure[type^="image"]')?.getAttribute('url')||'';if(!title||!link)return null;return{id:`custom-${hash(source.id+'|'+link)}`,source_id:source.id,source:source.name,category:source.category,title,summary:new DOMParser().parseFromString(summary,'text/html').body.textContent.trim().slice(0,620),link,image,author:pick(node,['author name','dc\\:creator']),published_at:Number.isFinite(new Date(date).getTime())?new Date(date).toISOString():new Date().toISOString()}}).filter(Boolean);
}
async function refreshCustomFeed(source,quiet=false){try{const xml=await fetchText(source.url),items=parseCustomFeed(xml,source);customItems=[...items,...customItems.filter(x=>x.source_id!==source.id)].slice(0,500);store.set(KEYS.customItems,customItems);if(!quiet)toast(`${source.name}：读取 ${items.length} 篇`);return true}catch(error){if(!quiet)toast(`${source.name} 暂时无法读取`);return false}}
async function refreshCustomFeeds(){if(!customFeeds.length)return;await Promise.all(customFeeds.map(x=>refreshCustomFeed(x,true)))}
async function addCustomFeed(){const name=$('#newFeedName').value.trim(),url=safeUrl($('#newFeedUrl').value.trim()),cat=$('#newFeedCategory').value;if(!url)return toast('请输入完整的 RSS 地址');if(allSources().some(x=>x.url===url))return toast('这个订阅已经存在');const source={id:`custom-${hash(url)}`,name:name||new URL(url).hostname.replace(/^www\./,''),url,category:cat,custom:true};customFeeds.push(source);store.set(KEYS.custom,customFeeds);renderManager();const ok=await refreshCustomFeed(source,true);renderAll();toast(ok?'订阅已添加并读取':'已保存订阅，但当前网络无法读取')}

function exportOpml(){const sources=allSources().filter(x=>!hiddenIds.has(x.id));const groups={};sources.forEach(x=>(groups[categoryInfo(x.category).name]??=[]).push(x));const body=Object.entries(groups).map(([name,list])=>`<outline text="${esc(name)}" title="${esc(name)}">${list.map(x=>`<outline type="rss" text="${esc(x.name)}" title="${esc(x.name)}" xmlUrl="${esc(x.url)}"/>`).join('')}</outline>`).join('');const xml=`<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>RSS Orbit subscriptions</title><dateCreated>${new Date().toUTCString()}</dateCreated></head><body>${body}</body></opml>`;const blob=new Blob([xml],{type:'text/xml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`rss-orbit-${new Date().toISOString().slice(0,10)}.opml`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function importOpml(file){try{const doc=new DOMParser().parseFromString(await file.text(),'text/xml');if(doc.querySelector('parsererror'))throw new Error();let added=0;[...doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]')].forEach(node=>{const url=node.getAttribute('xmlUrl')||node.getAttribute('xmlurl'),safe=safeUrl(url);if(!safe||allSources().some(x=>x.url===safe))return;const parent=node.parentElement?.getAttribute('text')||'',match=Object.entries(CATEGORIES).find(([,x])=>parent.includes(x.name));customFeeds.push({id:`custom-${hash(safe)}`,name:node.getAttribute('title')||node.getAttribute('text')||new URL(safe).hostname,url:safe,category:match?.[0]||'other',custom:true});added++});store.set(KEYS.custom,customFeeds);renderManager();renderAll();toast(`已导入 ${added} 个订阅，正在尝试读取`);await refreshCustomFeeds();renderAll()}catch{toast('这个 OPML 文件无法读取')}finally{$('#opmlInput').value=''}}

function setTheme(theme){document.documentElement.dataset.theme=theme;store.set(KEYS.theme,theme);document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d1210':'#f4f7f4'}
function closeSidebar(){$('#sidebar').classList.remove('open');$('#scrim').classList.remove('show')}
function openManage(){renderManager();$('#manageDialog').showModal();closeSidebar()}
function showPane(name){$$('[data-pane]').forEach(x=>x.classList.toggle('active',x.dataset.pane===name));$$('.dialog-pane').forEach(x=>x.classList.toggle('active',x.id===`pane-${name}`))}
function syncStatus(){const stamp=data.generated_at?new Date(data.generated_at):null;if(stamp&&Number.isFinite(stamp.getTime())){$('#syncDot').className='ok';$('#syncText').textContent=`仓库更新于 ${fullDate(stamp)}`}else{$('#syncDot').className='error';$('#syncText').textContent='等待首次数据抓取'}}
async function loadData(force=false){const btn=$('#refreshButton');btn.classList.add('loading');try{const url=`${DATA_URL}${force?`?t=${Date.now()}`:''}`,response=await fetch(url,{cache:force?'no-store':'default'});if(!response.ok)throw new Error();const payload=await response.json();if(Array.isArray(payload.items)){data=payload;syncStatus();await refreshCustomFeeds();renderAll();if(force)toast(`已刷新 · ${data.items.length+customItems.length} 篇文章`)}}catch{$('#syncDot').className='error';$('#syncText').textContent='数据缓存暂时不可用';renderAll();if(force)toast('暂时无法刷新，请稍后再试')}finally{btn.classList.remove('loading')}}

$$('.nav-item').forEach(x=>x.onclick=()=>{view=x.dataset.view;category=null;feed=null;quickFilter='all';visibleLimit=40;$$('.filter-pill').forEach(y=>y.classList.toggle('active',y.dataset.filter==='all'));renderAll();closeSidebar()});
$$('.filter-pill').forEach(x=>x.onclick=()=>{quickFilter=x.dataset.filter;visibleLimit=40;$$('.filter-pill').forEach(y=>y.classList.toggle('active',y===x));renderList()});
$('#searchInput').oninput=e=>{query=e.target.value.trim();visibleLimit=40;renderAll()};
$('#sortButton').onclick=()=>{sortDesc=!sortDesc;$('#sortButton').textContent=sortDesc?'最新优先 ↓':'最早优先 ↑';renderList()};
$('#loadMoreButton').onclick=()=>{visibleLimit+=40;renderList()};
$('#markAllButton').onclick=()=>{const ids=filteredItems().map(x=>x.id);ids.forEach(id=>readIds.add(id));saveSet(KEYS.read,readIds);renderAll();toast(`已将 ${ids.length} 篇标为已读`)};
$('#refreshButton').onclick=()=>loadData(true);$('#themeButton').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('#readerClose').onclick=closeReader;$('#readerSave').onclick=()=>selectedId&&toggleSaved(selectedId);$('#readerUnread').onclick=()=>selectedId&&toggleRead(selectedId);$('#readerOpen').onclick=()=>{if(selectedId){readIds.add(selectedId);saveSet(KEYS.read,readIds);renderAll()}};
$('#mobileMenu').onclick=()=>{$('#sidebar').classList.add('open');$('#scrim').classList.add('show')};$('#mobileClose').onclick=closeSidebar;$('#scrim').onclick=closeSidebar;
$('#manageButton').onclick=openManage;$('#settingsButton').onclick=openManage;$$('[data-pane]').forEach(x=>x.onclick=()=>showPane(x.dataset.pane));
$('#addFeedButton').onclick=addCustomFeed;$('#exportButton').onclick=exportOpml;$('#opmlInput').onchange=e=>e.target.files?.[0]&&importOpml(e.target.files[0]);
$('#resetStateButton').onclick=()=>{if(confirm('清除全部已读和稍后读记录吗？')){readIds.clear();savedIds.clear();saveSet(KEYS.read,readIds);saveSet(KEYS.saved,savedIds);renderAll();toast('阅读状态已清除')}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||$('#manageDialog').open)return;if(e.key==='/'){e.preventDefault();$('#searchInput').focus()}if(['j','k'].includes(e.key.toLowerCase())){e.preventDefault();const idx=Math.max(0,renderedItems.findIndex(x=>x.id===selectedId)),next=e.key.toLowerCase()==='j'?Math.min(renderedItems.length-1,selectedId?idx+1:0):Math.max(0,idx-1);if(renderedItems[next]){selectArticle(renderedItems[next].id);document.querySelector(`[data-article="${CSS.escape(renderedItems[next].id)}"]`)?.scrollIntoView({block:'nearest'})}}if(e.key.toLowerCase()==='o'&&selectedId)openOriginal(selectedId);if(e.key.toLowerCase()==='s'&&selectedId)toggleSaved(selectedId);if(e.key.toLowerCase()==='m'&&selectedId)toggleRead(selectedId);if(e.key==='Escape')closeReader()});
window.addEventListener('message',e=>{if(e.data?.type==='pt-universe-theme'&&['light','dark'].includes(e.data.theme))setTheme(e.data.theme)});

setTheme(store.get(KEYS.theme,matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));renderAll();loadData();
