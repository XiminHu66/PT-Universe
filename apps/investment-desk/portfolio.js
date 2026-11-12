import {esc,fmt,stamp,read,raw,save,id,json,marketData,link,toast,ask} from '../_decision/core.js';
import {parsePortfolioCSV,portfolioDecision} from '../_decision/portfolio.mjs';
import {API, refreshData} from '../_shared/on-demand.mjs';
import {investmentRefreshSlot} from './sessions.mjs';
import {DEFAULT_WATCHLIST, batchQuote, mergeMarketItem, readBatchSnapshot, saveBatchSnapshot} from './refresh.mjs';
const host = document.querySelector('#portfolio');
const batchButton = document.querySelector('#refreshAllButton');
const batchStatus = document.querySelector('#batchRefreshStatus');
const scheduleKey = 'ptu.investment.batch-day-v1';
const snapshotKey = 'ptu.investment.batch-snapshot-v1';
let market = {symbols:{}}, companies = [], publicData = {sources:[]}, busy = false;
let errors = {}, filter = 'all', initial = null, updatedAt = 0, statusTimer;
const importQueue = new Set();
const watchlist = () => {
  const items = raw('stock_alert_watchlist_v1');
  return items.length ? items : structuredClone(DEFAULT_WATCHLIST);
};
export function watchSymbols(positions){const old=watchlist();for(const h of positions)if(!old.some(w=>w.symbol===h.symbol))old.push({symbol:h.symbol,display:h.symbol,name:h.description||h.symbol});localStorage.setItem('stock_alert_watchlist_v1',JSON.stringify(old));dispatchEvent(new CustomEvent('decision-change',{detail:{key:'watchlist'}}));}
const holdings=()=>read('holdings');
function positions() {
  const bySymbol = new Map();
  for (const item of [...holdings(), ...watchlist()]) {
    const symbol = typeof item?.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
    if (!/^\^?[A-Z][A-Z0-9.=-]{0,14}$/.test(symbol || '') || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, {...item, symbol, description:item.description || item.name});
  }
  return [...bySymbol.values()];
}
function decisions(){return positions().map(h=>{const q=market.symbols[h.symbol],c=companies.find(c=>c.ticker===h.symbol);return {h,q,c,d:portfolioDecision(h,q,c,raw('ptu.labs.theses'))}}).sort((a,b)=>['sell','trim','buy','candidate','unknown','wait'].indexOf(a.d.state)-['sell','trim','buy','candidate','unknown','wait'].indexOf(b.d.state))}
function related(symbol){return publicData.sources.flatMap(s=>(s.trades||[]).filter(t=>t.ticker===symbol).map(t=>({...t,source:s}))).sort((a,b)=>b.disclosureDate.localeCompare(a.disclosureDate)).slice(0,3)}
function card({h,q,c,d}){const pnl=h.cost>0&&q?.currency==='USD'&&d.price>0?(d.price/h.cost-1)*100:null;const trades=related(h.symbol);return `<article class="d-panel" data-position="${esc(h.symbol)}"><div class="d-row"><div><small>${h.quantity?'持仓 '+fmt(h.quantity,6)+' 股 · 成本 $'+fmt(h.cost):'仅观察'}${pnl!==null?' · 价格 / 成本 '+fmt(pnl)+'%':''}</small><h2>${esc(h.symbol)} <span class="d-pill ${d.state==='unknown'?'unknown':''}">${esc(d.label)}</span></h2></div><div><strong style="font-size:25px">${q?.currency==='USD'?'$':''}${fmt(d.price)}</strong><br><small>${esc(stamp(q?.lastTradeAt))}</small></div></div>${errors[h.symbol]?'<p class="d-error">本次刷新：'+esc(errors[h.symbol])+'；下方保留旧快照及其时间。</p>':''}<p>${d.reasons.map(esc).join('；')}</p>${d.buy?`<div class="d-grid"><div class="d-inset"><small>买入 / 加仓技术参考区 · USD</small><h3>$${fmt(d.buy[0])} – $${fmt(d.buy[1])}</h3></div><div class="d-inset"><small>减仓 / 止盈技术参考区 · USD</small><h3>$${fmt(d.sell[0])} – $${fmt(d.sell[1])}</h3></div></div><p class="d-muted">失效参考 $${fmt(d.invalidation)} · 基于均线、支撑阻力与 ATR；不是内在公允价值或保证成交价。</p>`:''}<details><summary>为什么 · 证据与公开披露</summary><ul>${d.evidence.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul><p>${link(q?.sourceURL||'https://finance.yahoo.com/quote/'+h.symbol+'/', '行情与历史数据')} · 日线截至 ${esc(q?.history?.at(-1)?.d||'缺失')} · ${q?.provider?esc(q.provider):'Yahoo Finance 延迟快照'}</p>${c?'<p>'+link(c.sourceURL,'财报原始页面')+' · 数据检查 '+esc(stamp(c.updatedAt))+'</p>':'<p>尚无可用公司财报（ETF 不使用公司财报规则）。</p>'}${(q?.news||[]).slice(0,3).map(n=>'<p>'+link(n.url||n.link,n.title)+'</p>').join('')}${trades.length?trades.map(t=>'<div class="d-inset">'+esc(t.source.name)+' · '+esc(t.type)+' · '+esc(t.assetType)+' · '+esc(t.amountLabel)+'<p>交易 '+esc(t.transactionDate)+' → 披露 '+esc(t.disclosureDate)+' · '+link(t.sourceLink,'申报原文')+'</p></div>').join(''):'<p>内置来源尚无此标的的披露记录；不代表没有交易。</p>'}</details><div class="d-actions"><button data-market="${esc(h.symbol)}">行情与区间</button><button data-audit="${esc(h.symbol)}">核验名人信号</button><button data-ask="${esc(h.symbol)}">带这些证据深入问 GPT ↗</button></div></article>`}
function publish(){dispatchEvent(new CustomEvent('investment-data',{detail:{market,companies,errors,busy}}))}
function render(){publish();const rows=decisions();host.innerHTML=`<section class="d-panel"><div class="d-row"><div><h2>从你的持仓开始</h2><p>导入券商 CSV，更新持仓和自选。每个交易日美西 08:00 核对持仓与自选，也可手动刷新。</p></div><button id="portfolio-refresh" ${busy?'disabled':''}>${busy?'正在刷新…':'刷新全部'}</button></div><div class="d-actions"><button id="portfolio-open-review" type="button" class="csv-primary" aria-haspopup="dialog">导入 / 更新持仓 CSV</button><small>${esc(importSummary())}</small></div><details><summary>导入说明与信号规则</summary><p>支持 Fidelity 持仓导出或 Symbol,Quantity,Cost（Cost 为每股美元成本），也识别总成本；多账户同代码自动合并，现金、期权、空头会列出并跳过。成交后重新导入，CSV 不与券商自动同步。</p><p>买入候选需价格进入支撑区、趋势不弱、RSI &lt; 60；完整买入候选还需营收同比、营业利润与自由现金流均为正。进入阻力区或 RSI ≥ 72 提示减仓；跌破失效位、趋势明显转弱或论点不满足提示风险复查。行情超过 96 小时则停发信号。区间适合日线观察，不给自动下单或仓位比例。</p><p>只有导入的 USD 多头股票 / ETF 适用；没有你的投资期限、现金需求和完整资产，候选仍需你决定。观察列表包含原有关注项。</p></details></section><div class="d-row"><h2>今天看什么</h2><label>显示<select id="portfolio-filter"><option value="all">持仓与观察列表</option><option value="held">仅持仓</option><option value="action">买卖候选与风险复查</option></select></label></div><p class="d-muted">${busy?'正在获取新证据；先显示已有快照。':updatedAt?'已读取最近核对的行情和财报。':'显示最近可用的快照。'} 政客交易和机构季度持仓是辅助证据，不能单独触发买入。</p>${(rows.filter(r=>filter==='held'?r.h.quantity>0:filter==='action'?['buy','candidate','sell','trim'].includes(r.d.state):true).map(card).join(''))||'<div class="d-empty">选择持仓 CSV 即可开始；也可在「公开交易核验」直接把标的加入观察列表。</div>'}`;
 host.querySelector('#portfolio-filter').value=filter;host.querySelector('#portfolio-filter').onchange=e=>{filter=e.target.value;render()};host.querySelector('#portfolio-refresh').onclick=()=>refresh();
 host.querySelector('#portfolio-open-review').onclick=openImport;
 for(const b of host.querySelectorAll('[data-market],[data-audit]'))b.onclick=()=>dispatchEvent(new CustomEvent('investment-select',{detail:{symbol:b.dataset.market||b.dataset.audit,tab:b.dataset.market?'market':'audit'}}));
 for(const b of host.querySelectorAll('[data-ask]'))b.onclick=()=>{const row=rows.find(r=>r.h.symbol===b.dataset.ask);ask(row.h.symbol+' 持仓复查',JSON.stringify(row,null,2),'核查这些买卖候选和技术价位；结合最新事件，区分事实、推断与缺失证据。')};
}
const dialog = document.querySelector('#portfolio-dialog');
const fileInput = document.querySelector('#portfolio-file');
const previewPanel = document.querySelector('#portfolio-preview');
const feedback = document.querySelector('#csv-feedback');
let preview = null;
let importing = false;
let readVersion = 0;

function importSummary() {
  const {at} = read('portfolio-import', {});
  return `${holdings().length} 个持仓 · ${at ? '上次导入 ' + stamp(at) : '尚未导入'}`;
}

function resetImport() {
  readVersion++;
  preview = null;
  fileInput.value = '';
  previewPanel.replaceChildren();
  feedback.textContent = '文件在当前浏览器解析。确认预览后才会更新持仓。';
  feedback.classList.remove('csv-error');
}

function openImport() {
  resetImport();
  document.querySelector('#csv-last-import').textContent = importSummary();
  dialog.showModal();
}

function renderImport() {
  previewPanel.innerHTML = `<div class="d-inset">
    <h3>导入预览 · ${preview.positions.length} 个标的</h3>
    <div class="d-table csv-preview-table"><table><thead><tr><th>代码</th><th>数量</th><th>每股成本 USD</th></tr></thead>
    <tbody>${preview.positions.map(h => `<tr><td>${esc(h.symbol)}</td><td>${fmt(h.quantity, 6)}</td><td>${fmt(h.cost)}</td></tr>`).join('')}</tbody></table></div>
    ${preview.warnings.length ? `<p>${preview.warnings.map(esc).join('；')}</p>` : ''}
    ${preview.skipped.length ? `<details><summary>跳过 ${preview.skipped.length} 行（现金 / 非股票等）</summary>${preview.skipped.map(x => `<p>第 ${x.row} 行 ${esc(x.symbol)}：${esc(x.reason)}</p>`).join('')}</details>` : ''}
    <label class="csv-mode">导入方式<select id="import-mode">
      <option value="merge">更新同代码持仓，保留其他持仓</option>
      <option value="replace">用本文件替换全部持仓</option>
    </select></label>
    <div class="d-actions"><button id="portfolio-import" type="button" class="d-primary">确认更新持仓</button><button id="portfolio-cancel" type="button">取消</button></div>
  </div>`;
}

async function previewFile() {
  const file = fileInput.files[0];
  if (!file || !dialog.open) return;
  const version = ++readVersion;
  preview = null;
  previewPanel.replaceChildren();
  feedback.classList.remove('csv-error');
  feedback.textContent = '正在读取 CSV…';
  try {
    if (file.size > 2000000) throw Error('CSV 超过 2 MB');
    const parsed = parsePortfolioCSV(await file.text());
    if (parsed.positions.length > 150) throw Error('单次最多导入 150 个股票代码');
    if (version !== readVersion || !dialog.open) return;
    preview = {...parsed, filename: file.name};
    feedback.textContent = `已读取 ${file.name}。核对数量和成本后确认更新。`;
    renderImport();
  } catch (error) {
    if (version !== readVersion || !dialog.open) return;
    feedback.classList.add('csv-error');
    feedback.textContent = error.message;
    fileInput.value = '';
  }
}

function importPositions() {
  if (!preview) return;
  const old = holdings();
  const mode = previewPanel.querySelector('#import-mode').value;
  const mapped = preview.positions.map(h => {
    const previous = old.find(item => item.symbol === h.symbol);
    return {...previous, ...h, id: previous?.id || id(), reviews: previous?.reviews || [], movePct: 5};
  });
  const merged = mode === 'replace' ? mapped : [...old.filter(h => !mapped.some(x => x.symbol === h.symbol)), ...mapped];
  importing = true;
  try {
    if (!save('holdings', merged)) {
      feedback.classList.add('csv-error');
      feedback.textContent = '保存失败。检查当前浏览器的存储后重试。';
      return;
    }
    watchSymbols(mapped);
    save('portfolio-import', {at: new Date().toISOString(), filename: preview.filename});
  } finally {
    importing = false;
  }
  dialog.close();
  toast(`已更新 ${mapped.length} 个标的的持仓`);
  if (busy) {
    for (const holding of mapped) importQueue.add(holding.symbol);
    render();
  } else refresh('import');
}

document.querySelector('#portfolio-open').addEventListener('click', openImport);
dialog.addEventListener('close', resetImport);
fileInput.addEventListener('change', previewFile);
previewPanel.addEventListener('click', event => {
  if (event.target.id === 'portfolio-import') importPositions();
  if (event.target.id === 'portfolio-cancel') dialog.close();
});

function mergeCompany(company) {
  if (!company) return;
  const previous = companies.find(item => item.ticker === company.ticker);
  if (!previous || Date.parse(company.updatedAt) >= Date.parse(previous.updatedAt)) {
    companies = [...companies.filter(item => item.ticker !== company.ticker), company];
  }
}

function storeItem(symbol, item) {
  market.symbols[symbol] = mergeMarketItem(market.symbols[symbol], item);
}

async function restoreSnapshot() {
  const saved = await readBatchSnapshot();
  if (!saved) return;
  for (const [symbol, item] of Object.entries(saved.symbols)) storeItem(symbol, item);
  for (const company of saved.companies) mergeCompany(company);
  updatedAt = Math.max(updatedAt, saved.at || 0);
  if (!busy) render();
  else publish();
}

function updateBatchStatus(message, active = false) {
  clearTimeout(statusTimer);
  batchStatus.textContent = message;
  if (!active && message) statusTimer = setTimeout(() => {batchStatus.textContent = '';}, 18000);
}

async function saveSnapshot(symbols, completed = false) {
  const current = new Set(symbols);
  const saved = await saveBatchSnapshot({
    symbols: Object.fromEntries(symbols.flatMap(symbol => market.symbols[symbol] ? [[symbol, market.symbols[symbol]]] : [])),
    companies: companies.filter(company => current.has(company.ticker)),
    at: completed ? Date.now() : updatedAt
  });
  if (saved) localStorage.setItem(snapshotKey, String(Date.now()));
  return saved;
}

async function loadQuote(symbol) {
  const response = await fetch(API + '/api/investment/quote?symbol=' + encodeURIComponent(symbol), {signal:AbortSignal.timeout(40000)});
  const payload = await response.json();
  if (!response.ok) throw Error(payload.error || '报价暂不可用');
  storeItem(symbol, batchQuote(payload.quote, symbol));
  mergeCompany(payload.company);
  const financialError = typeof payload.financialError === 'string' && !payload.financialError.startsWith('ETF / 指数');
  if (financialError) errors[symbol] = '财报：' + payload.financialError;
  return financialError;
}

async function loadDetail(symbol) {
  // The VPS collector is shared. Give an already-running job a chance to finish before retrying once.
  let state;
  const request = () => refreshData('stock', {symbol, onStatus: result => {state = result.state;}});
  let result;
  try { result = await request(); }
  catch (error) {
    if (state !== 'busy') throw error;
    await new Promise(resolve => setTimeout(resolve, 8000));
    result = await request();
  }
  if (result.state !== 'fresh' || result.data?.symbol !== symbol) throw Error('保留已有新闻与期权');
  storeItem(symbol, result.data);
}

async function runBatch(symbols) {
  const failedQuotes = new Set(), failedDetails = new Set(), failedFinancials = new Set();
  let done = 0;
  const pendingQuotes = symbols.slice();
  updateBatchStatus(`报价 0/${symbols.length}`, true);
  await Promise.all(Array.from({length:Math.min(3, symbols.length)}, async () => {
    while (pendingQuotes.length) {
      const symbol = pendingQuotes.shift();
      try { if (await loadQuote(symbol)) failedFinancials.add(symbol); }
      catch (error) {
        failedQuotes.add(symbol);
        errors[symbol] = error.message;
      }
      updateBatchStatus(`报价 ${++done}/${symbols.length}`, true);
    }
  }));
  publish();
  await saveSnapshot(symbols);
  const pendingDetails = new Set(symbols);
  updateBatchStatus(`新闻与期权 0/${symbols.length}`, true);
  while (pendingDetails.size) {
    const selected = document.querySelector('#ws-symbol').value;
    const symbol = pendingDetails.has(selected) ? selected : pendingDetails.values().next().value;
    pendingDetails.delete(symbol);
    try { await loadDetail(symbol); }
    catch { failedDetails.add(symbol); }
    updateBatchStatus(`新闻与期权 ${symbols.length - pendingDetails.size}/${symbols.length}`, true);
    publish();
  }
  return {failedQuotes, failedDetails, failedFinancials};
}

function scheduleDue() {
  const slot = investmentRefreshSlot();
  return slot && localStorage.getItem(scheduleKey) !== slot;
}

async function refresh(source = 'manual', onlySymbols = null) {
  if (busy || source === 'scheduled' && (!activeWorkspace() || !scheduleDue())) return;
  busy = true;
  batchButton.disabled = true;
  let completion = '';
  const run = async lock => {
    if (!lock) {
      if (source === 'manual') completion = '另一标签页正在刷新全部';
      return;
    }
    if (source === 'scheduled' && (!activeWorkspace() || !scheduleDue())) return;
    const allSymbols = positions().map(item => item.symbol);
    const symbols = onlySymbols ? allSymbols.filter(symbol => onlySymbols.has(symbol)) : allSymbols;
    if (!symbols.length) { completion = '暂无可刷新的标的'; return; }
    const slot = investmentRefreshSlot();
    errors = {};
    render();
    const {failedQuotes, failedDetails, failedFinancials} = await runBatch(symbols);
    for (const symbol of symbols) importQueue.delete(symbol);
    updatedAt = Date.now();
    const saved = await saveSnapshot(positions().map(item => item.symbol), true);
    if (slot && !onlySymbols) localStorage.setItem(scheduleKey, slot);
    const failed = new Set([...failedQuotes, ...failedDetails, ...failedFinancials]);
    const counts = `报价 ${symbols.length - failedQuotes.size}/${symbols.length} · 新闻与期权 ${symbols.length - failedDetails.size}/${symbols.length}`;
    const note = failed.size ? ` · ${failed.size} 个标的有数据未更新` : '';
    completion = counts + note;
    const failedList = [failedQuotes.size && `报价：${[...failedQuotes].join('、')}`, failedDetails.size && `新闻与期权：${[...failedDetails].join('、')}`, failedFinancials.size && `财报：${[...failedFinancials].join('、')}`].filter(Boolean);
    batchButton.title = `上次核对 ${stamp(new Date(updatedAt).toISOString())} · ${completion}${failedList.length ? '\n'+failedList.join('\n') : ''}${saved ? '' : '\n浏览器未能保存批量快照'}`;
  };
  try {
    if (navigator.locks) await navigator.locks.request('ptu-investment-refresh', {ifAvailable:true}, run);
    else await run(true);
  } catch {
    completion = '刷新中断，已保留可用快照';
  } finally {
    busy = false;
    batchButton.disabled = false;
    updateBatchStatus(completion);
    render();
    if (importQueue.size) {
      const queued = new Set(importQueue);
      importQueue.clear();
      refresh('import', queued);
    }
  }
}

async function openPortfolio() {
  if (!initial) initial = (async () => {
    const [quotes, financials, disclosures] = await Promise.allSettled([
      marketData(), json('apps/thesis-lab/data/financials.json'), json('apps/investment-desk/data/public-trades.json')
    ]);
    if (quotes.status === 'fulfilled') {
      for (const [symbol, item] of Object.entries(quotes.value.symbols)) storeItem(symbol, item);
    }
    if (financials.status === 'fulfilled') for (const company of financials.value.companies || []) mergeCompany(company);
    if (disclosures.status === 'fulfilled') publicData = disclosures.value;
    render();
  })();
  await initial;
}

function activeWorkspace() {
  return !document.hidden && globalThis.ptNexusActive !== false &&
    (!host.closest('[hidden]') || !batchButton.closest('[hidden]'));
}

function checkSchedule() {
  if (!busy && activeWorkspace() && scheduleDue()) refresh('scheduled');
}

batchButton.addEventListener('click', () => refresh());
addEventListener('workspace-activate', event => {
  if (event.detail.tab === 'review') openPortfolio();
  checkSchedule();
});
addEventListener('investment-refresh', () => { if (activeWorkspace()) refresh(); });
addEventListener('investment-market-item', event => storeItem(event.detail.symbol, event.detail.item));
addEventListener('decision-change', event => {
  if (!importing && ['watchlist','holdings'].includes(event.detail.key) && !host.closest('[hidden]')) render();
});
addEventListener('decision-thesis-updated', () => { if (!host.closest('[hidden]')) render(); });
addEventListener('pt-sync-applied', () => { if (!host.closest('[hidden]')) render(); });
addEventListener('storage', event => { if (event.key === snapshotKey && !busy) restoreSnapshot(); });
addEventListener('nexus-activate', checkSchedule);
document.addEventListener('visibilitychange', checkSchedule);
setInterval(checkSchedule, 30000);
render();
if (!host.closest('[hidden]')) openPortfolio();
restoreSnapshot().finally(checkSchedule);
