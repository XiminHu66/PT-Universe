/* Manual reference levels only. Quotes and their connection stay in TradingView. */
const marketCells=new Map();
let marketDialog=null,marketReturnFocus=null,marketDrag=null;
let marketPanelObserver=null;
function updateMarketPanelWidth(){
  const dashboard=document.querySelector('body>main.dashboard');
  if(!dashboard)return;
  if(!marketPanelObserver&&typeof ResizeObserver!=='undefined'){
    marketPanelObserver=new ResizeObserver(updateMarketPanelWidth);marketPanelObserver.observe(dashboard);
  }
  if(window.innerWidth<=1100){dashboard.style.removeProperty('--market-panel-width');return}
  const css=getComputedStyle(dashboard),bodyCSS=getComputedStyle(marketBody),panelCSS=getComputedStyle(marketBody.parentElement);
  const px=value=>parseFloat(value)||0;
  const available=dashboard.clientWidth-px(css.paddingLeft)-px(css.paddingRight)-px(css.columnGap);
  const gap=px(bodyCSS.columnGap),cardWidth=340;
  const inset=px(bodyCSS.paddingLeft)+px(bodyCSS.paddingRight)+px(panelCSS.borderLeftWidth)+px(panelCSS.borderRightWidth);
  const budget=Math.min(available-320,available*(Number(layout.split)||68)/100);
  const columns=Math.max(1,Math.min(resolvedMarketCols(),Math.floor((budget-inset+gap)/(cardWidth+gap))));
  // Fit the panel to whole cards; give the remaining width to the news feed.
  const width=Math.min(available-320,inset+columns*cardWidth+(columns-1)*gap);
  dashboard.style.setProperty('--market-panel-width',width+'px');
  const ratio=Math.round(width/available*100),value=document.getElementById('splitValue');
  if(value)value.textContent=`股票 ${ratio}% · 信息 ${100-ratio}%（上限 ${layout.split}%）`;
}
function marketPrice(value){
  if(value==null||value==='')return null;
  const n=Number(value);return Number.isFinite(n)&&n>0?n:null;
}
function normalizeMarketStock(raw){
  if(!raw||typeof raw.symbol!=='string')return null;
  const symbol=raw.symbol.trim().toUpperCase();
  if(!/^[A-Z0-9_]+:[A-Z0-9_.!^/\-]+$/.test(symbol))return null;
  return {...raw,symbol,label:String(raw.label||symbol.split(':').pop()).slice(0,80),buyPrice:marketPrice(raw.buyPrice),sellPrice:marketPrice(raw.sellPrice),emphasis:['blue','violet','amber'].includes(raw.emphasis)?raw.emphasis:''};
}
function marketPriceText(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:8})}
function marketSave(next){
  const normalized=next.map(normalizeMarketStock).filter(Boolean);
  if(new Set(normalized.map(x=>x.symbol)).size!==normalized.length)throw Error('这个标的已经在看板里');
  // Persist first: a quota/storage error must not appear to save successfully.
  localStorage.setItem(KEYS.stocks,JSON.stringify(normalized));stocks=normalized;
  stockDraft=clone(stocks);renderEditableMarketGrid();
  if(settingsBackdrop.classList.contains('show'))renderStockManager();
}
function renderEditableMarketGrid(){
  if(!marketBody)return;
  const symbols=new Set(stocks.map(x=>x.symbol));
  for(const [symbol,cell] of marketCells){if(!symbols.has(symbol)){cell.remove();marketCells.delete(symbol)}}
  marketBody.querySelector('.market-empty')?.remove();
  stocks.forEach((raw,index)=>{
    const x=normalizeMarketStock(raw);if(!x)return;
    let cell=marketCells.get(x.symbol);
    if(!cell){
      cell=document.createElement('div');cell.className='market-cell';cell.dataset.symbol=x.symbol;
      const head=document.createElement('div');head.className='market-card-head';
      const handle=document.createElement('button');handle.type='button';handle.className='market-drag';handle.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/></svg>';handle.setAttribute('aria-label','拖动排序 '+x.label);handle.title='拖动排序；方向键移动';
      handle.addEventListener('pointerdown',e=>marketStartDrag(e,x.symbol));
      handle.addEventListener('keydown',e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();const i=stocks.findIndex(s=>s.symbol===x.symbol),d=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1,j=i+d;
        if(j<0||j>=stocks.length)return;
        const next=[...stocks];[next[i],next[j]]=[next[j],next[i]];
        try{marketSave(next)}catch(err){toast(err.message)}
      });
      const levels=document.createElement('div');levels.className='market-levels';
      const edit=document.createElement('button');edit.type='button';edit.className='market-edit';edit.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.5 2.5 3 3-7.8 7.8-3.7.7.7-3.7Z"/><path d="m9 4 3 3"/></svg>';edit.addEventListener('click',()=>openMarketEditor(x.symbol));
      head.append(handle,edit);
      const widget=document.createElement('tv-single-ticker');widget.setAttribute('symbol',x.symbol);widget.setAttribute('hide-market-status','');widget.setAttribute('title',x.label);
      cell.append(head,widget,levels);marketCells.set(x.symbol,cell);marketBody.appendChild(cell);
    }
    // CSS order avoids disconnecting/reconnecting live quote components during reorder.
    cell.style.order=index;cell.dataset.emphasis=x.emphasis;
    cell.setAttribute('role','group');cell.setAttribute('aria-label',x.label+' 行情卡片');
    cell.querySelector('.market-drag').setAttribute('aria-label','拖动排序 '+x.label);
    const edit=cell.querySelector('.market-edit');edit.setAttribute('aria-label','编辑 '+x.label+' 参考价');edit.title='编辑买卖参考价';
    const levels=cell.querySelector('.market-levels');levels.replaceChildren();
    const referenceTitle=document.createElement('span');referenceTitle.className='market-reference-title';referenceTitle.textContent='参考价';levels.appendChild(referenceTitle);
    for(const [key,label,op,cls] of [['buyPrice','买','≤','buy'],['sellPrice','卖','≥','sell']]){
      const configured=x[key]!=null;
      const tag=document.createElement('button');tag.type='button';tag.className=(configured?'market-level ':'market-level-empty ')+cls;
      const caption=document.createElement('span');caption.className='market-level-caption';caption.textContent=(label==='买'?'买入':'卖出')+' '+op;
      const price=document.createElement('strong');price.textContent=configured?marketPriceText(x[key]):'—';tag.append(caption,price);
      tag.addEventListener('click',()=>openMarketEditor(x.symbol));tag.setAttribute('aria-label','编辑 '+x.label+' '+(label==='买'?'买入':'卖出')+'参考价'+(configured?' '+marketPriceText(x[key]):'，未设置'));
      tag.title='手动'+(label==='买'?'买入':'卖出')+'参考价 '+(configured?op+' '+marketPriceText(x[key]):'未设置');
      levels.appendChild(tag);
    }
  });
  if(!stocks.length){const empty=document.createElement('div');empty.className='market-empty';empty.textContent='点击右上角 ＋ 添加标的';marketBody.appendChild(empty)}
  marketBody.style.setProperty('--market-cols',resolvedMarketCols());
  updateMarketPanelWidth();
  const count=document.getElementById('watchCount');if(count)count.textContent=stocks.length+' WATCHLIST';
  const cv=document.getElementById('colsValue');if(cv)cv.textContent=layout.cols?layout.cols+' 列（必要时扩展）':'自动 '+resolvedMarketCols()+' 列';
}
function marketStartDrag(e,symbol){
  if(e.button!==0)return;e.preventDefault();
  const handle=e.currentTarget,cell=marketCells.get(symbol);let target=null,started=false;
  marketDrag?.();handle.setPointerCapture(e.pointerId);
  const move=event=>{
    if(!started&&Math.hypot(event.clientX-e.clientX,event.clientY-e.clientY)<5)return;
    started=true;cell.classList.add('market-dragging');
    const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('.market-cell');
    target?.classList.remove('market-drop-target');target=hit&&hit!==cell?hit:null;target?.classList.add('market-drop-target');
  };
  const cleanup=()=>{cell.classList.remove('market-dragging');target?.classList.remove('market-drop-target');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel);handle.removeEventListener('lostpointercapture',cancel);marketDrag=null};
  const cancel=()=>cleanup();
  const up=()=>{
    const targetSymbol=started?target?.dataset.symbol:null;cleanup();
    if(!targetSymbol)return;
    const next=[...stocks],from=next.findIndex(x=>x.symbol===symbol),to=next.findIndex(x=>x.symbol===targetSymbol);
    next.splice(to,0,next.splice(from,1)[0]);
    try{marketSave(next);toast('排序已保存')}catch(err){toast(err.message)}
  };
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);marketDrag=cleanup;
}
function ensureMarketDialog(){
  if(marketDialog)return;
  marketDialog=document.createElement('dialog');marketDialog.className='market-editor';marketDialog.setAttribute('aria-labelledby','marketEditorTitle');
  marketDialog.innerHTML=`<form id="marketEditorForm"><header><h2 id="marketEditorTitle">编辑参考价</h2><button type="button" class="market-editor-close" aria-label="关闭参考价编辑">×</button></header>
    <label id="marketSymbolLabel">标的代码<input id="marketEditorSymbol" placeholder="搜索 NVDA / Apple，或输入 NASDAQ:AMD" autocomplete="off" maxlength="70"></label>
    <div id="marketSearchResults" class="market-search-results"></div>
    <label>显示名称<input id="marketEditorLabel" maxlength="80" autocomplete="off"></label>
    <div class="market-price-fields"><label>买入参考价 ≤<input id="marketEditorBuy" type="number" min="0" step="any" inputmode="decimal" placeholder="未设置"></label><label>卖出参考价 ≥<input id="marketEditorSell" type="number" min="0" step="any" inputmode="decimal" placeholder="未设置"></label></div>
    <label>手动卡片高亮<select id="marketEditorEmphasis"><option value="">默认</option><option value="blue">蓝色</option><option value="violet">紫色</option><option value="amber">琥珀色</option></select></label>
    <p class="market-editor-note">手动参考价，币种与小卡一致；留空即可清除。标签不判断是否触价，行情继续由 TradingView 自动更新。</p>
    <p id="marketEditorError" class="market-editor-error" role="alert"></p>
    <footer class="market-editor-actions"><button type="button" class="market-remove">移除</button><button type="button" class="market-cancel">取消</button><button type="submit" class="market-save">保存</button></footer></form>`;
  document.body.appendChild(marketDialog);
  marketDialog.querySelector('.market-editor-close').onclick=()=>marketDialog.close();marketDialog.querySelector('.market-cancel').onclick=()=>marketDialog.close();
  marketDialog.addEventListener('close',()=>{marketReturnFocus?.isConnected&&marketReturnFocus.focus()});
  marketDialog.querySelector('#marketEditorSymbol').addEventListener('input',()=>{
    const field=marketDialog.querySelector('#marketEditorSymbol'),results=marketDialog.querySelector('#marketSearchResults');results.replaceChildren();
    const query=field.value.trim();if(!query)return;
    for(const item of localStockSearch(query).slice(0,8)){
      const btn=document.createElement('button');btn.type='button';btn.textContent=item.label+' · '+item.symbol;btn.title=item.name||item.symbol;
      btn.onclick=()=>{field.value=item.symbol;marketDialog.querySelector('#marketEditorLabel').value=item.label;results.replaceChildren()};results.appendChild(btn);
    }
  });
  marketDialog.querySelector('.market-remove').onclick=()=>{
    const symbol=marketDialog.dataset.symbol;
    try{marketSave(stocks.filter(x=>x.symbol!==symbol));marketDialog.close();toast('已移除；可用 ＋ 重新添加')}catch(err){marketDialog.querySelector('#marketEditorError').textContent=err.message}
  };
  marketDialog.querySelector('form').onsubmit=e=>{
    e.preventDefault();const get=id=>marketDialog.querySelector('#marketEditor'+id).value.trim();
    try{
      let symbol=marketDialog.dataset.symbol||get('Symbol').toUpperCase();
      if(!symbol.includes(':')){const exact=SYMBOL_CATALOG.find(x=>x.label.toUpperCase()===symbol);if(exact)symbol=exact.symbol}
      const buy=get('Buy'),sell=get('Sell');
      if(buy&&marketPrice(buy)==null||sell&&marketPrice(sell)==null)throw Error('参考价需要是大于 0 的数字');
      if(buy&&sell&&Number(buy)>=Number(sell))throw Error('买入参考价应低于卖出参考价');
      const existing=stocks.find(x=>x.symbol===marketDialog.dataset.symbol);
      const item=normalizeMarketStock({...existing,symbol,label:get('Label'),buyPrice:buy,sellPrice:sell,emphasis:get('Emphasis')});
      if(!item)throw Error('请选择搜索结果，或填写完整代码，例如 NASDAQ:AMD');
      const next=existing?stocks.map(x=>x.symbol===existing.symbol?item:x):[...stocks,item];
      marketSave(next);marketDialog.close();toast(existing?'参考价已保存':'标的已添加');
    }catch(err){marketDialog.querySelector('#marketEditorError').textContent=err.message}
  };
}
function openMarketEditor(symbol=''){
  ensureMarketDialog();const item=stocks.find(x=>x.symbol===symbol);marketReturnFocus=document.activeElement;
  marketDialog.dataset.symbol=item?.symbol||'';marketDialog.querySelector('#marketEditorTitle').textContent=item?'编辑 '+item.label+' 参考价':'添加看板标的';
  for(const [id,value] of [['Symbol',item?.symbol||''],['Label',item?.label||''],['Buy',item?.buyPrice??''],['Sell',item?.sellPrice??''],['Emphasis',item?.emphasis||'']])marketDialog.querySelector('#marketEditor'+id).value=value;
  marketDialog.querySelector('#marketEditorSymbol').readOnly=!!item;
  marketDialog.querySelector('#marketSearchResults').replaceChildren();marketDialog.querySelector('#marketEditorError').textContent='';marketDialog.querySelector('.market-remove').hidden=!item;
  marketDialog.showModal();marketDialog.querySelector(item?'#marketEditorBuy':'#marketEditorSymbol').focus();
}
