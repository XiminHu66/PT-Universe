/* A single embedded monitor, with cached updates only while this tab is visible. */
const panel=document.querySelector('#view-monitor'),frame=document.querySelector('#monitorFrame');
const status=document.querySelector('#monitorStatus'),refreshButton=document.querySelector('#monitorRefresh');
const views={overview:'速览',workflows:'工作流',projects:'项目与占用',settings:'读取检查'},AUTO_INTERVAL=5*60000;
let selected=Object.hasOwn(views,new URL(location.href).searchParams.get('monitor'))?new URL(location.href).searchParams.get('monitor'):'overview',mounted=false,ready=false,timer=null,lastCheck=0;
const active=()=>panel.classList.contains('active')&&!document.hidden;
function reflect(){
 document.querySelectorAll('[data-monitor-view]').forEach(b=>{b.classList.toggle('active',b.dataset.monitorView===selected);b.setAttribute('aria-current',b.dataset.monitorView===selected?'page':'false');});
 frame.title='资源监控 · '+views[selected];
 if(panel.classList.contains('active')){const u=new URL(location.href);u.searchParams.set('monitor',selected);history.replaceState(history.state,'',u);}
}
function send(action,force=false){if(ready)frame.contentWindow.postMessage({type:'pt-resource-host',view:selected,active:active(),theme:document.documentElement.dataset.theme||document.body.dataset.theme||'light',...(action?{action,force}:{})},location.origin);}
function schedule(){
 clearTimeout(timer);timer=null;
 if(!ready||!active())return;
 timer=setTimeout(()=>{timer=null;if(!active())return;lastCheck=Date.now();send('refresh');schedule();},Math.max(1000,AUTO_INTERVAL-(Date.now()-lastCheck)));
}
function activate(){
 if(active()&&!mounted){const u=new URL(frame.dataset.src,location.href);u.searchParams.set('view',selected);frame.src=u.href;mounted=true;}
 if(ready){frame.contentWindow.ptNexusActive=active();frame.contentWindow.dispatchEvent(new Event('nexus-activate'));}
 reflect();
 if(ready&&active()&&Date.now()-lastCheck>=AUTO_INTERVAL){lastCheck=Date.now();send('refresh');}else send();
 schedule();
}
frame.addEventListener('load',()=>{if(!mounted)return;ready=true;lastCheck=Date.now();document.querySelector('#monitorLoading').hidden=true;refreshButton.disabled=false;send();schedule();});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==='pt-resource-view'&&Object.hasOwn(views,event.data.view)){selected=event.data.view;reflect();}
 if(event.data?.type==='pt-resource-status'){
  const d=event.data,message=typeof d.message==='string'?d.message.slice(0,400):'';
  status.textContent=d.connecting?'自动连接中…':d.busy?'正在更新…':d.connected?'已连接 · 自动更新':'连接待重试';status.title=message;status.setAttribute('aria-label',message||status.textContent);
  status.dataset.state=d.connected?'connected':d.connecting||d.busy?'pending':'error';refreshButton.disabled=d.busy===true||d.connecting===true;
 }
});
refreshButton.addEventListener('click',()=>{if(!active())return;lastCheck=Date.now();send('refresh',true);schedule();});
document.querySelectorAll('[data-monitor-view]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.monitorView;reflect();send();}));
window.addEventListener('nexus-view-change',activate);document.addEventListener('visibilitychange',activate);
new MutationObserver(()=>send()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
new MutationObserver(()=>send()).observe(document.body,{attributes:true,attributeFilter:['data-theme']});
activate();
