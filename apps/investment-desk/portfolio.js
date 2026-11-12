import {esc,fmt,stamp,read,raw,save,id,toast} from '../_decision/core.js';
import {parsePortfolioCSV} from '../_decision/portfolio.mjs';
import {API, refreshData} from '../_shared/on-demand.mjs';
import {investmentRefreshSlot} from './sessions.mjs';
import {DEFAULT_WATCHLIST, batchQuote, mergeMarketItem, readBatchSnapshot, saveBatchSnapshot} from './refresh.mjs';
const batchButton = document.querySelector('#refreshAllButton');
const batchStatus = document.querySelector('#batchRefreshStatus');
const scheduleKey = 'ptu.investment.batch-day-v1';
const snapshotKey = 'ptu.investment.batch-snapshot-v1';
let market = {symbols:{}}, companies = [], busy = false;
let errors = {}, updatedAt = 0, statusTimer;
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
function publish(){dispatchEvent(new CustomEvent('investment-data',{detail:{market,companies,errors,busy}}))}
const dialog = document.querySelector('#portfolio-dialog');
const fileInput = document.querySelector('#portfolio-file');
const previewPanel = document.querySelector('#portfolio-preview');
const feedback = document.querySelector('#csv-feedback');
let preview = null;
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
  if (!save('holdings', merged)) {
    feedback.classList.add('csv-error');
    feedback.textContent = '保存失败。检查当前浏览器的存储后重试。';
    return;
  }
  watchSymbols(mapped);
  save('portfolio-import', {at: new Date().toISOString(), filename: preview.filename});
  dialog.close();
  toast(`已更新 ${mapped.length} 个标的的持仓`);
  if (busy) {
    for (const holding of mapped) importQueue.add(holding.symbol);
    publish();
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
  publish();
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
    if (!onlySymbols && source !== 'import') dispatchEvent(new CustomEvent('investment-model-refresh',{detail:{source}}));
    publish();
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
    publish();
    if (importQueue.size) {
      const queued = new Set(importQueue);
      importQueue.clear();
      refresh('import', queued);
    }
  }
}

function activeWorkspace() {
  return !document.hidden && globalThis.ptNexusActive !== false && !batchButton.closest('[hidden]');
}

function checkSchedule() {
  if (!busy && activeWorkspace() && scheduleDue()) refresh('scheduled');
}

batchButton.addEventListener('click', () => refresh());
addEventListener('workspace-activate', checkSchedule);
addEventListener('investment-refresh', () => { if (activeWorkspace()) refresh(); });
addEventListener('investment-market-item', event => storeItem(event.detail.symbol, event.detail.item));
addEventListener('storage', event => { if (event.key === snapshotKey && !busy) restoreSnapshot(); });
addEventListener('nexus-activate', checkSchedule);
document.addEventListener('visibilitychange', checkSchedule);
setInterval(checkSchedule, 30000);
publish();
restoreSnapshot().finally(checkSchedule);
