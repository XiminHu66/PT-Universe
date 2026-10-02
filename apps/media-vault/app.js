'use strict';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/media/';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const href=s=>esc(safeURL(s));
const db={get(k,d){try{return JSON.parse(localStorage.getItem('ptu.mv.'+k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem('ptu.mv.'+k,JSON.stringify(v));}catch{notice('浏览器无法保存本地记录，本次仍可使用。',true);}}};
const meta={music:['♫','音乐','LISTEN. DISCOVER. KEEP.','给喜欢的声音，<br>留一个位置。','从每日榜单发现音乐，寻找 FLAC 音源，收藏你的下一首循环。'],novels:['▤','轻小说','ONE MORE CHAPTER.','下一章，<br>随时随地继续。','输入小说链接、查看目录、保存进度，把喜欢的故事装进阅读器。'],anime:['▷','动漫','YOUR NEXT EPISODE.','好故事，<br>不止一种打开方式。','查找中文字幕动漫，解析单集链接，管理你的观看与下载。'],torrent:['↓','BT 下载','LET IT FLOW.','链接放进来，<br>文件慢慢到。','输入名称，同时搜索多个来源，直接获取磁力链接与种子。'],video:['◫','视频','A LINK. YOUR OPTIONS.','留下想看的，<br>按你的方式播放。','输入网页或媒体链接，查看格式、播放视频、保存字幕与文件。']};
let country=db.get('country','jp'),genre=db.get('genre','0'),chartItems=[],chartRequest=0,book=null,chapterIndex=0,readerContent='',readerChapter=null,readerName='',fontSize=21,engine=null,engineJobs=[],history=db.get('history',[]),shelf=db.get('shelf',[]),snapshot=null;
try{engine=JSON.parse(sessionStorage.getItem('mv.engine'));}catch{}
const loaded=new Set();
function notice(text,bad=false){$('#notice').hidden=!text;$('#notice').textContent=text;$('#notice').className=bad?'error':'';}
function empty(text){return `<div class="empty"><p>${esc(text)}</p></div>`;}
function date(s){return s?new Date(s).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚无成功更新';}
function bytes(n){return n>=1e9?(n/1e9).toFixed(2)+' GB':n>=1e6?(n/1e6).toFixed(1)+' MB':n>=1e3?(n/1e3).toFixed(1)+' KB':(n||0)+' B';}
async function busy(button,fn){if(button)button.disabled=true;try{return await fn();}catch(e){notice(e.message,true);}finally{if(button)button.disabled=false;}}
async function api(path,params={}){let r;try{r=await fetch(API+path+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(path==='health'?10000:45000),cache:'no-store'});}catch(e){throw new Error(e.name==='TimeoutError'?'来源响应超时，请重试；已缓存的章节仍可阅读。':'无法连接媒体服务，请点击右上角“检测连接”查看状态。');}const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{throw new Error('接口返回 HTTP '+r.status+'，请稍后重试');}if(!r.ok||d.error)throw new Error(d.error||'接口暂不可用');return d;}
async function callEngine(path,body,config=engine){if(!config)throw new Error('此功能需要下载引擎。点击右上角“设置 → 下载引擎设置” 连接自己的电脑或 NAS。');const r=await fetch(config.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(path.includes('novel')?90000:65000)});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'引擎请求失败');return d;}
function addHistory(title,status){history=[{title,status,time:new Date().toISOString()},...history].slice(0,80);db.set('history',history);$('#queueCount').textContent=engineJobs.filter(x=>['running','queued','active','waiting'].includes(x.status)).length||history.length;}
function downloadURL(url,title){
 const valid=safeURL(url);if(!valid)throw new Error('下载链接无效');
 const a=document.createElement('a');a.href=valid;a.rel='noopener';
 // Attachment responses navigate a named frame, never a popup created after an
 // async fetch (which browsers can silently block).
 const attachment=new URL(valid).origin===new URL(API).origin&&new URL(valid).searchParams.has('download');
 if(attachment){let frame=$('#downloadFrame');if(!frame){frame=document.createElement('iframe');frame.id='downloadFrame';frame.name='media-vault-download';frame.hidden=true;document.body.append(frame);}a.target=frame.name;}
 else a.target='_blank';
 a.download=title||'';document.body.append(a);a.click();a.remove();addHistory(title,'已交给浏览器下载');
}
function blobDownload(data,name,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);addHistory(name,'已生成本地文件');}
function player(track,url,type){if(!safeURL(url))throw new Error('没有可用音频链接');$('#player').hidden=false;$('#playerTitle').textContent=track.title;$('#playerArtist').textContent=track.artist||'';$('#playerArt').src=safeURL(track.artwork)||'../../icon.svg';$('#playerType').textContent=type;$('#audio').src=url;$('#audio').play().catch(e=>notice('播放失败：'+e.message,true));}
$('#audio').addEventListener('error',()=>notice('音频加载失败：来源可能不支持跨站播放，或该浏览器不支持此编码。',true));
$('#playerClose').onclick=()=>{$('#audio').pause();$('#audio').removeAttribute('src');$('#audio').load();$('#player').hidden=true;};
$('#tabs').innerHTML=['novels','music','anime','torrent','video'].map(id=>[id,meta[id]]).map(([id,m])=>`<a href="#${id}" data-tab="${id}"><b>${m[0]}</b>${m[1]}</a>`).join('');
function route(){let id=location.hash.slice(1)||'novels';if(!meta[id])id='novels';document.body.classList.toggle('novel-mode',id==='novels');if(id!=='video')$('#videoPlayer').pause();$$('.view').forEach(x=>x.hidden=x.id!==id);$$('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));$('#breadcrumb').textContent='发现 / '+meta[id][1];$('#eyebrow').textContent=meta[id][2];$('#title').innerHTML=meta[id][3];$('#subtitle').textContent=meta[id][4];notice('');window.scrollTo(0,0);if(!loaded.has(id)){loaded.add(id);if(id==='music')loadCharts();if(id==='novels'){renderShelf();renderNovelDownloads();}if(id==='anime')loadAnime();if(id==='torrent')loadTasks();}}
addEventListener('hashchange',route);
const countries=[['jp','日本'],['us','美国'],['cn','中国'],['tw','台湾'],['hk','香港'],['kr','韩国'],['gb','英国']];
$('#countries').innerHTML=countries.map(([id,name])=>`<button data-country="${id}">${name}</button>`).join('');
$$('[data-country]').forEach(b=>b.onclick=()=>{country=b.dataset.country;db.set('country',country);loadCharts();});$('#genre').value=genre;$('#genre').onchange=()=>{genre=$('#genre').value;db.set('genre',genre);loadCharts();};$('#chartRefresh').onclick=e=>busy(e.currentTarget,()=>loadCharts(true));
async function loadCharts(fresh=false){const request=++chartRequest,cc=country,gg=genre;$$('[data-country]').forEach(x=>x.classList.toggle('active',x.dataset.country===cc));$('#chartMeta').textContent='正在读取 '+countries.find(x=>x[0]===cc)?.[1]+' 榜单…';$('#chartList').innerHTML=empty('正在载入真实榜单…');let d,fallback=false;
 try{await snapshotReady;d=fresh?null:snapshot?.charts?.[cc+'-'+gg];fallback=!!d;if(!d)d=await api('charts',{country:cc,genre:gg,...(fresh?{refresh:'1'}:{})});}catch(e){d=snapshot?.charts?.[cc+'-'+gg];if(!d){if(request===chartRequest){$('#chartList').innerHTML=empty(e.message);$('#chartMeta').textContent='该地区 / 曲风暂无可用数据，可换一个分类重试。';}return;}fallback=true;if(fresh)notice('实时榜单暂不可用，保留最近成功快照：'+e.message,true);}
 if(request!==chartRequest)return;chartItems=d.items||[];$('#chartMeta').textContent=`${d.source} · ${date(d.updatedAt)}${fallback?' · 每日备份快照':' · 本次获取 '+date(d.fetchedAt)} · ${chartItems.length} 首 · 播放按钮为试听`;
 $('#chartList').innerHTML=chartItems.length?chartItems.map((x,i)=>`<article class="track"><span class="rank">${String(x.rank).padStart(2,'0')}</span><img loading="lazy" src="${href(x.artwork)}" alt=""><div class="track-info"><strong title="${esc(x.title)}">${esc(x.title)}</strong><small>${esc(x.artist)}</small></div><button data-preview="${i}" aria-label="试听 ${esc(x.title)}" ${x.preview?'':'disabled'}>▶</button>${x.preview?'':`<a href="${href(x.url)}" target="_blank" rel="noopener" title="在 Apple Music 打开">↗</a>`}<button class="find-track" data-find="${i}" title="搜索 FLAC">FLAC ↗</button></article>`).join(''):empty('该榜单内暂无此曲风；可以切换全部曲风。');
 $$('[data-preview]').forEach(b=>b.onclick=()=>{const t=chartItems[+b.dataset.preview];player(t,t.preview,'试听片段');});$$('[data-find]').forEach(b=>b.onclick=()=>{$('#musicQuery').value=chartItems[+b.dataset.find].artist+' '+chartItems[+b.dataset.find].title;searchMusic(b);});}
async function searchMusic(button){return busy(button,async()=>{
 const q=$('#musicQuery').value.trim();if(!q)return;const source=$('#musicSource').value;
 notice('正在搜索 '+(source==='archive'?'档案音源':'无损专辑')+'…');$('#musicResults').hidden=false;$('#albums').innerHTML=empty('查询中…');
 try{
  if(source==='qobuz'&&!engine)throw new Error('Qobuz 需要连接已配置你本人订阅凭据的私有下载引擎。请点击右上角“设置 → 下载引擎设置”；免费档案与 Ektoplazm 可直接使用。');
  const d=source==='qobuz'?await callEngine('/music/qobuz/search',{q}):await api(source==='archive'?'music/search':'music/ektoplazm',{q});
  $('#musicSourceStatus').textContent=d.source||'';
  $('#albums').innerHTML=d.items.length?d.items.map((x,i)=>`<article class="card">${x.artwork?`<img loading="lazy" src="${href(x.artwork)}" alt="">`:''}<span class="badge">${source==='archive'?'档案 FLAC':x.format||'FLAC'}</span><h3>${esc(x.title)}</h3><p>${esc(x.artist)}</p><p class="caption">${esc(x.album||'')}${x.size?' · '+bytes(x.size):''}</p><div class="actions">${source==='qobuz'?`<select data-qobuz-quality="${i}" aria-label="音质"><option value="6">FLAC 16-bit / 44.1 kHz</option><option value="7">FLAC 24-bit ≤96 kHz</option><option value="27">FLAC 24-bit ≤192 kHz</option></select><button data-qobuz-download="${i}" ${x.available?'':'disabled'}>${x.available?'↓ 订阅音轨下载':'此账户不可用'}</button>`:source==='archive'?`<button data-track-download="${i}">↓ 下载 FLAC</button><button data-track-play="${i}">▶ 播放</button>`:`<a class="button" href="${href(x.downloadURL)}" target="_blank" rel="noopener">↓ 下载 FLAC 专辑</a>`}</div></article>`).join(''):empty('该来源没有匹配结果，请更换关键词或音源。');
  $$('[data-qobuz-download]').forEach(b=>b.onclick=()=>busy(b,()=>submitJob('qobuz',d.items[+b.dataset.qobuzDownload].id,$('[data-qobuz-quality="'+b.dataset.qobuzDownload+'"]').value)));
  $$('[data-album]').forEach(b=>b.onclick=()=>busy(b,()=>showArchive(d.items[+b.dataset.album])));
  const resolve=async (b,play)=>{const t=d.items[Number(play?b.dataset.trackPlay:b.dataset.trackDownload)];return busy(b,async()=>{notice('正在获取 FLAC 文件…');const f=await api('archive/file',{id:t.id,name:t.name});if(play){player(t,f.url,'FLAC');notice('正在播放档案中的 FLAC 文件');}else await saveRemote(f.downloadURL||f.url,t.artist+' - '+t.title+'.flac',true,f.size);});};
  $$('[data-track-download]').forEach(b=>b.onclick=()=>resolve(b,false));$$('[data-track-play]').forEach(b=>b.onclick=()=>resolve(b,true));
  notice(`找到 ${d.items.length} 个结果。`);
 }catch(e){$('#albums').innerHTML=empty(e.message);throw e;}
});}
async function saveRemote(url,name,verifyFLAC=false,size=0){
 if(size>128e6){const r=await fetch(url,{headers:{Range:'bytes=0-3'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('文件不可访问：HTTP '+r.status);const reader=r.body.getReader(),first=await reader.read();await reader.cancel();if(verifyFLAC&&new TextDecoder().decode(first.value?.slice(0,4))!=='fLaC')throw new Error('文件签名不是 FLAC');downloadURL(url,name);notice('FLAC 文件已验证，已交给浏览器下载（'+bytes(size)+'）；完成情况请查看浏览器下载列表。');return;}

 notice('正在下载 '+name+'…');const r=await fetch(url,{signal:AbortSignal.timeout(240000)});if(!r.ok)throw new Error('文件下载失败：HTTP '+r.status);
 const blob=await r.blob();if(verifyFLAC&&await blob.slice(0,4).text()!=='fLaC')throw new Error('收到的文件不是 FLAC，已停止保存');
 if(!blob.size)throw new Error('下载文件为空');blobDownload(blob,name);notice('已生成下载文件：'+name+' · '+bytes(blob.size));
}
$('#musicSearch').onsubmit=e=>{e.preventDefault();searchMusic(e.submitter);};
async function showArchive(item){$('#files').showModal();$('#filesTitle').textContent=item.title;$('#filesList').innerHTML=empty('正在核验文件格式…');let d;try{d=await api('archive/files',{id:item.id});}catch(e){$('#filesList').innerHTML=empty(e.message);throw e;}const files=d.files.filter(x=>/\.flac$/i.test(x.name));$('#filesList').innerHTML=(files.length?files.map((f,i)=>`<div class="file-row"><strong>${esc(f.name)}</strong><p>${esc(f.format)} · ${bytes(f.size)}</p><div class="actions"><button data-file-play="${i}">▶ 播放</button><button data-file-save="${i}">↓ FLAC</button></div></div>`).join(''):empty('该资源目前没有可公开访问的 FLAC 文件。'))+`<p>来源许可证：${esc(d.license||'来源未提供许可证字段；请查看原始资源说明')}</p>`;$$('[data-file-play]').forEach(b=>b.onclick=()=>player({...item,title:files[+b.dataset.filePlay].name},files[+b.dataset.filePlay].url,'FLAC'));$$('[data-file-save]').forEach(b=>b.onclick=()=>downloadURL(files[+b.dataset.fileSave].url,files[+b.dataset.fileSave].name));}

// Novel workbench: reading state and each download job are independent.
let readerRequest=0,bookRequest=0,novelCatalogItems=null,novelSearchRequest=0;
const bookCatalogs=new Map(),chapterRequests=new Map(),sourceSlots=new Map();
let chapterDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const novelTasks=db.get('novelTasks',[]).map(t=>({...t,status:'interrupted',detail:'上次任务已结束；可复用缓存重新生成',blob:null}));
const MAX_NOVEL_DOWNLOADS=3;
const chapterDB=new Promise(resolve=>{try{const r=indexedDB.open('media-vault-reading',1);const timer=setTimeout(()=>resolve(null),2000);r.onupgradeneeded=()=>r.result.createObjectStore('chapters');r.onsuccess=()=>{clearTimeout(timer);resolve(r.result);};r.onerror=r.onblocked=()=>{clearTimeout(timer);resolve(null);};}catch{resolve(null);}});
async function chapterCache(key,value){const storage=await chapterDB;if(!storage)return null;try{return await new Promise(resolve=>{const tx=storage.transaction('chapters',value?'readwrite':'readonly'),table=tx.objectStore('chapters'),r=value?table.put(value,key):table.get(key);let result=null;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>resolve(null);});}catch{return null;}}
function checkStopped(stopped){if(stopped?.())throw new Error('已取消，已读取的章节和图片保留在缓存中');}
async function paceSource(url,kind,stopped){
 const origin=new URL(url).origin,key=kind+':'+origin,interval=kind==='image'?(url.includes('wenku8')?900:6000):(url.includes('wenku8')?3100:4200);
 const slot=(sourceSlots.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{checkStopped(stopped);const previous=sourceSlots.get(key+':time')||0,wait=Math.max(0,previous+interval-Date.now());if(wait)await chapterDelay(wait);checkStopped(stopped);sourceSlots.set(key+':time',Date.now());});sourceSlots.set(key,slot);await slot;
}
async function cachedChapter(url,paced=false,options={}){
 checkStopped(options.stopped);const key='v4:'+url,old=await chapterCache(key);if(old)return old;
 if(chapterRequests.has(url))return chapterRequests.get(url);
 const request=(async()=>{for(let attempt=0;attempt<3;attempt++){
  if(paced)await paceSource(url,'chapter');
  try{const d=await api('chapter',{url});if(!d.text?.trim()&&!d.blocks?.some(b=>b.type==='image'))throw new Error('来源没有返回完整正文');await chapterCache(key,d);return d;}
  catch(e){if(attempt===2||!/HTTP (429|502|503|504)\b/.test(e.message))throw e;options.onWait?.('来源暂时限流，正在等待重试');await chapterDelay((attempt+1)*15000);}
 }})();chapterRequests.set(url,request);try{return await request;}finally{chapterRequests.delete(url);}
}
function setNovelPane(pane){$('.novel-layout').dataset.pane=pane;$$('[data-novel-pane]').forEach(b=>{b.classList.toggle('active',b.dataset.novelPane===pane);b.setAttribute('aria-pressed',String(b.dataset.novelPane===pane));});}
function libraryMode(mode){$('#bookshelf').hidden=mode!=='shelf';$('#novelMatches').hidden=mode!=='matches';$('#showShelf').classList.toggle('active',mode==='shelf');$('#showMatches').classList.toggle('active',mode==='matches');setNovelPane('library');}
function lastChapterLabel(item){const index=item.lastReadIndex??db.get('progress',{})[item.url];return item.lastReadTitle?'上次：'+item.lastReadTitle:Number.isInteger(index)?'上次：第 '+(index+1)+' 章':'尚未开始阅读';}
function shelfHTML(item,i){return `<article class="book-row${book?.url===item.url?' selected':''}" data-book-row="${i}"><button class="book-select" data-book="${i}" aria-pressed="${book?.url===item.url}"><span class="book-monogram">${esc(item.title.slice(0,1))}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.source||'小说')} · ${item.chapters||'—'} 章</small><span class="last-read">${esc(lastChapterLabel(item))}</span></span></button><div class="book-row-actions"><button data-download-book="${i}" aria-label="下载 ${esc(item.title)}">↓ EPUB</button><button data-remove-book="${i}" aria-label="移除 ${esc(item.title)}">移除</button></div><div data-book-progress="${esc(item.url)}"></div></article>`;}
function renderShelf(){
 $('#shelfCount').textContent=shelf.length;$('#bookshelf').innerHTML=shelf.length?shelf.map(shelfHTML).join(''):'<div class="pane-empty">书架还是空的<br>在上方搜索想读的小说。</div>';
 $$('[data-book]').forEach(b=>b.onclick=()=>openNovel(shelf[+b.dataset.book].url,b));
 $$('[data-download-book]').forEach(b=>b.onclick=()=>openNovelDownload(shelf[+b.dataset.downloadBook]));
 $$('[data-remove-book]').forEach(b=>b.onclick=()=>{shelf.splice(+b.dataset.removeBook,1);db.set('shelf',shelf);renderShelf();});renderBookProgress();
}
async function getBook(url){if(bookCatalogs.has(url))return bookCatalogs.get(url);const d=await api('novel',{url});bookCatalogs.set(url,d);bookCatalogs.set(d.url,d);return d;}
async function openNovel(url,button){
 const request=++bookRequest;readerRequest++;return busy(button,async()=>{
 notice('正在读取小说目录…');try{const d=await getBook(url);if(request!==bookRequest)return;book=d;chapterIndex=-1;readerChapter=null;readerContent='';
 shelf=[{...shelf.find(x=>x.url===d.url),title:d.title,url:d.url,chapters:d.chapters.length,source:d.source,time:new Date().toISOString()},...shelf.filter(x=>x.url!==d.url)].slice(0,100);db.set('shelf',shelf);db.set('selectedNovel',d.url);renderShelf();
 $('#chapterBookTitle').textContent=d.title;$('#chapterMeta').textContent=`${d.source} · ${d.chapters.length} 章`;$('#chapterTools').hidden=false;$('#chapterFilter').value='';renderChapters();notice('');
 const index=Math.min(db.get('progress',{})[d.url]||0,d.chapters.length-1);await readChapter(index);
 }catch(e){if(request===bookRequest)notice(e.message,true);}});
}
function renderChapters(){if(!book)return;const query=$('#chapterFilter').value.trim();$('#chapterList').innerHTML=book.chapters.map((c,i)=>({c,i})).filter(({c})=>!query||normalizeTitle(c.title).includes(normalizeTitle(query))).map(({c,i})=>`<button class="chapter-row${i===chapterIndex?' active':''}" data-chapter="${i}" aria-current="${i===chapterIndex?'true':'false'}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(c.title)}</strong>${i===chapterIndex?'<i>阅读中</i>':''}</button>`).join('')||'<div class="pane-empty">没有匹配的章节</div>';$$('[data-chapter]').forEach(b=>b.onclick=()=>busy(b,()=>readChapter(+b.dataset.chapter)));}
async function readChapter(index){
 if(!book||index<0||index>=book.chapters.length)return;const request=++readerRequest,target=book,c=target.chapters[index];chapterIndex=index;readerChapter=null;readerContent='';
 $('#readerTitle').textContent=c.title;$('#readerActions').hidden=false;$('#readerPrev').disabled=$('#readerNext').disabled=$('#readerNextBottom').disabled=true;$('#readerDownload').disabled=$('#readerEPUB').disabled=true;$('#readerRetry').hidden=$('#readerAlternative').hidden=true;$('#readerText').textContent='正在读取完整章节与插图…';$('#readerPosition').textContent=`${index+1} / ${target.chapters.length}`;$('#readerSource').href=c.url;renderChapters();setNovelPane('reading');
 try{const d=await cachedChapter(c.url);if(request!==readerRequest)return;readerContent=d.text||'';readerChapter={...d,url:d.url||c.url};readerName=d.title||c.title;$('#readerTitle').textContent=readerName;$('#readerDownload').disabled=!readerContent;$('#readerEPUB').disabled=false;
 $('#readerText').innerHTML=d.blocks?.length?d.blocks.map(b=>b.type==='image'?`<figure><img loading="lazy" src="${href(novelImageLink(b.url,d.url||c.url))}" alt="章节插图"><figcaption hidden>图片加载失败。<button class="retry-image">重试图片</button></figcaption></figure>`:String(b.text||'').split(/\n+/).map(t=>`<p>${esc(t)}</p>`).join('')).join(''):String(d.text||'').split(/\n+/).map(t=>`<p>${esc(t)}</p>`).join('');
 $$('#readerText img').forEach(img=>{const caption=img.nextElementSibling;img.onerror=()=>{caption.hidden=false;};img.onload=()=>{caption.hidden=true;};caption.querySelector('button').onclick=()=>{img.src=img.src;};});$('#readerScroll').scrollTop=0;
 const progress=db.get('progress',{});progress[target.url]=index;db.set('progress',progress);const item=shelf.find(x=>x.url===target.url);if(item){item.lastReadIndex=index;item.lastReadTitle=c.title;item.time=new Date().toISOString();db.set('shelf',shelf);}renderShelf();$('#readingHint').textContent='已保存阅读进度 · '+c.title;
 }catch(e){if(request!==readerRequest)return;$('#readerText').innerHTML=`<div class="pane-empty">${esc(e.message)}</div>`;$('#readerRetry').hidden=$('#readerAlternative').hidden=false;throw e;
 }finally{if(request===readerRequest){$('#readerPrev').disabled=index===0;$('#readerNext').disabled=$('#readerNextBottom').disabled=index===target.chapters.length-1;}}
}
async function searchNovelTitles(q){
 const request=++novelSearchRequest;libraryMode('matches');$('#novelMatches').innerHTML='<div class="pane-empty">正在搜索小说…</div>';
 try{if(!novelCatalogItems){const d=await api('novel/catalog');novelCatalogItems=d.items;}if(request!==novelSearchRequest)return;
 const items=novelCatalogItems.filter(x=>matchesTitle(x.title+' '+(x.alias||'')+' '+(x.author||''),q));let count=40;
 const render=()=>{$('#novelMatches').innerHTML=`<p class="search-count">找到 ${items.length} 本小说</p>`+(items.length?items.slice(0,count).map((x,i)=>`<article class="book-row"><button class="book-select" data-novel-match="${i}"><span class="book-monogram">${esc(x.title.slice(0,1))}</span><span><strong>${esc(x.title)}</strong><small>${esc(x.author||'')} · ${esc(x.source)}</small></span></button><div class="book-row-actions"><button data-match-download="${i}">↓ EPUB</button></div></article>`).join(''):'<div class="pane-empty">没有匹配书名<br>试试减少关键词，或粘贴小说链接。</div>')+(items.length>count?'<button id="novelMore">显示更多</button>':'');$$('[data-novel-match]').forEach(b=>b.onclick=()=>openNovel(items[+b.dataset.novelMatch].url,b));$$('[data-match-download]').forEach(b=>b.onclick=()=>openNovelDownload(items[+b.dataset.matchDownload]));if($('#novelMore'))$('#novelMore').onclick=()=>{count+=40;render();};};render();
 }catch(e){if(request===novelSearchRequest)$('#novelMatches').innerHTML=`<div class="pane-empty">${esc(e.message)}</div>`;}
}
function findBookAlternatives(){if(!book)return;const q=book.title.split(/[（(]/)[0].replace(/[。.!！]+$/,'');$('#novelURL').value=q;searchNovelTitles(q);}
function novelImageLink(url,page,cover=false){return API+'novel/image?'+new URLSearchParams({url,page,...(cover?{cover:'1'}:{})});}
async function epubImage(url,page,cover,options){
 checkStopped(options.stopped);const key='image-v1:'+url,old=await chapterCache(key);if(old)return old;
 for(let attempt=0;attempt<3;attempt++){
  await paceSource(page,'image',options.stopped);checkStopped(options.stopped);
  try{const r=await fetch(novelImageLink(url,page,cover),{signal:AbortSignal.timeout(60000)});if(!r.ok){const error=await r.json().catch(()=>null);throw new Error(error?.error||'图片 HTTP '+r.status);}
   let blob=await r.blob();if(!/^image\/(jpeg|png|gif|webp)$/.test(blob.type)||!blob.size)throw new Error('图片响应无效');const bitmap=await createImageBitmap(blob);try{if(blob.type==='image/webp'){const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('插图转换失败');}}finally{bitmap.close();}
   const value={data:await blob.arrayBuffer(),type:blob.type};await chapterCache(key,value);return value;
  }catch(e){if(attempt===2||!/429|502|503|504|timeout|fetch|network/i.test(e.message))throw new Error('插图下载失败：'+e.message+'；重试会复用缓存');options.onProgress?.('图片来源繁忙，稍后重试…');await chapterDelay((attempt+1)*6000);}
 }
}
// Every novel download starts with a reviewable chapter selection.
let downloadSelection=null,downloadSelectionRequest=0;
function parseChapterRange(value,total){
 const normalized=value.trim().replace(/[，、；;]/g,',').replace(/[—–~～至]/g,'-');
 if(!normalized)throw new Error('请输入章节范围，例如 1-20，或 1-5, 8, 12-15。');
 const selected=new Set();
 for(const part of normalized.split(',')){
  const match=part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);if(!match)throw new Error('范围格式不正确，请使用 1-20 或 1-5, 8, 12-15。');
  const from=Number(match[1]),to=Number(match[2]||match[1]);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<1||to<from||to>total)throw new Error(`章节范围必须在 1–${total} 之间，且起始章不能大于结束章。`);
  for(let i=from-1;i<to;i++)selected.add(i);
 }
 return [...selected].sort((a,b)=>a-b);
}
function chapterRangeLabel(indices){
 const groups=[];for(let i=0;i<indices.length;i++){const start=indices[i]+1;let end=start;while(i+1<indices.length&&indices[i+1]===indices[i]+1)end=indices[++i]+1;groups.push(start===end?String(start):`${start}-${end}`);}return groups.join(', ');
}
function updateDownloadSelection(){
 const selection=downloadSelection;if(!selection)return;const count=selection.indices.size,total=selection.target.chapters.length;
 $('#downloadSelectionCount').textContent=`已选择 ${count} / ${total} 章`;
 $('#downloadSelectAll').checked=count===total;$('#downloadSelectAll').indeterminate=count>0&&count<total;
 $('#downloadConfirm').disabled=!count;$('#downloadConfirm').textContent=count?`加入下载队列（${count} 章）`:'请先选择章节';
 $$('#downloadChapterList input').forEach(input=>{input.checked=selection.indices.has(Number(input.value));});
 $('#downloadSelectionError').hidden=true;
}
function renderDownloadSelection(){
 const selection=downloadSelection;if(!selection)return;
 $('#downloadChapterList').innerHTML=selection.target.chapters.map((chapter,index)=>`<label class="download-chapter-option"><input type="checkbox" value="${index}" data-download-chapter="${index}"><span class="download-chapter-number">${index+1}</span><span>${esc(chapter.title)}</span></label>`).join('');
 $$('#downloadChapterList input').forEach(input=>input.onchange=()=>{if(input.checked)selection.indices.add(Number(input.value));else selection.indices.delete(Number(input.value));updateDownloadSelection();});updateDownloadSelection();
}
async function openNovelDownload(item,preset={}){
 const request=++downloadSelectionRequest,dialog=$('#downloadChapterDialog');downloadSelection=null;
 $('#downloadBookTitle').textContent=item.title||'正在读取小说';$('#downloadSelectionCount').textContent='正在读取章节目录…';$('#downloadSelectionError').hidden=true;$('#downloadSelectionFields').hidden=true;$('#downloadReload').hidden=true;$('#downloadConfirm').disabled=true;$('#downloadConfirm').textContent='正在读取目录…';$('#downloadRange').value='';
 if(!dialog.open)dialog.showModal();
 try{const target=Array.isArray(item.chapters)?item:await getBook(item.url);if(request!==downloadSelectionRequest||!dialog.open)return;if(!target.chapters?.length)throw new Error('这本小说没有可下载章节。');
  downloadSelection={target:{...target,chapters:[...target.chapters]},indices:new Set(preset.indices||target.chapters.map((_,i)=>i))};$('#downloadBookTitle').textContent=target.title;$('#downloadSelectionFields').hidden=false;renderDownloadSelection();
 }catch(e){if(request!==downloadSelectionRequest||!dialog.open)return;$('#downloadSelectionCount').textContent='目录读取失败';$('#downloadSelectionError').textContent=e.message;$('#downloadSelectionError').hidden=false;$('#downloadReload').hidden=false;$('#downloadReload').onclick=()=>openNovelDownload(item,preset);$('#downloadConfirm').textContent='请先读取目录';}
}
$('#downloadChapterDialog').onclose=()=>{downloadSelectionRequest++;downloadSelection=null;};
$('#downloadSelectAll').onchange=e=>{if(!downloadSelection)return;downloadSelection.indices=new Set(e.target.checked?downloadSelection.target.chapters.map((_,i)=>i):[]);updateDownloadSelection();};
$('#downloadClear').onclick=()=>{if(downloadSelection){downloadSelection.indices.clear();updateDownloadSelection();}};
function applyDownloadRange(){if(!downloadSelection)return;try{downloadSelection.indices=new Set(parseChapterRange($('#downloadRange').value,downloadSelection.target.chapters.length));updateDownloadSelection();}catch(e){$('#downloadSelectionError').textContent=e.message;$('#downloadSelectionError').hidden=false;}}
$('#downloadApplyRange').onclick=applyDownloadRange;
$('#downloadRange').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyDownloadRange();}};
$('#downloadConfirm').onclick=()=>{if(!downloadSelection?.indices.size)return;enqueueNovel(downloadSelection.target,{indices:[...downloadSelection.indices].sort((a,b)=>a-b)});$('#downloadChapterDialog').close();};

function persistNovelTasks(){db.set('novelTasks',novelTasks.slice(0,30).map(({id,url,title,from,to,indices,status,progress,detail})=>({id,url,title,from,to,indices,status,progress,detail})));}
function taskProgressHTML(task){return `<div class="novel-task-progress"><progress max="100" value="${task.progress||0}" aria-label="${esc(task.title)} 下载进度"></progress><span>${Math.floor(task.progress||0)}%</span></div><p class="task-detail">${esc(task.detail)}</p>`;}
function novelTaskHTML(task){return `<article class="novel-task" data-novel-task="${task.id}" data-status="${task.status}"><strong>${esc(task.title)}</strong><span class="task-state">${({queued:'排队中',running:'下载中',ready:'EPUB 已就绪',error:'下载失败',cancelled:'已取消',interrupted:'可恢复'})[task.status]}</span>${taskProgressHTML(task)}<div class="actions">${task.blob?`<button data-novel-save="${task.id}">保存 EPUB</button>`:''}${['queued','running'].includes(task.status)?`<button data-novel-cancel="${task.id}">取消</button>`:`<button data-novel-retry="${task.id}">重新生成</button><button data-novel-dismiss="${task.id}">移除任务</button>`}</div></article>`;}
function novelDownloadHTML(){return novelTasks.length?'<h3>小说下载</h3>'+novelTasks.map(novelTaskHTML).join(''):'';}
function renderBookProgress(){$$('[data-book-progress]').forEach(el=>{const task=novelTasks.find(t=>t.url===el.dataset.bookProgress&&['queued','running','ready','error'].includes(t.status));el.innerHTML=task?taskProgressHTML(task):'';});}
function renderNovelDownloads(){
 $('#novelTaskCount').textContent=novelTasks.filter(t=>['queued','running'].includes(t.status)).length;$('#novelTaskList').innerHTML=novelTasks.length?novelTasks.map(novelTaskHTML).join(''):'<p class="caption">从小说旁的 ↓ EPUB 开始下载。</p>';$('#saveNovelBundle').hidden=novelTasks.filter(t=>t.blob).length<2;renderBookProgress();renderQueue();
}
function updateNovelTask(task,detail,progress){task.detail=detail;if(progress!==undefined)task.progress=Math.max(task.progress||0,Math.min(progress,100));renderNovelDownloads();}
function enqueueNovel(item,range={}){
 const indices=range.indices?[...new Set(range.indices)].sort((a,b)=>a-b):null;
 const duplicate=novelTasks.find(t=>t.url===item.url&&(indices?JSON.stringify(t.indices)===JSON.stringify(indices):!t.indices&&t.from===(range.from||1)&&t.to===(range.to||null))&&['queued','running'].includes(t.status));if(duplicate){notice('这本小说已在下载队列中。');return duplicate;}
 const task={id:crypto.randomUUID(),url:item.url,title:item.title||'正在读取书名',indices,from:range.from||1,to:range.to||null,target:Array.isArray(item.chapters)?{...item,chapters:[...item.chapters]}:null,status:'queued',progress:0,detail:'等待开始',stopped:false,blob:null};novelTasks.unshift(task);persistNovelTasks();renderNovelDownloads();pumpNovelDownloads();return task;
}
async function runNovelTask(task){
 task.status='running';task.stopped=false;updateNovelTask(task,'正在读取目录',1);const options={stopped:()=>task.stopped,onProgress:text=>updateNovelTask(task,text),onWait:text=>updateNovelTask(task,text)};
 try{const target=task.target||await getBook(task.url);task.target=target;task.title=target.title;const from=task.from,to=task.to||target.chapters.length;
  const indices=task.indices||Array.from({length:Math.max(0,to-from+1)},(_,i)=>from-1+i);
  if(!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=target.chapters.length))throw new Error('章节范围已变化，请重新选择');const chapters=[];
  for(let n=0;n<indices.length;n++){const i=indices[n];checkStopped(options.stopped);updateNovelTask(task,`正文 ${n+1} / ${indices.length} · ${target.chapters[i].title}`,5+60*n/indices.length);const d=await cachedChapter(target.chapters[i].url,true,options);checkStopped(options.stopped);chapters.push({...d,url:d.url||target.chapters[i].url,title:d.title||target.chapters[i].title});}
  const rangeLabel=chapterRangeLabel(indices);task.filename=target.title+(indices.length===target.chapters.length?'':`（${rangeLabel.length<48?rangeLabel+'章':indices.length+'章选集'}）`)+'.epub';
  const result=await createBookEPUB(target.title,chapters,{...options,cover:target.cover,page:target.url,download:false,onImages:(done,total)=>updateNovelTask(task,`插图与封面 ${done} / ${total}`,65+30*(total?done/total:1)),onZip:percent=>updateNovelTask(task,'正在打包 EPUB',95+percent*.05)});
  checkStopped(options.stopped);task.blob=result.blob;task.status='ready';updateNovelTask(task,`${chapters.length} 章 · ${result.images} 张图片 · 可保存 EPUB`,100);
  // Keep the file available even when browsers block multiple automatic downloads.
  blobDownload(task.blob,task.filename);task.autoSaveRequested=true;
 }catch(e){task.status=task.stopped?'cancelled':'error';updateNovelTask(task,e.message);}finally{persistNovelTasks();renderNovelDownloads();pumpNovelDownloads();}
}
function pumpNovelDownloads(){let available=MAX_NOVEL_DOWNLOADS-novelTasks.filter(t=>t.status==='running').length;for(const task of [...novelTasks].reverse()){if(available<=0)break;if(task.status==='queued'){available--;runNovelTask(task);}}}
function bindNovelTaskActions(){
 $$('[data-novel-save]').forEach(b=>b.onclick=()=>{const t=novelTasks.find(t=>t.id===b.dataset.novelSave);if(t?.blob)blobDownload(t.blob,t.filename);});
 $$('[data-novel-cancel]').forEach(b=>b.onclick=()=>{const t=novelTasks.find(t=>t.id===b.dataset.novelCancel);if(!t)return;t.stopped=true;if(t.status==='queued')t.status='cancelled';t.detail=t.status==='cancelled'?'已取消':'正在取消…';persistNovelTasks();renderNovelDownloads();pumpNovelDownloads();});
 $$('[data-novel-retry]').forEach(b=>b.onclick=()=>{const t=novelTasks.find(t=>t.id===b.dataset.novelRetry);if(!t||['queued','running'].includes(t.status))return;t.status='queued';t.progress=0;t.stopped=false;t.blob=null;persistNovelTasks();renderNovelDownloads();pumpNovelDownloads();});
 $$('[data-novel-dismiss]').forEach(b=>b.onclick=()=>{const i=novelTasks.findIndex(t=>t.id===b.dataset.novelDismiss);if(i>=0&&!['running','queued'].includes(novelTasks[i].status)){novelTasks.splice(i,1);persistNovelTasks();renderNovelDownloads();}});
}
$('#saveNovelBundle').onclick=e=>busy(e.currentTarget,async()=>{const ready=novelTasks.filter(t=>t.blob),zip=new JSZip();for(let i=0;i<ready.length;i++)zip.file(`${i+1}-${ready[i].filename}`,await ready[i].blob.arrayBuffer());blobDownload(await zip.generateAsync({type:'blob'}),'小说下载合集.zip');});
$('#bookEPUB').onclick=()=>{if(book)openNovelDownload(book);};
$('#bookContinue').onclick=e=>busy(e.currentTarget,()=>readChapter(Math.min(db.get('progress',{})[book.url]||0,book.chapters.length-1)));
$('#novelSearch').onsubmit=e=>{e.preventDefault();const q=$('#novelURL').value.trim();if(/^https?:\/\//i.test(q))openNovel(q,e.submitter);else busy(e.submitter,()=>searchNovelTitles(q));};
$('#showShelf').onclick=()=>libraryMode('shelf');$('#showMatches').onclick=()=>libraryMode('matches');$('#chapterFilter').oninput=renderChapters;
$$('[data-novel-pane]').forEach(b=>b.onclick=()=>setNovelPane(b.dataset.novelPane));
$('#readerPrev').onclick=()=>readChapter(chapterIndex-1).catch(e=>notice(e.message,true));$('#readerNext').onclick=$('#readerNextBottom').onclick=()=>readChapter(chapterIndex+1).catch(e=>notice(e.message,true));$('#readerDownload').onclick=()=>blobDownload(readerContent,readerName+'.txt');
const DEFAULT_READER_FONT=21;
let novelUIScale=Math.max(90,Math.min(120,Number(db.get('novelUIScale',100))||100));
function applyNovelTypography(persist=true){
 document.documentElement.style.setProperty('--novel-ui-scale',novelUIScale/100);
 $('#readerText').style.fontSize=fontSize+'px';$('#novelUIScale').value=novelUIScale;$('#novelUIScaleValue').textContent=novelUIScale+'%';$('#readerFontSetting').value=fontSize;$('#readerFontValue').textContent=fontSize+' px';$('#novelTypePreview').style.fontSize=(17*novelUIScale/100)+'px';$('#readerTypePreview').style.fontSize=fontSize+'px';
 if(persist){db.set('novelUIScale',novelUIScale);db.set('readerFont',fontSize);}
}
fontSize=Math.max(14,Math.min(32,Number(db.get('readerFont',DEFAULT_READER_FONT))||DEFAULT_READER_FONT));applyNovelTypography(false);
$('#fontMinus').onclick=()=>{fontSize=Math.max(14,fontSize-1);applyNovelTypography();};$('#fontPlus').onclick=()=>{fontSize=Math.min(32,fontSize+1);applyNovelTypography();};
$('#displaySettingsOpen').onclick=()=>$('#displaySettings').showModal();
$('#novelUIScale').oninput=e=>{novelUIScale=Number(e.target.value);applyNovelTypography();};$('#readerFontSetting').oninput=e=>{fontSize=Number(e.target.value);applyNovelTypography();};
$('#displaySettingsReset').onclick=()=>{novelUIScale=100;fontSize=DEFAULT_READER_FONT;applyNovelTypography();};
$('#readerRetry').onclick=e=>busy(e.currentTarget,()=>readChapter(chapterIndex));$('#readerAlternative').onclick=findBookAlternatives;
$('#readerEPUB').onclick=e=>busy(e.currentTarget,async()=>{if(readerChapter&&book){await openNovelDownload(book,{indices:[chapterIndex]});return;}await createBookEPUB(readerName,[{title:readerName,text:readerContent}]);});
$('#txtImport').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>8e6){notice('TXT 最大支持 8 MB',true);return;}readerRequest++;readerChapter=null;readerContent=await f.text();readerName=f.name.replace(/\.txt$/i,'');$('#readerTitle').textContent=readerName;$('#readerText').innerHTML=readerContent.split(/\n+/).map(t=>'<p>'+esc(t)+'</p>').join('');$('#readerActions').hidden=false;$('#readerPrev').disabled=$('#readerNext').disabled=$('#readerNextBottom').disabled=true;$('#readerDownload').disabled=$('#readerEPUB').disabled=false;$('#readerPosition').textContent='';$('#readerSource').removeAttribute('href');setNovelPane('reading');e.target.value='';};
function applyTheme(theme){document.documentElement.dataset.theme=theme;$('#themeToggle').textContent=theme==='light'?'☾ 深色':'☀ 浅色';$('#themeToggle').setAttribute('aria-label',theme==='light'?'切换深色主题':'切换浅色主题');db.set('theme',theme);}
applyTheme(db.get('theme','light')==='dark'?'dark':'light');$('#themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
addEventListener('beforeunload',e=>{if(novelTasks.some(t=>['queued','running'].includes(t.status))){e.preventDefault();e.returnValue='';}});

async function createBookEPUB(title,chapters,options={}){
 const zip=new JSZip(),uid=crypto.randomUUID(),images=new Map(),bodies=[];
 zip.file('mimetype','application/epub+zip',{compression:'STORE'});
 const imageTotal=new Set([...(options.cover?[options.cover]:[]),...chapters.flatMap(c=>(c.blocks||[]).filter(b=>b.type==='image').map(b=>b.url))]).size;options.onImages?.(0,imageTotal);
 const stopped=()=>{if(options.stopped?.())throw new Error('已停止打包，已下载的正文和图片已保留');};
 const addImage=async(url,page,cover=false)=>{
  stopped();if(images.has(url))return images.get(url);
  options.onProgress?.(`正在下载第 ${images.size+1} 张图片（插图 / 封面）。请保持页面打开。`);
  stopped();
  const data=await epubImage(url,page,cover,options);stopped();
  const item={id:'img'+images.size,path:'images/'+images.size+'.'+({'image/jpeg':'jpg','image/png':'png','image/gif':'gif'}[data.type]),type:data.type};
  zip.file('OEBPS/'+item.path,data.data);images.set(url,item);options.onImages?.(images.size,imageTotal);return item;
 };
 let coverImage=null;if(options.cover)coverImage=await addImage(options.cover,options.page,true);
 for(const c of chapters){
  const body=[];for(const b of c.blocks?.length?c.blocks:[{type:'text',text:c.text||''}]){
   stopped();if(b.type==='image'){const item=await addImage(b.url,c.url);body.push(`<div class="illustration"><img src="${item.path}" alt="插图" /></div>`);}
   else body.push(String(b.text||'').split(/\n+/).map(t=>'<p>'+esc(t)+'</p>').join(''));
  }bodies.push(body.join(''));
 }
 // When metadata has no cover, the first illustration is a useful fallback.
 if(!coverImage&&images.size)coverImage=images.values().next().value;
 const ordered=zip;
 ordered.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
 const page=(name,body)=>`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh"><head><title>${esc(name)}</title><style>body{line-height:1.7}p{text-indent:2em}.illustration{text-align:center;page-break-inside:avoid}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
 chapters.forEach((c,i)=>ordered.file(`OEBPS/${chapters.length===1?'chapter':'c'+i}.xhtml`,page(c.title,`<h1>${esc(c.title)}</h1>`+bodies[i])));
 const chapterPath=i=>(chapters.length===1?'chapter':'c'+i)+'.xhtml';
 if(coverImage)ordered.file('OEBPS/cover.xhtml',page('封面',`<div class="illustration"><img src="${coverImage.path}" alt="封面" /></div>`));
 ordered.file('OEBPS/nav.xhtml',`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${chapters.map((c,i)=>`<li><a href="${chapterPath(i)}">${esc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`);
 ordered.file('OEBPS/content.opf',`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${uid}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>zh</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/,'Z')}</meta>${coverImage?`<meta name="cover" content="${coverImage.id}"/>`:''}</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_,i)=>`<item id="c${i}" href="${chapterPath(i)}" media-type="application/xhtml+xml"/>`).join('')}${[...images.values()].map(x=>`<item id="${x.id}" href="${x.path}" media-type="${x.type}"${x===coverImage?' properties="cover-image"':''}/>`).join('')}${coverImage?'<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>':''}</manifest><spine>${coverImage?'<itemref idref="cover"/>':''}${chapters.map((_,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`);
 stopped();options.onProgress?.('正在打包 EPUB…');const blob=await ordered.generateAsync({type:'blob',mimeType:'application/epub+zip'},meta=>options.onZip?.(meta.percent));stopped();if(options.download!==false)blobDownload(blob,title+'.epub');return {images:images.size,blob};
}

const toSimplified=OpenCC.Converter({from:'tw',to:'cn'}),toTraditional=OpenCC.Converter({from:'cn',to:'tw'});
const normalizeTitle=s=>toSimplified(String(s)).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const matchesTitle=(title,q)=>q.trim().split(/\s+/).every(term=>normalizeTitle(title).includes(normalizeTitle(term)));
let animeRequest=0,animeCatalogItems=null,animeFiltered=[],animePage=1,animeCategory=null;
async function loadAnime(q='',fresh=false){
 const request=++animeRequest;animeCategory=null;$('#animeBack').hidden=true;$('#animeList').innerHTML=empty('正在读取完整番剧目录…');
 try{if(!animeCatalogItems||fresh){const d=await api('anime',fresh?{refresh:'1'}:{});if(request!==animeRequest)return;animeCatalogItems=d.items.map(x=>({...x,normalized:normalizeTitle(x.title)}));const year=$('#animeYear'),value=year.value;year.innerHTML='<option value="">全部年份</option>'+[...new Set(d.items.map(x=>x.year).filter(Boolean))].sort().reverse().map(y=>`<option>${esc(y)}</option>`).join('');year.value=value;}
 if(request!==animeRequest)return;$('#animeQuery').value=q;filterAnime();
 }catch(e){if(request===animeRequest){$('#animeList').innerHTML=empty(e.message);$('#animeMeta').textContent='目录读取失败';$('#animePager').hidden=true;}}
}
function filterAnime(){
 if(!animeCatalogItems)return;animeRequest++;animeCategory=null;$('#animeBack').hidden=true;
 const q=$('#animeQuery').value,year=$('#animeYear').value,season=$('#animeSeason').value,terms=q.trim().split(/\s+/).map(normalizeTitle).filter(Boolean);
 animeFiltered=animeCatalogItems.filter(x=>(!year||x.year===year)&&(!season||x.season===season)&&terms.every(t=>x.normalized.includes(t)));animePage=1;renderAnime();
}
function renderAnime(){
 const totalPages=Math.max(1,Math.ceil(animeFiltered.length/36));animePage=Math.min(animePage,totalPages);const rows=animeFiltered.slice((animePage-1)*36,animePage*36);
 $('#animeMeta').textContent=`完整目录 ${animeCatalogItems.length} 部 · 匹配 ${animeFiltered.length} 部 · 简繁体通用`;
 $('#animeList').innerHTML=rows.length?rows.map(x=>`<article class="card"><span class="badge">${esc(x.year)} ${esc(x.season)}</span><h3>${esc(x.title)}</h3><p>${esc(x.episodes)}${x.group?' · '+esc(x.group):''}</p><div class="actions"><button data-series="${x.id}">查看剧集</button><a href="${href(x.url)}" target="_blank" rel="noopener">原站 ↗</a></div></article>`).join(''):empty('目录中没有匹配番剧，请减少关键词或清除年份筛选。');
 $('#animePager').hidden=false;$('#animePageLabel').textContent=`第 ${animePage} / ${totalPages} 页`;$('#animePrev').disabled=animePage<=1;$('#animeNext').disabled=animePage>=totalPages;
 $$('[data-series]').forEach(b=>b.onclick=()=>busy(b,()=>loadEpisodes(b.dataset.series,1)));
}
async function loadEpisodes(id,page=1){
 const request=++animeRequest;animeCategory=id;$('#animePrev').disabled=true;$('#animeNext').disabled=true;$('#animeList').innerHTML=empty('正在读取剧集…');$('#animeBack').hidden=false;
 try{const d=await api('anime/episodes',{id,page});if(request!==animeRequest)return;animePage=page;
 $('#animeMeta').textContent=(animeCatalogItems?.find(x=>String(x.id)===String(id))?.title||'番剧')+' · 剧集按最近发布排列';
 $('#animeList').innerHTML=d.items.length?d.items.map((x,i)=>`<article class="card"><h3>${esc(x.title)}</h3><div class="actions"><button data-episode="${i}">解析 / 播放</button><a href="${href(x.url)}" target="_blank" rel="noopener">原站 ↗</a></div></article>`).join(''):empty('本页没有可用剧集');
 $('#animePager').hidden=false;$('#animePageLabel').textContent='剧集第 '+page+' 页';$('#animePrev').disabled=page<=1;$('#animeNext').disabled=!d.hasNext;
 $$('[data-episode]').forEach(b=>b.onclick=()=>parseVideo(d.items[+b.dataset.episode].url,b));
 }catch(e){if(request===animeRequest){$('#animeList').innerHTML=empty(e.message);$('#animePager').hidden=true;}}
}
$('#animeSearch').onsubmit=e=>{e.preventDefault();const q=$('#animeQuery').value.trim();if(/^https:\/\//i.test(q)){try{const u=new URL(q);if(u.hostname==='anime1.me'&&u.searchParams.has('cat'))busy(e.submitter,()=>loadEpisodes(u.searchParams.get('cat')));else parseVideo(q,e.submitter);}catch{notice('链接无效',true);}}else busy(e.submitter,()=>loadAnime(q));};
$('#animeRefresh').onclick=e=>busy(e.currentTarget,()=>loadAnime($('#animeQuery').value,true));
$('#animeYear').onchange=$('#animeSeason').onchange=filterAnime;
$('#animeBack').onclick=()=>{animeRequest++;filterAnime();};
for(const [id,delta] of [['animePrev',-1],['animeNext',1]])$('#'+id).onclick=e=>{if(animeCategory)loadEpisodes(animeCategory,animePage+delta);else{animePage+=delta;renderAnime();$('#animeMeta').scrollIntoView({block:'start'});}};
async function parseVideo(url,button){return busy(button,async()=>{location.hash='video';$('#videoURL').value=url;$('#videoResult').innerHTML=empty('解析中…');notice('');try{const native=new URL(url).hostname==='anime1.me';const d=native||!engine?await api('video',{url}):await callEngine('/resolve',{url});const formats=d.formats||[];$('#videoResult').innerHTML=`<div class="section-head"><h2>${esc(d.title)}</h2><span class="badge">${formats.length} 个选项</span></div>${engine&&!native?'<button id="videoBest" class="primary">↓ 下载并合并最佳画质</button>':''}<div>${formats.map((f,i)=>`<div class="file-row"><strong>${esc(f.label||f.format||f.ext||'媒体')}</strong><p>${esc(f.note||'')} ${f.size?bytes(f.size):''}${f.audioOnly?' · 仅音频':f.videoOnly?' · 仅视频，需合并':''}</p><div class="actions">${f.url&&!f.videoOnly?`<button data-video-play="${i}">▶ 尝试播放</button>`:''}<button data-video-save="${i}">↓ ${engine&&!native?'下载此格式':native?'下载 MP4':'打开媒体链接'}</button></div></div>`).join('')}</div><p class="caption">HLS / DASH 是分片清单，浏览器是否能播放取决于系统；保存合并文件请使用引擎。纯视频轨道不包含声音。</p>`;$$('[data-video-play]').forEach(b=>b.onclick=()=>{const f=formats[+b.dataset.videoPlay];$('#audio').pause();$('#videoPlayer').hidden=false;$('#subtitleLabel').hidden=false;$('#videoPlayer').src=safeURL(f.url);$('#videoPlayer').scrollIntoView({behavior:'smooth',block:'center'});$('#videoPlayer').play().catch(e=>notice('浏览器无法直接播放此格式：'+e.message,true));});$$('[data-video-save]').forEach(b=>b.onclick=()=>busy(b,()=>engine&&!native?submitJob('video',url,formats[+b.dataset.videoSave].id):downloadURL(formats[+b.dataset.videoSave].downloadURL||formats[+b.dataset.videoSave].url,d.title)));if(native&&$('[data-video-play]'))$('[data-video-play]').click();if($('#videoBest'))$('#videoBest').onclick=e=>busy(e.currentTarget,()=>submitJob('video',url));}catch(e){$('#videoResult').innerHTML=empty(e.message);throw e;}});}
$('#videoForm').onsubmit=e=>{e.preventDefault();parseVideo($('#videoURL').value.trim(),e.submitter);};$('#videoPlayer').onerror=()=>notice('视频无法直接播放，可尝试下载引擎或返回原站。',true);
let subtitleBlob;$('#subtitleImport').onchange=e=>{const f=e.target.files[0];if(!f)return;if(subtitleBlob)URL.revokeObjectURL(subtitleBlob);subtitleBlob=URL.createObjectURL(f);$('#videoPlayer').querySelectorAll('track').forEach(t=>t.remove());const t=document.createElement('track');t.kind='subtitles';t.label='中文字幕';t.srclang='zh';t.src=subtitleBlob;t.default=true;$('#videoPlayer').append(t);};
async function submitJob(kind,url,format){const d=await callEngine('/jobs',{kind,url,format});notice('任务已提交到你的引擎：'+d.id+'。在下载任务中查看进度与结果。');addHistory(url,'引擎任务已提交');await loadTasks();return d;}
$('#torrentForm').onsubmit=e=>{e.preventDefault();const url=$('#torrentURL').value.trim();if(engine){busy(e.submitter,()=>submitJob('torrent',url));return;}busy(e.submitter,()=>{if(/^magnet:\?xt=urn:btih:[a-z0-9]+/i.test(url)){const a=document.createElement('a');a.href=url;document.body.append(a);a.click();a.remove();notice('已请求本机 BT 客户端接手。需先安装支持磁力链接的客户端；无需常驻服务器。');}else if(safeURL(url)){downloadURL(url,'种子或直链文件');notice('已打开文件下载。种子文件请用本机 BT 客户端打开。');}else throw new Error('请输入磁力链接或有效 HTTP(S) 下载链接');});};
function openSettings(){$('#engineURL').value=engine?.url||localStorage.getItem('mv.engine.url')||'http://localhost:8789';$('#engineToken').value=engine?.token||'';$('#settings').showModal();}
$('#settingsOpen').onclick=()=>{$('#displaySettings').close();openSettings();};$('#torrentConnect').onclick=openSettings;
$('#engineSave').onclick=e=>busy(e.currentTarget,async()=>{const u=new URL($('#engineURL').value.trim());if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('引擎地址无效');if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('远程引擎请使用 HTTPS 地址');const config={url:u.href.replace(/\/$/,''),token:$('#engineToken').value.trim()};if(config.token.length<24)throw new Error('请输入完整访问密钥');$('#settingsStatus').textContent='正在连接…';try{await callEngine('/health',null,config);engine=config;sessionStorage.setItem('mv.engine',JSON.stringify(config));localStorage.setItem('mv.engine.url',config.url);$('#settingsStatus').textContent='连接成功。现在可以提交 BT、视频和小说任务。';$('#engineStatus').textContent='● 引擎已连接';loadTasks();}catch(e){$('#settingsStatus').textContent='连接失败：'+e.message;throw e;}});
$('#engineDisconnect').onclick=()=>{engine=null;sessionStorage.removeItem('mv.engine');$('#engineToken').value='';$('#engineStatus').textContent='网页直连模式';$('#settingsStatus').textContent='已断开';engineJobs=[];loadTasks();};$$('[data-close]').forEach(b=>b.onclick=()=>{if(b.dataset.close==='reader')readerRequest++;$('#'+b.dataset.close).close();});
const statuses={queued:'排队中',running:'处理中',active:'下载中',waiting:'等待中',paused:'已暂停',complete:'已完成',error:'失败',interrupted:'引擎重启，需重新提交',cancelled:'已取消'};
function taskHTML(j){const progress=j.total?Math.min(100,100*j.completed/j.total):null;return `<div class="task-row"><strong>${esc(j.title||j.url||j.id)}</strong><p class="caption">${esc(statuses[j.status]||j.status)} ${progress===null?'':progress.toFixed(1)+'%'} · ${bytes(j.completed||0)} ${j.total?'/ '+bytes(j.total):''}${j.speed?' · '+bytes(j.speed)+'/s':''}</p>${progress===null?'':`<div class="progress"><i style="width:${progress}%"></i></div>`}${j.error?`<p>${esc(j.error)}</p>`:''}<div class="actions">${j.status==='complete'?`<button data-job-files="${esc(j.id)}">查看 / 取回文件</button>`:''}${['running','active','waiting','queued','paused'].includes(j.status)?`<button data-job-cancel="${esc(j.id)}">取消任务</button>`:''}</div></div>`;}
async function loadTasks(){if(!engine){$('#torrentTasks').innerHTML=empty('尚未连接引擎。连接后显示实际进度、速度和文件列表。');renderQueue();return;}try{const d=await callEngine('/jobs');engineJobs=d.jobs;$('#engineStatus').textContent='● 引擎已连接';$('#torrentTasks').innerHTML=engineJobs.length?engineJobs.map(taskHTML).join(''):empty('下载队列为空');renderQueue();bindTasks();}catch(e){$('#engineStatus').textContent='引擎连接失败';$('#torrentTasks').innerHTML=empty(e.message);}}
function renderQueue(){$('#queueList').innerHTML=novelDownloadHTML()+engineJobs.map(taskHTML).join('')+history.slice(0,30).map(x=>`<div class="task-row"><strong>${esc(x.title)}</strong><p class="caption">${esc(x.status)} · ${date(x.time)}</p></div>`).join('')||empty('暂无任务。');$('#queueCount').textContent=novelTasks.filter(t=>['queued','running'].includes(t.status)).length+engineJobs.filter(x=>['running','queued','active','waiting'].includes(x.status)).length;bindTasks();bindNovelTaskActions();}
function bindTasks(){$$('[data-job-files]').forEach(b=>b.onclick=()=>busy(b,()=>showJobFiles(b.dataset.jobFiles)));$$('[data-job-cancel]').forEach(b=>b.onclick=()=>busy(b,async()=>{await callEngine('/jobs/cancel',{id:b.dataset.jobCancel});loadTasks();}));}
async function showJobFiles(id){const d=await callEngine('/jobs/files?id='+encodeURIComponent(id));$('#filesTitle').textContent='已完成文件';$('#filesList').innerHTML=d.files.map((f,i)=>`<div class="file-row"><strong>${esc(f.name)}</strong><p>${bytes(f.size)}</p><button data-engine-file="${i}">↓ 保存到本机</button></div>`).join('')||empty('没有可下载文件');if(!$('#files').open)$('#files').showModal();$$('[data-engine-file]').forEach(b=>b.onclick=()=>busy(b,async()=>{const f=d.files[+b.dataset.engineFile];const ticket=await callEngine('/download-ticket',{id,path:f.path});downloadURL(engine.url+'/download?ticket='+encodeURIComponent(ticket.ticket),f.name);}));}
$('#queueOpen').onclick=()=>{renderQueue();$('#queue').showModal();loadTasks();};$('#queueRefresh').onclick=e=>busy(e.currentTarget,loadTasks);$('#torrentRefresh').onclick=e=>busy(e.currentTarget,loadTasks);setInterval(()=>{if(engine&&!document.hidden&&(location.hash==='#torrent'||$('#queue').open))loadTasks();},6000);
const snapshotReady=fetch('data/snapshot.json',{cache:'no-cache',signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).then(d=>{snapshot=d;}).catch(()=>{});
if(engine)callEngine('/health').then(()=>{$('#engineStatus').textContent='● 引擎已连接';}).catch(()=>{$('#engineStatus').textContent='引擎连接失败';});
renderQueue();queueMicrotask(route);

$('#serviceCheck').onclick=e=>busy(e.currentTarget,async()=>{const label=$('#serviceStatus');label.textContent='正在检测连接…';try{const d=await api('health');label.textContent='媒体服务已连接 · v'+d.version;notice('媒体服务可连接。各来源的可用情况请查看搜索结果；服务连接成功不代表所有来源可用。');}catch(e){label.textContent='媒体服务暂不可达';throw e;}});
// Keep failed remote artwork from leaving broken-image icons in the UI.
document.addEventListener('error',e=>{const img=e.target;if(img.tagName==='IMG'&&!img.closest('#readerText')&&!img.classList.contains('cover-fallback')){img.classList.add('cover-fallback');img.src='../../icon.svg';}},true);

$('#torrentSearch').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{
 const q=$('#torrentQuery').value.trim();if(!q)return;$('#torrentResults').innerHTML=empty('正在同时查询多个来源…');$('#torrentSourceStatus').textContent='';
 try{const simple=toSimplified(q),traditional=toTraditional(q);const d=await api('torrent/search',{q:simple,variant:traditional,source:$('#torrentSource').value});$('#torrentSourceStatus').textContent=d.sources.map(s=>s.source+'：'+(s.ok?s.count+' 条':s.error)).join(' · ');
 $('#torrentResults').innerHTML=d.items.length?d.items.map((x,i)=>`<article class="card"><span class="badge">${esc((x.sources||[x.source]).join(' / '))}</span><h3>${esc(x.title)}</h3><p>${x.sizeBytes?bytes(x.sizeBytes):esc(x.size||'')} · 做种 ${x.seeders===null||x.seeders===undefined?'未知':x.seeders}${x.tracker?' · '+esc(x.tracker):''}</p><p class="caption">${x.publishedAt?'发布 '+esc(x.publishedAt):''}${x.lastSeen?' · 最近收录 '+esc(x.lastSeen):''}</p><div class="actions">${/^magnet:\?xt=urn:btih:/i.test(x.magnet)?`<a class="button" href="${esc(x.magnet)}">打开磁力</a><button data-magnet-copy="${i}">复制磁力</button>`:''}${/^https?:/.test(x.torrent)?`<a class="button" href="${href(x.torrent)}" target="_blank" rel="noopener">下载种子</a>`:''}${x.url?`<a href="${href(x.url)}" target="_blank" rel="noopener">资源详情 ↗</a>`:''}${engine?`<button data-torrent-send="${i}">加入引擎下载</button>`:''}</div></article>`).join(''):empty('没有可用结果。请检查上方来源状态或换一个关键词。');
 $$('[data-magnet-copy]').forEach(b=>b.onclick=()=>busy(b,async()=>{await navigator.clipboard.writeText(d.items[+b.dataset.magnetCopy].magnet);b.textContent='已复制';}));
 $$('[data-torrent-send]').forEach(b=>b.onclick=()=>busy(b,()=>{const x=d.items[+b.dataset.torrentSend];return submitJob('torrent',x.magnet||x.torrent);}));
 }catch(err){$('#torrentResults').innerHTML=empty(err.message);throw err;}
});};
