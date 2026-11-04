/* One retained resource page, mounted only when Monitor is opened. No polling. */
const panel=document.querySelector('#view-monitor'),frame=document.querySelector('#monitorFrame');
const views={overview:'速览',workflows:'工作流',projects:'项目与占用',settings:'读取检查'};
let selected=Object.hasOwn(views,new URL(location.href).searchParams.get('monitor'))?new URL(location.href).searchParams.get('monitor'):'overview',mounted=false,ready=false;
const active=()=>panel.classList.contains('active')&&!document.hidden;
function reflect(){
 document.querySelectorAll('[data-monitor-view]').forEach(b=>{b.classList.toggle('active',b.dataset.monitorView===selected);b.setAttribute('aria-current',b.dataset.monitorView===selected?'page':'false');});
 frame.title='资源监控 · '+views[selected];document.querySelector('#monitorStandalone').href='../resource-center/?view='+selected;
 if(panel.classList.contains('active')){const u=new URL(location.href);u.searchParams.set('monitor',selected);history.replaceState(history.state,'',u);}
}
function send(){if(ready)frame.contentWindow.postMessage({type:'pt-resource-host',view:selected,active:active(),theme:document.documentElement.dataset.theme||document.body.dataset.theme||'light'},location.origin);}
function activate(){
 if(active()&&!mounted){const u=new URL(frame.dataset.src,location.href);u.searchParams.set('view',selected);frame.src=u.href;mounted=true;}
 // Activation is also sent directly because offscreen iframes keep document.visible.
 if(ready){frame.contentWindow.ptNexusActive=active();frame.contentWindow.dispatchEvent(new Event('nexus-activate'));}
 reflect();send();
}
frame.addEventListener('load',()=>{if(!mounted)return;ready=true;document.querySelector('#monitorLoading').hidden=true;send();});
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='pt-resource-view'||!Object.hasOwn(views,event.data.view))return;selected=event.data.view;reflect();});
document.querySelectorAll('[data-monitor-view]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.monitorView;reflect();send();}));
window.addEventListener('nexus-view-change',activate);document.addEventListener('visibilitychange',activate);
new MutationObserver(send).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
new MutationObserver(send).observe(document.body,{attributes:true,attributeFilter:['data-theme']});
activate();
