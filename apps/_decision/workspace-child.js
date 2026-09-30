(()=>{
 'use strict';if(new URLSearchParams(location.search).get('embedded')!=='workspace'||parent===window)return;
 const slug=location.pathname.match(/\/apps\/([^/]+)/)?.[1];
 const routes={'stock-alert':'market','thesis-lab':'thesis','eastside-weekend':'weekend','meal-orbit':'dinner'};
 const css=document.createElement('style');css.textContent=`
 html,body{height:auto!important;min-height:0!important;overflow:visible!important}
 .ptb-root,#ptu-home-link{display:none!important}
 body>main>footer{display:none!important}
 body>main>.hero,body>main>.topline{display:none!important}
 body>main{max-width:none!important;padding:12px!important}
 [data-decision="holdings"]{display:none!important}
 .app-shell{display:grid!important;grid-template:60px auto / 300px minmax(0,1fr)!important;align-items:start;height:auto!important;min-height:0!important}
 .topbar{position:static!important;min-height:60px!important}
 .topbar .brand{display:none!important}
 .watch-panel{grid-column:1;grid-row:2;position:static!important;width:auto!important;min-width:0;height:auto!important;max-height:none!important;padding:16px 12px!important}
 .watch-panel .panel-heading,.watch-panel .watch-legend{display:none!important}
 .watchlist{display:block!important;min-height:0;overflow-x:hidden!important;overflow-y:auto!important;max-height:800px!important;padding-bottom:6px!important}
 .watch-item{width:100%!important;min-width:0!important;max-width:none!important;margin-bottom:4px}
 .watch-panel .watch-footer{display:none!important}
 .dashboard{grid-column:2;grid-row:2;min-width:0;max-width:none!important;padding:16px!important}
 @media(max-width:1000px) and (min-width:761px){.app-shell{grid-template-columns:260px minmax(0,1fr)!important}.watch-panel{padding:12px 8px!important}.dashboard{padding:12px!important}.watch-panel .ticker-avatar{display:none}.watch-panel .watch-item{grid-template-columns:minmax(0,1fr) auto}}
 @media(max-width:760px){.app-shell{display:block!important}.watch-panel{padding:12px!important}.watchlist{max-height:280px!important}.watch-panel .symbol-form{display:flex}.watch-panel .remove-symbol{display:block!important}.dashboard{padding:12px!important}}
 body:has(.workspace){display:block!important}
 .sidebar{display:none!important}
 .workspace{min-height:0!important;height:auto!important;display:block!important;overflow:visible!important}
 .workspace-top{display:none!important}
 .workspace>.section{height:auto!important;max-height:none!important;overflow:visible!important;padding:12px!important}
 `;document.head.append(css);
 const send=(type,payload={})=>parent.postMessage({channel:'pt-workspace',type,slug,...payload},location.origin);
 let lastHeight=0,raf;
 function resize(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const height=Math.ceil(Math.max(document.body.scrollHeight,document.body.getBoundingClientRect().height));if(Math.abs(height-lastHeight)>2){lastHeight=height;send('height',{height})}})}
 new ResizeObserver(resize).observe(document.body);addEventListener('load',resize);addEventListener('resize',resize);
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;let u;try{u=new URL(a.href)}catch{return}if(u.origin!==location.origin)return;const target=u.pathname.match(/\/apps\/([^/]+)/)?.[1];if(routes[target]){e.preventDefault();e.stopImmediatePropagation();send('navigate',{tab:routes[target],symbol:u.searchParams.get('symbol')||'',target})}},true);
 addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.channel!=='pt-workspace')return;
  if(e.data.type==='activate'){
   if(slug==='meal-orbit'){const section={dinner:'dinner',restaurants:'nearby',recipes:'recipes',favorites:'saved',wheel:'decide'}[e.data.tab];if(section)document.querySelector('[data-section="'+section+'"]')?.click();}
   dispatchEvent(new CustomEvent('workspace-activate',{detail:e.data}));resize();
  }
  if(e.data.type==='symbol'&&typeof e.data.symbol==='string'&&/^[A-Z0-9.^-]{1,20}$/.test(e.data.symbol))dispatchEvent(new CustomEvent('workspace-select-symbol',{detail:{symbol:e.data.symbol}}));
  if(e.data.type==='investment-data')dispatchEvent(new CustomEvent('workspace-investment-data',{detail:e.data}));
  if(e.data.type==='records')dispatchEvent(new CustomEvent('workspace-records',{detail:e.data}));
 });
 addEventListener('workspace-symbol-changed',e=>send('symbol',{symbol:e.detail.symbol}));
 addEventListener('decision-thesis-updated',()=>send('records',{key:'ptu.labs.theses'}));
 addEventListener('workspace-request-investment',()=>send('ready'));
 addEventListener('workspace-refresh-investment',()=>send('investment-refresh'));
 send('ready');resize();
})();