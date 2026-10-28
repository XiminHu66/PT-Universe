/* Daily Nexus renders read-only data; native tools remain in their private hub. */
(()=>{
 const q=s=>document.querySelector(s),panel=q('#view-vps');if(!panel)return;
 const HUB='https://pt-vps-tools.h1nano.chatgpt.site',API='https://pt-universe-api.summer07-nanjolno.workers.dev/api/vps/overview';
 const TOKEN_KEY='pt-nexus-vps-session-v1',PENDING_KEY='pt-nexus-vps-connect-v1';
 const TOOLS=[{"id": "downloads", "name": "下载文件", "brand": "文件管理", "path": "/downloads/", "group": "files", "icon": "▣", "desc": "统一查看下载，保存到电脑或管理回收站。", "aliases": "文件 目录 删除 恢复 取回 download files"}, {"id": "pikpak", "name": "PikPak", "brand": "", "path": "/pikpak/", "group": "files", "icon": "↓", "desc": "网盘转存、并行下载和视频预览。", "aliases": "网盘 视频 磁力 链接 转存"}, {"id": "bilipack", "name": "小说下载", "brand": "BiliPack", "path": "/bilipack/", "group": "files", "icon": "B", "desc": "下载轻小说、选择章节并打包 EPUB。", "aliases": "bilinovel 哔哩轻小说 epub 电子书 打包"}, {"id": "video", "name": "视频下载", "brand": "MeTube", "path": "/video/", "group": "files", "icon": "▶", "desc": "提交视频链接，查看任务和下载结果。", "aliases": "youtube yt-dlp metube 音频"}, {"id": "bt", "name": "BT 与直链", "brand": "AriaNg", "path": "/bt/", "group": "files", "icon": "⇣", "desc": "管理磁力、BT 和直链下载任务。", "aliases": "ariang aria2 torrent 磁力 种子"}, {"id": "karakeep", "name": "知识库", "brand": "", "path": "/knowledge/", "group": "knowledge", "icon": "❧", "desc": "收藏资料、整理笔记，检索与带出处问答。", "aliases": "karakeep 书签 收藏 笔记 pdf rag 图谱"}, {"id": "search", "name": "聚合搜索", "brand": "SearXNG", "path": "/searxng/", "group": "process", "icon": "⌕", "desc": "搜索网页、图片和其他公开资料。", "aliases": "搜索 引擎 searxng search"}, {"id": "pdf", "name": "PDF 工具", "brand": "Stirling", "path": "/", "group": "process", "icon": "P", "desc": "合并、拆分、转换和整理 PDF。", "aliases": "stirling 文档 合并 拆分 转换"}, {"id": "omnitools", "name": "万能工具", "brand": "OmniTools", "path": "/omnitools/", "group": "process", "icon": "✦", "desc": "图片、音视频、文本与数据格式处理。", "aliases": "omnitools 图片 音视频 文本 json 压缩 转换"}, {"id": "trip", "name": "旅行规划", "brand": "TRIP", "path": "/trip/", "group": "life", "icon": "⌖", "desc": "收藏地点、安排多日行程与出行清单。", "aliases": "trip 旅游 地图 行程 预订 清单"}, {"id": "wanderer", "name": "户外路线", "brand": "Wanderer", "path": "/wanderer/", "group": "life", "icon": "△", "desc": "导入 GPX，规划和保存徒步、骑行路线。", "aliases": "wanderer 徒步 骑行 运动 gpx 地图 户外"}, {"id": "moodist", "name": "专注声音", "brand": "Moodist", "path": "/moodist/", "group": "life", "icon": "♫", "desc": "组合雨声、环境音和白噪音。", "aliases": "moodist 雨声 番茄钟 白噪音 专注 放松"}, {"id": "koito", "name": "听歌记录", "brand": "Koito", "path": "/koito/", "group": "life", "icon": "♪", "desc": "导入听歌历史，查看艺人、专辑与年度统计。", "aliases": "koito 音乐 听歌 spotify lastfm listenbrainz scrobble"}, {"id": "trendradar", "name": "热点雷达", "brand": "TrendRadar", "path": "/trendradar/", "group": "system", "icon": "◉", "desc": "中文热榜、RSS 与科技新闻，按小时更新。", "aliases": "trendradar 热榜 新闻 rss 游戏 ai 资讯"}, {"id": "metrics", "name": "服务器状态", "brand": "", "path": "/hub/metrics/", "group": "system", "icon": "▥", "desc": "简明 CPU、内存、磁盘和网络趋势。", "aliases": "beszel vps 监控 状态 仪表盘 dashboard", "health": "beszel"}];
 const groups=[['all','全部'],['files','下载与文件'],['knowledge','知识与收藏'],['process','搜索与处理'],['life','生活与兴趣'],['system','资讯与系统']];
 let token='',snapshot=null,category='all',busy=false,timer=null,connectionError='';
 const getStored=key=>{try{return sessionStorage.getItem(key);}catch{return null;}};
 const putStored=(key,value)=>{try{sessionStorage.setItem(key,value);return true;}catch{return false;}};
 const dropStored=key=>{try{sessionStorage.removeItem(key);}catch{}};
 const payload=value=>{try{const s=value.split('.')[1].replaceAll('-','+').replaceAll('_','/');return JSON.parse(atob(s+'==='.slice((s.length+3)%4)));}catch{return null;}};
 const usable=value=>{const p=payload(value||'');return p?.aud==='pt-universe-vps'&&p.scope==='vps:read'&&Number.isInteger(p.exp)&&p.exp*1000>Date.now()+15000;};
 const currentURL=new URL(location.href),returned=new URLSearchParams(currentURL.hash.slice(1));
 if(returned.has('vps-session')){
  const candidate=returned.get('vps-session')||'',nonce=returned.get('nonce')||'';let pending;
  try{pending=JSON.parse(getStored(PENDING_KEY)||'null');}catch{}
  currentURL.hash='';currentURL.searchParams.set('view','vps');history.replaceState(history.state,'',currentURL.href);
  if(pending?.nonce===nonce&&pending.expiresAt>Date.now()&&payload(candidate)?.nonce===nonce&&usable(candidate))putStored(TOKEN_KEY,candidate);
  else connectionError='连接校验未通过，请重新连接监控。';
  dropStored(PENDING_KEY);
 }
 const saved=getStored(TOKEN_KEY);if(usable(saved))token=saved;else dropStored(TOKEN_KEY);
 const active=()=>panel.classList.contains('active')&&!document.hidden;
 const bytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':Math.round(n)+' B';
 const date=value=>new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 function state(name,message){q('#vpsState').dataset.state=name;q('#vpsState').textContent=({online:'监控在线',stale:'显示上次采样',error:'连接暂不可用',pending:'正在读取',offline:'尚未连接监控'})[name];q('#vpsMessage').textContent=message;}
 function connectionButtons(){q('#vpsConnect').textContent=token?'重新连接':'连接监控';q('#vpsDisconnect').hidden=!token;q('#vpsRefresh').disabled=!token||busy;}
 function chart(id,key){const svg=q('#'+id);svg.replaceChildren();if(!snapshot?.history||snapshot.history.length<2)return;const p=document.createElementNS('http://www.w3.org/2000/svg','polyline');p.setAttribute('points',snapshot.history.map((r,i)=>(i/(snapshot.history.length-1)*300).toFixed(1)+','+(48-r[key]*.45).toFixed(1)).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','2');svg.append(p);}
 function renderMetrics(){
  const m=snapshot;
  q('#vpsCpu').textContent=m?m.cpu.percent.toFixed(1)+'%':'—';q('#vpsMemory').textContent=m?m.memory.percent.toFixed(1)+'%':'—';q('#vpsDisk').textContent=m?m.disk.percent.toFixed(1)+'%':'—';
  q('#vpsLoad').textContent=m?'平均负载 '+m.cpu.load.map(v=>v.toFixed(2)).join(' / '):'连接后显示负载';
  q('#vpsMemoryDetail').textContent=m?bytes(m.memory.usedBytes)+' / '+bytes(m.memory.totalBytes):'连接后显示用量';
  q('#vpsDiskDetail').textContent=m?'剩余 '+bytes(m.disk.freeBytes)+' / '+bytes(m.disk.totalBytes):'连接后显示剩余空间';
  q('#vpsDownload').textContent=m?'↓ '+bytes(m.network.receivedBytesPerSecond)+'/s':'↓ —';q('#vpsUpload').textContent=m?'↑ '+bytes(m.network.sentBytesPerSecond)+'/s':'↑ —';
  q('#vpsSample').textContent=m?'采样 '+date(m.sampleAt):'采样时间 —';q('#vpsFetched').textContent=m?'读取 '+date(m.fetchedAt):'读取时间 —';
  q('#vpsUptime').textContent=m?'已运行 '+Math.floor(m.uptimeSeconds/86400)+' 天 '+Math.floor(m.uptimeSeconds%86400/3600)+' 小时':'运行时间 —';
  chart('vpsCpuChart','cpu');chart('vpsMemoryChart','memory');chart('vpsDiskChart','disk');
 }
 function renderTools(){
  const rows=TOOLS.filter(t=>category==='all'||t.group===category),states=new Map((snapshot?.services||[]).map(s=>[s.name,s.ok]));
  q('#vpsToolCount').textContent=rows.length+' 个工具';
  q('#vpsTools').replaceChildren(...rows.map(t=>{
   const a=document.createElement('a');a.className='vps-tool';a.href=HUB+'/hub/#'+t.id;a.target='_blank';a.rel='noopener';a.dataset.tool=t.id;
   const icon=document.createElement('span');icon.className='vps-tool-icon';icon.textContent=t.icon;icon.setAttribute('aria-hidden','true');
   const title=document.createElement('div');title.className='vps-tool-title';const name=document.createElement('b');name.textContent=t.name;const arrow=document.createElement('span');arrow.textContent='↗';title.append(name,arrow);
   const desc=document.createElement('p');desc.textContent=t.desc;
   const status=document.createElement('span');status.className='vps-tool-status';const ok=states.get(t.health||t.id);
   status.textContent=ok===true?'● 服务正常':ok===false?'○ 暂不可用':t.id==='downloads'?'统一文件管理':'私有入口';if(typeof ok==='boolean')status.dataset.ok=String(ok);
   a.append(icon,title,desc,status);return a;
  }));
  for(const b of q('#vpsFilters').children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
 }
 async function refresh(){
  if(!active()||busy)return;
  if(!usable(token)){token='';dropStored(TOKEN_KEY);connectionButtons();state('offline',connectionError||'使用现有工具中心登录后，这里会显示真实监控数据。工具入口可直接使用。');return;}
  busy=true;connectionButtons();if(!snapshot)state('pending','正在读取真实采样…');
  try{
   const r=await fetch(API,{headers:{authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(18000)}),d=await r.json();
   if(r.status===401){token='';dropStored(TOKEN_KEY);throw Error('监控连接已过期，请重新连接。');}
   if(!r.ok)throw Error(d.error||'暂时无法读取 VPS 状态。');
   snapshot=d;connectionError='';renderMetrics();renderTools();
   state(d.stale?'stale':'online',d.stale?'采样超过三分钟未更新，可打开工具中心检查。':'只读连接已建立。原生账号和服务器密钥保留在后台。');
  }catch(e){state(snapshot?'stale':'error',(e.message||'连接失败')+(snapshot?' 当前保留上次成功读取的数据。':''));}
  finally{busy=false;connectionButtons();}
 }
 function schedule(){clearInterval(timer);const sec=Number(q('#vpsInterval').value);if(sec)timer=setInterval(refresh,sec*1000);}
 q('#vpsConnect').onclick=()=>{
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
  if(!putStored(PENDING_KEY,JSON.stringify({nonce,expiresAt:Date.now()+10*60000}))){state('error','浏览器无法保存临时连接，请允许站点存储后重试。');return;}
  location.assign(HUB+'/__pt_vps_connect?nonce='+nonce);
 };
 q('#vpsRefresh').onclick=refresh;
 q('#vpsDisconnect').onclick=()=>{token='';snapshot=null;connectionError='';dropStored(TOKEN_KEY);renderMetrics();renderTools();connectionButtons();state('offline','已断开监控连接。工具入口仍可直接使用。');};
 q('#vpsInterval').onchange=schedule;
 for(const [id,label] of groups){const b=document.createElement('button');b.type='button';b.dataset.category=id;b.textContent=label;b.onclick=()=>{category=id;renderTools();};q('#vpsFilters').append(b);}
 addEventListener('nexus-view-change',()=>{if(active())refresh();});document.addEventListener('visibilitychange',()=>{if(active())refresh();});
 renderTools();renderMetrics();connectionButtons();schedule();if(connectionError)state('error',connectionError);if(active())refresh();
})();
