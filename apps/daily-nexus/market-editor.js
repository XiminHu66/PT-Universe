/* Manual reference levels only. Quotes and their connection stay in TradingView. */
const marketCells=new Map();
let marketEditing=false,marketDialog=null,marketReturnFocus=null,marketDrag=null;
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
      const handle=document.createElement('button');handle.type='button';handle.className='market-drag';handle.textContent='⠿';handle.setAttribute('aria-label','拖动排序 '+x.label);handle.title='拖动排序；方向键移动';
      handle.addEventListener('pointerdown',e=>marketStartDrag(e,x.symbol));
      handle.addEventListener('keydown',e=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();const i=stocks.findIndex(s=>s.symbol===x.symbol),d=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1,j=i+d;
        if(j<0||j>=stocks.length)return;
        const next=[...stocks];[next[i],next[j]]=[next[j],next[i]];
        try{marketSave(next)}catch(err){toast(err.message)}
      });
      const link=document.createElement('a');link.className='market-symbol';link.href='https://www.tradingview.com/symbols/'+encodeURIComponent(x.symbol.replace(':','-'))+'/';link.target='_blank';link.rel='noopener';
      const levels=document.createElement('div');levels.className='market-levels';
      const edit=document.createElement('button');edit.type='button';edit.className='market-edit';edit.textContent='✎';edit.addEventListener('click',()=>openMarketEditor(x.symbol));
      head.append(handle,link,levels,edit);
      const widget=document.createElement('tv-single-ticker');widget.setAttribute('symbol',x.symbol);widget.setAttribute('hide-market-status','');widget.setAttribute('title',x.label);
      cell.append(head,widget);marketCells.set(x.symbol,cell);marketBody.appendChild(cell);
    }
    // CSS order avoids disconnecting/reconnecting live quote components during reorder.
    cell.style.order=index;cell.dataset.emphasis=x.emphasis;
    const link=cell.querySelector('.market-symbol');link.textContent=x.symbol.split(':').pop();link.title=x.label;
    const edit=cell.querySelector('.market-edit');edit.setAttribute('aria-label','编辑 '+x.label+' 参考价');edit.title='编辑买卖参考价';
    const levels=cell.querySelector('.market-levels');levels.replaceChildren();
    for(const [key,label,op,cls] of [['buyPrice','买','≤','buy'],['sellPrice','卖','≥','sell']]){
      if(x[key]==null)continue;
      const tag=document.createElement('span');tag.className='market-level '+cls;tag.textContent=label+op+marketPriceText(x[key]);tag.title='手动'+(label==='买'?'买入':'卖出')+'参考价 '+op+' '+marketPriceText(x[key]);
      levels.appendChild(tag);
    }
  });
  if(!stocks.length){const empty=document.createElement('div');empty.className='market-empty';empty.textContent='点击右上角 ＋ 添加标的';marketBody.appendChild(empty)}
  marketBody.style.setProperty('--market-cols',resolvedMarketCols());
  marketBody.classList.toggle('market-sorting',marketEditing);
  const count=document.getElementById('watchCount');if(count)count.textContent=stocks.length+' WATCHLIST';
  const cv=document.getElementById('colsValue');if(cv)cv.textContent=layout.cols?layout.cols+' 列（必要时扩展）':'自动 '+resolvedMarketCols()+' 列';
}
function toggleMarketEditing(){
  marketEditing=!marketEditing;const btn=document.getElementById('marketEditToggle');btn.textContent=marketEditing?'完成':'排序';btn.setAttribute('aria-pressed',String(marketEditing));marketBody.classList.toggle('market-sorting',marketEditing);
  if(marketEditing)toast('拖动 ⠿ 排序，也可聚焦后按方向键');
}
function marketStartDrag(e,symbol){
  if(!marketEditing||e.button!==0)return;e.preventDefault();
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
    <label>卡片高亮<select id="marketEditorEmphasis"><option value="">默认</option><option value="blue">蓝色</option><option value="violet">紫色</option><option value="amber">琥珀色</option></select></label>
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
