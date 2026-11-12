import {esc, fmt, stamp, read, raw, save, json, link, toast} from '../_decision/core.js';
import {API, refreshData} from '../_shared/on-demand.mjs';
import {investmentRefreshSlot} from './sessions.mjs';
import {DEFAULT_WATCHLIST} from './refresh.mjs';
import {watchSymbols} from './portfolio.js?v=20261112-audit';
import {normalizeDisclosures, keepAvailableSources} from './disclosures.mjs';

const host = document.querySelector('#public-audit');
const panel = document.querySelector('#panel-audit');
const cacheKey = 'pt-disclosures-data';
const runKey = 'ptu.disclosure-refresh-v1';
const collectorPath = API + '/api/on-demand/disclosures';
const tracefour = 'https://tracefour.com/api-docs/congress-trading-api';
const tickerPattern = /^[A-Z][A-Z0-9.^-]{0,14}$/;
const pageSize = 24;
const state = {kind:'congress', person:'all', symbol:'', direction:'all', days:90, held:false, limit:pageSize};
let data = normalizeDisclosures(raw(cacheKey, null));
let busy = false, initial, retryAt = 0;

host.innerHTML = `<section class="audit-board" aria-labelledby="audit-title">
  <header class="audit-heading">
    <div><h2 id="audit-title">公开交易核验</h2><p id="audit-status" role="status">交易日美西 08:00 检查</p></div>
    <button id="refresh-disclosures" type="button" hidden>重试抓取</button>
  </header>
  <div class="audit-summary" id="audit-summary"></div>
  <div class="audit-toolbar">
    <div class="audit-switch" role="group" aria-label="披露类型">
      <button type="button" data-kind="congress" aria-pressed="true">议员交易</button>
      <button type="button" data-kind="13f" aria-pressed="false">机构 13F</button>
    </div>
    <label><span class="sr-only">来源</span><select id="audit-person"><option value="all">全部已关注</option></select></label>
    <label><span class="sr-only">股票代码</span><input id="audit-symbol" placeholder="搜索标的" type="search" maxlength="15"></label>
    <label id="audit-direction-wrap"><span class="sr-only">申报类别</span><select id="audit-direction"><option value="all">全部类别</option><option value="buy">买入</option><option value="sell">卖出</option></select></label>
    <label id="audit-days-wrap"><span class="sr-only">披露时间</span><select id="audit-days"><option value="30">近 30 天</option><option value="90" selected>近 90 天</option><option value="0">全部日期</option></select></label>
    <label class="audit-holdings"><input type="checkbox" id="audit-held">仅我的持仓</label>
  </div>
  <p class="audit-context" id="audit-context"></p>
  <div class="audit-results" id="audit-results" role="region" aria-label="披露记录" tabindex="0"></div>
  <footer class="audit-footer"><span id="audit-count"></span><button type="button" id="audit-more" hidden>显示更多</button></footer>
  <details class="audit-sources"><summary>关注来源与核验说明</summary><div id="audit-sources"></div>
    <p>数据整理来自 ${link(tracefour,'Tracefour')}（CC BY 4.0）。看板检查日期顺序、重复记录和官方链接。披露可能滞后，申报金额通常是区间。交易条款、备注及修订以原文为准。</p>
    <p>13F 显示季度末持仓。新增与股数变化按季度比较，期权单独标示。</p>
  </details>
</section>`;
const get = selector => host.querySelector(selector);
const selected = () => read('public-follow', data?.sources.map(source => source.id) || []);
const heldSymbols = () => new Set(read('holdings').map(item => item.symbol));
const owner = {Self:'本人', Spouse:'配偶', Joint:'共同', Dependent:'受抚养人', Other:'其他'};
const asset = {Stock:'正股', 'Stock Option':'期权', ETF:'ETF'};

function original(filing) {
  return filing ? link(filing.url, filing.name) : '<span class="audit-pending">原文待核对</span>';
}

function actions(symbol, watch) {
  if (!tickerPattern.test(symbol || '')) return '';
  const value = esc(symbol);
  return `<button type="button" data-open="${value}">看行情</button>
    ${watch.has(symbol) ? '<span class="audit-followed">已自选</span>' : `<button type="button" data-watch="${value}">＋ 自选</button>`}`;
}

function tradeRow(trade, holdings, watch) {
  const side = trade.type === 'Purchase' ? '买入' : trade.type.startsWith('Sale') ? '卖出' : trade.type === 'Exchange' ? '换股' : esc(trade.type === 'Other' ? '其他' : trade.type);
  const tone = side === '买入' ? 'buy' : side === '卖出' ? 'sell' : '';
  return `<tr><td><strong>${esc(trade.ticker)}</strong>${holdings.has(trade.ticker) ? '<small class="audit-held-tag">持仓</small>' : ''}</td>
    <td>${esc(trade.source.name)}<small>${esc(owner[trade.owner] || trade.owner || '未标明')}</small></td>
    <td><span class="audit-side ${tone}">${side}</span><small>${esc(asset[trade.assetType] || trade.assetType || '未标明')}</small></td>
    <td><time datetime="${esc(trade.disclosureDate)}">${esc(trade.disclosureDate)}</time><small>交易 ${esc(trade.transactionDate)} · 相隔 ${trade.lag} 天</small></td>
    <td>${esc(trade.amountLabel || '未标明')}</td>
    <td class="audit-actions">${original(trade.filing)}${actions(trade.ticker, watch)}</td></tr>`;
}

function fundRow(item, holdings, watch) {
  const {source, holding, quarter} = item;
  const change = holding.sharesChangePct;
  const move = holding.isNew ? '季度新增' : Number.isFinite(change) ? `股数 ${change > 0 ? '+' : ''}${fmt(change, 1)}%` : '变化未提供';
  return `<tr><td><strong>${esc(holding.ticker || holding.issuerName)}</strong>${holdings.has(holding.ticker) ? '<small class="audit-held-tag">持仓</small>' : ''}</td>
    <td>${esc(source.name)}${holding.putCall ? `<small>${esc(holding.putCall)} 期权</small>` : ''}</td>
    <td>${esc(move)}<small>权重 ${Number.isFinite(holding.weight) ? fmt(holding.weight * 100) + '%' : '—'}</small></td>
    <td>${esc(quarter.periodEnd)}<small>披露 ${esc(quarter.filedAt)}</small></td>
    <td class="audit-actions">${original(quarter.filing)}${actions(holding.ticker,watch)}</td></tr>`;
}

function updateStatus() {
  const last = raw(runKey, {});
  const fresh = data ? `快照 ${stamp(data.generatedAt)}` : '等待披露数据';
  get('#audit-status').textContent = busy ? '正在核对披露来源…' : last.error ? `${last.error} · ${fresh}` : `交易日美西 08:00 检查 · ${fresh}`;
  const retry = get('#refresh-disclosures');
  retry.hidden = !last.error;
  retry.disabled = busy;
}

function render() {
  if (panel.hidden) return;
  updateStatus();
  if (!data) {
    get('#audit-results').innerHTML = '<p class="audit-empty">正在读取最近可用的披露快照。</p>';
    return;
  }
  const follow = selected(), holdings = heldSymbols();
  const savedWatch = raw('stock_alert_watchlist_v1');
  const watch = new Set((savedWatch.length ? savedWatch : DEFAULT_WATCHLIST).map(item=>item.symbol));
  const available = data.sources.filter(source=>source.kind===state.kind);
  const visible = available.filter(source=>state.person==='all' ? follow.includes(source.id) : source.id===state.person);
  const congress = state.kind === 'congress';
  const cut = new Date(Date.now() - state.days * 86400000).toISOString().slice(0, 10);
  const matches = symbol => (!state.symbol || symbol?.includes(state.symbol)) && (!state.held || holdings.has(symbol));
  const rows = congress ? visible.flatMap(source=>source.trades.map(trade=>({...trade,source})))
    .filter(trade=>matches(trade.ticker) && (!state.days || trade.disclosureDate >= cut) &&
      (state.direction==='all' || (state.direction==='buy' ? trade.type==='Purchase' : trade.type.startsWith('Sale'))))
    .sort((a,b)=>b.disclosureDate.localeCompare(a.disclosureDate) || b.transactionDate.localeCompare(a.transactionDate))
    : visible.flatMap(source=>source.snapshot?.holdings.filter(holding=>matches(holding.ticker)).map(holding=>({holding,source,quarter:source.snapshot})) || [])
      .sort((a,b)=>b.quarter.filedAt.localeCompare(a.quarter.filedAt) || (b.holding.weight||0)-(a.holding.weight||0));
  const latest = visible.flatMap(source=>congress ? source.trades.map(trade=>trade.disclosureDate) : [source.snapshot?.filedAt]).filter(Boolean).sort().at(-1);
  const healthy = data.sources.filter(source=>source.ok && (source.kind==='congress' || source.snapshot)).length;
  const related = rows.filter(row=>holdings.has(congress ? row.ticker : row.holding.ticker)).length;
  get('#audit-summary').innerHTML = `<span><strong>${rows.length}</strong> ${congress?'匹配披露':'匹配仓位'}</span>
    <span><strong>${related}</strong> 涉及持仓</span><span>来源最新披露 <strong>${esc(latest || '—')}</strong></span>
    <span class="${healthy===data.sources.length?'':'audit-pending'}">来源 <strong>${healthy}/${data.sources.length}</strong> 正常</span>`;
  const person = get('#audit-person');
  person.innerHTML = '<option value="all">全部已关注</option>' + available.map(source=>`<option value="${esc(source.id)}">${esc(source.name)}</option>`).join('');
  person.value = state.person;
  get('#audit-direction-wrap').hidden = get('#audit-days-wrap').hidden = !congress;
  get('#audit-context').textContent = congress ? '按披露日排序 · 类别以申报为准' : '季末仓位 · 股数变化按季度比较';
  const columns = congress ? ['标的','披露人','类别 / 资产','披露日','申报金额','核验 / 追踪'] : ['标的','机构','季度变化','报告期末','核验 / 追踪'];
  get('#audit-results').innerHTML = rows.length ? `<table class="audit-table"><thead><tr>${columns.map(column=>`<th scope="col">${column}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0,state.limit).map(row=>congress ? tradeRow(row,holdings,watch) : fundRow(row,holdings,watch)).join('')}</tbody></table>`
    : '<p class="audit-empty">当前筛选没有记录。可放宽日期、来源或持仓筛选。</p>';
  get('#audit-count').textContent = rows.length ? `显示 ${Math.min(rows.length,state.limit)} / ${rows.length}` : '';
  get('#audit-more').hidden = state.limit >= rows.length;
  get('#audit-sources').innerHTML = data.sources.map(source=>{
    const bad = (source.invalid || 0) + (source.kind==='13f' && !source.snapshot ? 1 : 0);
    const duplicates = source.duplicates || 0;
    return `<label><input type="checkbox" data-follow="${esc(source.id)}" ${follow.includes(source.id)?'checked':''}>
      <span>${esc(source.name)} <small>${source.ok ? stamp(source.checkedAt) : '保留上次数据'}${bad ? ` · ${bad} 条格式异常` : ''}${duplicates ? ` · 去重 ${duplicates} 条` : ''}</small></span></label>`;
  }).join('');
}

function adopt(payload) {
  const normalized = normalizeDisclosures(payload);
  if (!normalized || data && Date.parse(normalized.generatedAt) < Date.parse(data.generatedAt)) return false;
  data = keepAvailableSources(data, normalized);
  try { localStorage.setItem(cacheKey,JSON.stringify(data)); } catch {}
  render();
  return true;
}

async function collectorSnapshot() {
  const response = await fetch(collectorPath,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('披露接口暂不可用');
  return response.json();
}

function openAudit() {
  if (!initial) initial = Promise.allSettled([
    json('apps/investment-desk/data/public-trades.json').then(adopt),
    collectorSnapshot().then(result=>adopt(result.data))
  ]).then(()=>{
    if (!data && !panel.hidden) get('#audit-results').innerHTML = '<p class="audit-empty">暂时无法取得公开申报。</p>';
  });
  render();
}

function active() {
  return !document.hidden && globalThis.ptNexusActive !== false;
}

async function refreshDisclosures(retry = false) {
  const slot = investmentRefreshSlot();
  if (busy || !active() || !retry && (!slot || Date.now() < retryAt || raw(runKey,{}).slot === slot)) return;
  busy = true;
  updateStatus();
  const run = async lock => {
    if (!lock || !retry && raw(runKey,{}).slot === slot) return;
    let collectorState;
    try {
      const snapshot = await collectorSnapshot().catch(()=>null);
      if (slot && investmentRefreshSlot(Date.parse(snapshot?.updatedAt)) === slot && adopt(snapshot.data)) {
        localStorage.setItem(runKey,JSON.stringify({slot}));
        return;
      }
      const result = await refreshData('disclosures',{force:true,onStatus:packet=>{collectorState=packet.state;}});
      if (!adopt(result.data)) throw Error('披露快照校验失败');
      localStorage.setItem(runKey,JSON.stringify({slot}));
    } catch {
      if (collectorState === 'busy') {
        retryAt = Date.now() + 90000;
        return;
      }
      localStorage.setItem(runKey,JSON.stringify({slot,error:'本次抓取失败，保留上次快照'}));
    }
  };
  try {
    if (navigator.locks) await navigator.locks.request('ptu-investment-refresh',{ifAvailable:!retry},run);
    else await run(true);
  } catch {
    retryAt = Date.now() + 90000;
  } finally {
    busy = false;
    render();
  }
}

host.addEventListener('change', event=>{
  const input = event.target;
  if (input.id==='audit-person') state.person=input.value;
  else if (input.id==='audit-direction') state.direction=input.value;
  else if (input.id==='audit-days') state.days=Number(input.value);
  else if (input.id==='audit-held') state.held=input.checked;
  else if (input.dataset.follow) save('public-follow',[...host.querySelectorAll('[data-follow]:checked')].map(item=>item.dataset.follow));
  else return;
  state.limit=pageSize;
  render();
});
get('#audit-symbol').addEventListener('input',event=>{
  state.symbol=event.target.value.trim().toUpperCase();
  state.limit=pageSize;
  render();
});
host.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button) return;
  if (button.dataset.kind) {
    state.kind=button.dataset.kind;
    state.person='all';
    state.limit=pageSize;
    for (const tab of host.querySelectorAll('[data-kind]')) tab.setAttribute('aria-pressed',String(tab===button));
  } else if (button.dataset.watch) {
    const symbol=button.dataset.watch;
    watchSymbols([{symbol}]);
    toast(`${symbol} 已加入自选`);
  } else if (button.dataset.open) {
    dispatchEvent(new CustomEvent('investment-select',{detail:{symbol:button.dataset.open,tab:'market'}}));
    return;
  } else if (button.id==='audit-more') state.limit+=pageSize;
  else if (button.id==='refresh-disclosures') { refreshDisclosures(true); return; }
  else return;
  render();
});
addEventListener('investment-select',event=>{
  if (event.detail.tab !== 'audit') return;
  state.symbol=event.detail.symbol;
  get('#audit-symbol').value=state.symbol;
  render();
});
addEventListener('workspace-activate',event=>{
  if (event.detail.tab==='audit') openAudit();
  refreshDisclosures();
});
addEventListener('decision-change',event=>{
  if (['holdings','watchlist'].includes(event.detail.key)) render();
});
addEventListener('storage',event=>{
  if (event.key===cacheKey) {
    const snapshot=normalizeDisclosures(raw(cacheKey,null));
    if (snapshot && (!data || Date.parse(snapshot.generatedAt)>=Date.parse(data.generatedAt))) data=snapshot;
  }
  if ([cacheKey,runKey,'ptu.decision.holdings','stock_alert_watchlist_v1'].includes(event.key)) render();
});
addEventListener('pt-sync-applied',render);
addEventListener('nexus-activate',()=>refreshDisclosures());
document.addEventListener('visibilitychange',()=>refreshDisclosures());
setInterval(()=>refreshDisclosures(),30000);
if (!panel.hidden) openAudit();
refreshDisclosures();
