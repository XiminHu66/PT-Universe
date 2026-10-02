// Keep the same-origin tools mounted: switching tabs preserves drafts and credentials.
(()=>{
  'use strict';
  const routes={'pt-todo-dashboard':'todo','life-desk':'meal','meal-orbit':'meal'};
  const frames=['meal','todo'].map(name=>({name,frame:document.getElementById(name+'Frame')})).filter(item=>item.frame);
  const theme=()=>document.documentElement.dataset.theme||'light';
  function syncTheme(doc,depth=0){
    if(!doc||depth>3)return;
    doc.documentElement.dataset.theme=theme();
    for(const child of doc.querySelectorAll('iframe'))try{syncTheme(child.contentDocument,depth+1)}catch{}
  }
  function activate(name){
    const u=new URL(location.href);u.searchParams.set('tab',name);history.replaceState(null,'',u);
    for(const {frame,name:own} of frames)try{frame.contentWindow.ptNexusActive=own===name;frame.contentWindow.dispatchEvent(new CustomEvent('nexus-activate',{detail:{active:own===name}}))}catch{}
  }
  for(const {name,frame} of frames){
    frame.addEventListener('load',()=>{
      const doc=frame.contentDocument;if(!doc)return;
      if(!doc.getElementById('nexus-tool-style')){
        const style=doc.createElement('style');style.id='nexus-tool-style';style.textContent='.ws-top,.d-top,.ptb-root,#ptu-home-link{display:none!important}.ws-shell{padding:18px 18px 40px}.ws-hero{margin-top:6px}.d-shell{padding-top:20px}.d-hero{margin-bottom:18px}@media(max-width:760px){.ws-shell,.d-shell{padding:16px 12px 40px}}';doc.head.append(style);
        doc.addEventListener('load',e=>{if(e.target.tagName==='IFRAME')syncTheme(doc)},true);
        doc.addEventListener('click',e=>{
          const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.hasAttribute('download'))return;
          const u=new URL(a.href);if(u.origin!==location.origin)return;
          const slug=u.pathname.match(/\/apps\/([^/]+)/)?.[1],next=routes[slug];
          if(next&&u.searchParams.get('legacy')!=='1'){
            e.preventDefault();window.switchNexusView(next);
          }else if(slug==='ask-gpt'||u.searchParams.get('legacy')==='1'){a.target='_blank';a.rel='noopener'}
        },true);
      }
      syncTheme(doc);frame.contentWindow.ptNexusActive=document.getElementById('view-'+name).classList.contains('active');
    });
  }
  // Navigation is usable before optional sync/navigation scripts finish loading.
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.data?.channel!=='pt-nexus-tool'||e.data.type!=='ready')return;
    const item=frames.find(x=>x.frame.contentWindow===e.source);if(!item)return;
    const loading=document.getElementById(item.name+'Loading');
    if(loading){loading.classList.add('hide');loading.style.display='none'}
  });
  addEventListener('nexus-theme-change',()=>frames.forEach(({frame})=>syncTheme(frame.contentDocument)));
  addEventListener('nexus-view-change',e=>activate(e.detail.view));
  const initial=new URL(location.href).searchParams.get('tab');
  if(initial)window.switchNexusView(initial);
})();
