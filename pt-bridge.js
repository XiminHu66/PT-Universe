(function(){
  'use strict';
  if(location.hostname.endsWith('github.io'))fetch('https://pt-universe-api.summer07-nanjolno.workers.dev/api/analytics',{method:'POST',body:JSON.stringify({path:location.pathname}),headers:{'content-type':'text/plain;charset=UTF-8'},keepalive:true}).catch(()=>{});
  const apps=[
    ['daily-nexus','⌂','Daily Nexus'],['deskboard','▦','DeskBoard'],['rss-dashboard','◉','RSS Orbit'],['stock-alert','↗','Stock Alert'],
    ['qf-tool','◇','QF Tool'],['3c-scout','⌁','3C Scout'],['meal-orbit','筷','Food Orbit'],['tsugi-checker','継','Tsugi']
  ];
  const current=(location.pathname.match(/\/apps\/([^/]+)/)||[])[1]||'';
  const selected=()=>{try{return JSON.parse(localStorage.getItem('ptu.projectLinks'))||['daily-nexus','rss-dashboard','tsugi-checker']}catch{return ['daily-nexus','rss-dashboard','tsugi-checker']}};
  const root=document.createElement('div');root.className='ptb-root';
  root.innerHTML=`<button class="ptb-tab" aria-label="打开项目导航" aria-expanded="false">⌘</button><section class="ptb-panel" aria-label="PT Universe 项目导航"><header class="ptb-head"><strong>PT Universe</strong><button class="ptb-close" aria-label="关闭">×</button></header><nav class="ptb-links"></nav><details class="ptb-settings"><summary>显示项目 · 自定义</summary><div class="ptb-checks">${apps.map(([id,icon,name])=>`<label><input type="checkbox" value="${id}"> ${icon} ${name}</label>`).join('')}</div></details><details class="ptb-settings ptb-refresh"><summary>手动刷新中心 · Cloudflare</summary><div class="ptb-refresh-grid"><button data-refresh="news">新闻</button><button data-refresh="sites">漫画/小说</button><button data-refresh="music">音乐</button><button data-refresh="games">游戏</button><button class="all" data-refresh="all">全部刷新</button></div><p class="ptb-refresh-status">读取状态中…</p></details><section class="ptb-sync"><p>跨设备同步使用浏览器端 AES-GCM 加密；服务器只保存密文。</p><div class="ptb-sync-row"><button class="ptb-action primary" data-sync="create">生成配对码</button><button class="ptb-action" data-sync="connect">连接设备</button></div><textarea class="ptb-code" rows="2" placeholder="配对码只显示/输入在这里"></textarea><div class="ptb-sync-row"><button class="ptb-action" data-sync="now">立即同步</button><button class="ptb-action danger" data-sync="disconnect">断开</button></div><p class="ptb-status"></p></section></section>`;
  document.body.append(root);
  const panel=root.querySelector('.ptb-links'),tab=root.querySelector('.ptb-tab'),status=root.querySelector('.ptb-status'),code=root.querySelector('.ptb-code');
  function href(id){return new URL(`../${id}/`,location.href).href}
  function render(){
    const ids=selected();panel.innerHTML=`<a class="ptb-link home" href="../../"><b>⌂</b>返回 Universe 首页</a>`+apps.filter(([id])=>id!==current&&ids.includes(id)).map(([id,icon,name])=>`<a class="ptb-link" href="${href(id)}"><b>${icon}</b>${name}</a>`).join('');
    root.querySelectorAll('.ptb-checks input').forEach(input=>input.checked=ids.includes(input.value));
  }
  tab.onclick=()=>{root.classList.toggle('open');tab.setAttribute('aria-expanded',root.classList.contains('open'))};root.querySelector('.ptb-close').onclick=()=>root.classList.remove('open');
  root.querySelector('.ptb-checks').onchange=()=>{const ids=[...root.querySelectorAll('.ptb-checks input:checked')].map(x=>x.value);localStorage.setItem('ptu.projectLinks',JSON.stringify(ids));render()};
  function note(message,bad=false){status.textContent=message;status.style.color=bad?'#ff9eaa':'#7fdab9'}
  root.querySelector('[data-sync=create]').onclick=async()=>{try{note('正在创建…');code.value=await PTSync.create();note('已创建。把配对码复制到另一台设备。')}catch(e){note(e.message,true)}};
  root.querySelector('[data-sync=connect]').onclick=async()=>{try{note('正在连接…');await PTSync.connect(code.value);note('已连接并拉取最新设置。请刷新页面。')}catch(e){note(e.message,true)}};
  root.querySelector('[data-sync=now]').onclick=async()=>{try{note('同步中…');await PTSync.pull();await PTSync.push();note('同步完成')}catch(e){note(e.message,true)}};
  root.querySelector('[data-sync=disconnect]').onclick=()=>{PTSync.disconnect();code.value='';note('已断开此设备')};
  const refreshStatus=root.querySelector('.ptb-refresh-status');
  const refreshNote=(message,bad=false)=>{refreshStatus.textContent=message;refreshStatus.style.color=bad?'#ff9eaa':'#8f9db4'};
  async function pollRefresh(id){for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,6000));const response=await fetch(`${PTSync.API}/api/refresh/status/${id}`,{cache:'no-store'}),run=await response.json();if(run.status==='success'){refreshNote('刷新完成 · 重新打开页面即可读取新数据');dispatchEvent(new CustomEvent('pt-cloud-refresh',{detail:run}));return}if(run.status==='failed')throw new Error(run.error||'刷新失败')}refreshNote('任务仍在后台运行')}
  root.querySelectorAll('[data-refresh]').forEach(button=>button.onclick=async()=>{try{root.querySelectorAll('[data-refresh]').forEach(x=>x.disabled=true);refreshNote('正在提交刷新任务…');const response=await fetch(`${PTSync.API}/api/refresh/${button.dataset.refresh}`,{method:'POST'}),result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);refreshNote(`任务已排队 · ${button.textContent}`);await pollRefresh(result.requestId)}catch(e){refreshNote(e.message,true)}finally{root.querySelectorAll('[data-refresh]').forEach(x=>x.disabled=false)}});
  fetch(`${PTSync.API}/api/status`).then(r=>r.json()).then(data=>{const run=data.runs?.[0];refreshNote(run?`最近：${run.scope} · ${run.status} · ${run.completed_at||run.started_at||'等待中'}`:'尚无刷新记录')}).catch(()=>refreshNote('刷新状态暂不可用',true));
  addEventListener('pt-sync-status',e=>{if(e.detail.type==='error')note(e.detail.error,true);else note(e.detail.type==='push'?'已上传设置':'已收到另一设备的设置')});
  addEventListener('pt-sync-applied',()=>{note('收到新设置，刷新页面后生效')});render();
})();
