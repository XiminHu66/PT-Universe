/* Presentation only: no fetching, scheduling, source, ordering or read-state changes. */
(()=>{
  const key='tsugi-stream-visual-v1';let batch={known:[],fresh:[],stamp:'',signature:''},initialized=false;
  try{const value=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(value?.known)&&value.known.every(x=>Array.isArray(x)&&x.length===2&&x.every(v=>typeof v==='string'))&&Array.isArray(value?.fresh)&&value.fresh.every(x=>typeof x==='string')&&typeof value.stamp==='string'&&typeof value.signature==='string'){batch=value;initialized=true}}catch{}
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(batch))}catch{}};
  const identity=row=>siteKey(row);
  const token=row=>JSON.stringify([identity(row),cleanLatestChapter(row.latest||''),String(row.latest_url||row.url||'').trim()]);
  const base=window.renderSiteUpdates;
  window.renderSiteUpdates=function(){
    base();const rows=state.site?.items||[],stamp=state.site?.generated_at||'';
    const signature=JSON.stringify(rows.map(token).sort());
    if(rows.length&&(stamp!==batch.stamp||signature!==batch.signature)&&(!batch.stamp||!stamp||!(Date.parse(stamp)<Date.parse(batch.stamp)))){
      const known=new Map(batch.known),fresh=[];
      for(const row of rows){const id=identity(row),value=token(row);if(initialized&&known.get(id)!==value)fresh.push(value);known.delete(id);known.set(id,value)}
      batch={known:[...known].slice(-3000),fresh,stamp,signature};initialized=true;save();
    }
    let legend=document.getElementById('siteRefreshLegend');
    if(!legend){legend=document.createElement('div');legend.id='siteRefreshLegend';legend.className='stream-refresh-legend';legend.innerHTML='<span role="status" aria-live="polite"></span><button class="text-btn" type="button">清除标记</button>';document.getElementById('siteUpdatesGrid').before(legend);legend.querySelector('button').onclick=()=>{batch.fresh=[];save();window.renderSiteUpdates()}}
    const fresh=new Set(batch.fresh),allowed=enabledSourceIds('site_updates'),q=state.query.toLowerCase();
    const visible=rows.filter(x=>(!allowed.size||allowed.has(x.source))&&(state.siteFilter==='all'||x.type===state.siteFilter)&&(state.siteSource==='all'||x.source===state.siteSource)&&(!q||`${x.title} ${x.latest} ${x.source_label}`.toLowerCase().includes(q)));
    let count=0;document.querySelectorAll('#siteUpdatesGrid .site-update-card').forEach((card,i)=>{if(!visible[i]||!fresh.has(token(visible[i])))return;count++;card.classList.add('refresh-new');const badge=document.createElement('span');badge.className='refresh-new-badge';badge.textContent='本轮新增';card.querySelector('.site-meta')?.append(badge)});
    legend.querySelector('span').textContent=batch.fresh.length?`本轮新增 ${batch.fresh.length} 条 · 当前筛选 ${count} 条`:'本轮无新增 · 下次刷新自动标记新作品或新章节';legend.querySelector('button').hidden=!batch.fresh.length;
  };
  if(state.site)window.renderSiteUpdates();
})();
