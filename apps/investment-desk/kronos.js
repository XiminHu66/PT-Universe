import {esc, raw, read as records} from '../_decision/core.js';
import {marketSessions, showDate, showWindow} from './sessions.mjs';
import {API} from '../_shared/on-demand.mjs';
import {DEFAULT_WATCHLIST} from './refresh.mjs';

const symbolPattern = /^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/;
const cryptoPattern = /^[A-Z0-9]+-(USD|EUR|GBP|CAD|JPY|AUD|BTC|ETH|USDT|USDC)$/;
const pendingStates = new Set(['queued', 'running']);
const submitted = new Map();
const status = document.querySelector('#kronosStatus');
const result = document.querySelector('#kronosResult');
const run = document.querySelector('#kronosRun');
const panel = document.querySelector('#panel-market');
const position = document.querySelector('#positionDecision');
const percent = new Intl.NumberFormat('zh-CN', {style:'percent', signDisplay:'exceptZero', maximumFractionDigits:1});
const cached = new Map();
const inflight = new Map();
let symbol = new URLSearchParams(location.search).get('symbol') || 'NVDA';
let timer;
const title = document.querySelector('#kronos-title');
let submitting = false;
let recheck = false;

function formatPrice(value, currency = 'USD') {
  if (currency === 'GBp' || currency === 'GBX') return `${value.toLocaleString('en-GB')}p`;
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {style:'currency', currency:code}).format(value);
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function valid(data, ticker){
  return data?.symbol === ticker && validDate(data.asOf)
    && Array.isArray(data.dates) && data.dates.length === 10 && data.dates.every(validDate)
    && [data.reference,data.endMedian,data.endLow,data.endHigh].every(price => Number.isFinite(price) && price > 0)
    && data.endLow <= data.endMedian && data.endMedian <= data.endHigh
    && data.dates.every((date, i) => date > (i ? data.dates[i - 1] : data.asOf))
    && Array.isArray(data.paths) && data.paths.length === 4
    && data.paths.every(path => Array.isArray(path) && path.length === 10 && path.every(price => Number.isFinite(price) && price > 0))
    && [data.up,data.down].every(count => Number.isInteger(count) && count >= 0)
    && data.up + data.down <= data.paths.length;
}

function chart(data) {
  const paths = data.paths.map(path => [data.reference, ...path]);
  const low = Math.min(...paths.flat()), high = Math.max(...paths.flat());
  const x = index => 6 + index * 48;
  const y = value => 91 - ((value - low) / Math.max(0.01, high - low)) * 82;
  const lines = paths.map((path,i) => `<polyline points="${path.map((price,j)=>x(j)+','+y(price).toFixed(1)).join(' ')}" stroke="var(--blue)" stroke-opacity="${.38+i*.15}"/>`).join('');
  return `<svg viewBox="0 0 492 100" preserveAspectRatio="none" role="img" aria-label="四条模拟收盘路径，横轴为未来十个${data.calendar === '24/7' ? '自然日' : '交易日'}">
    <g fill="none" stroke-width="1.4"><line x1="6" x2="486" y1="${y(data.reference)}" y2="${y(data.reference)}" stroke="var(--muted)" stroke-dasharray="4 4"/>${lines}</g>
  </svg>`;
}

function planContext() {
  const plan = JSON.parse(position.dataset.plan || '{}');
  return plan.symbol === symbol ? plan : {};
}

function zoneSamples(data, range, window) {
  const dates = new Set();
  let paths = 0;
  for (const path of data.paths) {
    const hits = data.dates.filter((date, i) => date >= window.start && date <= window.end && path[i] >= range[0] && path[i] <= range[1]);
    if (hits.length) paths++;
    for (const date of hits) dates.add(date);
  }
  return {paths, dates:[...dates].sort()};
}

function planDifference(data, plan) {
  if (!plan.window) return '';
  if (data.up >= 3 && ['sell', 'trim'].includes(plan.rule)) return '模拟偏涨，操作计划仍提示复查持仓。';
  if (data.down >= 3 && ['buy', 'candidate'].includes(plan.rule)) return '模拟偏跌。到买入区后，先复查支撑和财报。';
  return '';
}

function zoneNotes(data, plan) {
  if (!plan.window) return '';
  const notes = [['买入观察区', plan.buy], ['反弹观察区', plan.sell]].map(([label, range]) => {
    const {paths, dates} = zoneSamples(data, range, plan.window);
    const days = paths ? ` · ${dates.length === 1 ? showDate(dates[0]) : `${showWindow(dates[0], dates.at(-1))} 中的 ${dates.length} 个交易日`}` : '';
    return `<li>${label} <strong>${paths}/4 条路径</strong>${days}</li>`;
  });
  return `<p>操作计划期间，模拟收盘价落入观察区的样本</p><ul class="kronos-zone-list">${notes.join('')}</ul><p>这些日期来自模拟收盘价，实际操作以当日行情触发为准。</p>`;
}

function paint() {
  const previous = cached.get(symbol);
  const data = valid(previous?.data, symbol) ? previous.data : null;
  const eligible = symbolPattern.test(symbol);
  const working = pendingStates.has(previous?.state);
  const fresh = previous?.state === 'fresh' && data?.asOf === previous.session;
  const continuous = (previous?.calendar || data?.calendar) === '24/7' || cryptoPattern.test(symbol);
  title.textContent = continuous ? 'Kronos · 10 天' : 'Kronos · 10 个交易日';
  run.hidden = !eligible || fresh;
  run.disabled = working || inflight.has(symbol);
  run.textContent = previous?.state === 'running' ? '计算中' : previous?.state === 'queued' ? '排队中' : data ? '更新情景' : '生成情景';
  if (!eligible) {
    status.textContent = '该标的代码格式暂不支持。';
    result.replaceChildren();
    return;
  }
  status.textContent = previous?.state === 'running' ? '正在后台模拟 4 条路径，通常需要几分钟。'
    : previous?.state === 'queued' ? (previous.error || `VPS 队列第 ${previous.queuePosition || 1} 位，轮到后自动计算。`)
    : previous?.error || (data ? '' : '等待加入推理队列');
  if (!data) {
    result.replaceChildren();
    return;
  }
  const plan = continuous ? {} : planContext();
  const price = value => formatPrice(value, data.currency);
  const direction = data.up >= 3 ? `${data.up}/4 条路径到期上涨` : data.down >= 3 ? `${data.down}/4 条路径到期下跌` : '四条路径方向不一致';
  const difference = fresh ? planDifference(data, plan) : '';
  const wasOpen = result.querySelector('details')?.open;
  result.innerHTML = `<div class="kronos-summary">
    <strong>${fresh ? direction : '旧情景 · 等待更新'}</strong>
    <span>${showDate(data.dates.at(-1))}收盘情景</span>
  </div>
  <dl class="kronos-metrics">
    <div><dt>模拟收盘中位价</dt><dd>${price(data.endMedian)} <small>${percent.format(data.endMedian / data.reference - 1)}</small></dd></div>
    <div><dt>模拟收盘范围</dt><dd>${price(data.endLow)}–${price(data.endHigh)}</dd></div>
  </dl>
  ${difference ? `<p class="kronos-next">${difference}</p>` : ''}
  <details ${wasOpen ? 'open' : ''}><summary>查看模拟路径</summary>
    ${chart(data)}
    ${Number.isInteger(data.lookback) && data.lookback < 250 ? `<p>使用 ${data.lookback} 根已完成日线。</p>` : ''}
    <div class="chart-dates"><span>${esc(data.asOf)} 收盘起点 ${price(data.reference)}</span><span>${esc(data.dates.at(-1))} 收盘</span></div>
    <p>每条线是一种模拟走势，虚线是起始收盘价。上涨 ${data.up} 条，下跌 ${data.down} 条，持平 ${data.paths.length - data.up - data.down} 条。路径数反映这次采样的一致程度，四条样本不足以估算实际上涨概率。</p>
    ${fresh ? zoneNotes(data, plan) : ''}
  </details>`;
}

function visibleWorkspace() {
  return !document.hidden && globalThis.ptNexusActive !== false;
}

function active() {
  return visibleWorkspace() && !panel.hidden;
}

function schedule() {
  clearTimeout(timer);
  if (active() && pendingStates.has(cached.get(symbol)?.state)) {
    timer = setTimeout(() => read(symbol), 15000);
  }
}

async function read(ticker, method = 'GET') {
  if (!symbolPattern.test(ticker)) return null;
  const pending = inflight.get(ticker);
  if (pending) {
    if (method === 'POST' && pending.method === 'GET') {
      await pending.task;
      return read(ticker, method);
    }
    return pending.task;
  }
  const last = cached.get(ticker);
  if (method === 'GET' && last && !pendingStates.has(last.state) && Date.now() - last.checkedAt < 30000) return last;
  const task = (async () => {
    try {
      const response = await fetch(API + '/api/kronos?symbol=' + encodeURIComponent(ticker), {
        method, cache:'no-store', signal:AbortSignal.timeout(20000)
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error || '预测服务暂不可用');
      if (payload.data && !valid(payload.data, ticker)) throw Error('收到无效模型快照');
      cached.set(ticker, {...payload, checkedAt:Date.now()});
      return payload;
    } catch (error) {
      cached.set(ticker, {state:'unavailable', data:last?.data, error:error.message, checkedAt:Date.now()});
      return null;
    } finally {
      inflight.delete(ticker);
      if (ticker === symbol) { paint(); schedule(); }
    }
  })();
  inflight.set(ticker, {method,task});
  if (ticker === symbol) paint();
  return task;
}

function universe() {
  const watch = raw('stock_alert_watchlist_v1');
  const holdings = records('holdings');
  const items = [symbol, ...holdings.map(item => item.symbol), ...(watch.length ? watch : DEFAULT_WATCHLIST).map(item => item.symbol)];
  return [...new Set(items.filter(item => typeof item === 'string').map(item => item.trim().toUpperCase()))]
    .filter(item => symbolPattern.test(item));
}

function submissionPeriod(ticker) {
  const now = Date.now() - 20 * 60000;
  const utcDay = new Date(now).toISOString().slice(0, 10);
  if (cryptoPattern.test(ticker)) return utcDay;
  return marketSessions(now)?.completed || utcDay;
}

async function enqueueUniverse() {
  if (!visibleWorkspace()) return;
  if (submitting) { recheck = true; return; }
  submitting = true;
  try {
    const pending = universe().filter(ticker => submitted.get(ticker) !== submissionPeriod(ticker));
    const submit = async ticker => {
      const period = submissionPeriod(ticker);
      const response = await read(ticker,'POST');
      if (response) submitted.set(ticker, period);
    };
    if (pending[0] === symbol) await submit(pending.shift());
    // Only enqueue requests overlap. The VPS owns the queue and serializes inference.
    await Promise.all(Array.from({length:Math.min(3,pending.length)}, async () => {
      while (pending.length && visibleWorkspace()) await submit(pending.shift());
    }));
  } finally {
    submitting = false;
    if (recheck) {
      recheck = false;
      queueMicrotask(enqueueUniverse);
    }
  }
}

function select(ticker) {
  if (typeof ticker !== 'string') return;
  symbol = ticker.trim().toUpperCase();
  paint();
  schedule();
  if (active() && submitted.get(symbol) === submissionPeriod(symbol)) read(symbol);
  enqueueUniverse();
}

run.addEventListener('click', () => read(symbol,'POST'));
addEventListener('workspace-activate', event => {
  if (event.detail.tab === 'market') select(event.detail.symbol);
  else { clearTimeout(timer); enqueueUniverse(); }
});
addEventListener('workspace-select-symbol', event => select(event.detail.symbol));
addEventListener('workspace-symbol-changed', event => select(event.detail.symbol));
addEventListener('decision-change', event => {
  if (['holdings','watchlist'].includes(event.detail.key)) enqueueUniverse();
});
addEventListener('investment-watchlist-changed', enqueueUniverse);
addEventListener('workspace-records', enqueueUniverse);
addEventListener('pt-sync-applied', enqueueUniverse);
addEventListener('storage', event => {
  if (['ptu.decision.holdings','stock_alert_watchlist_v1'].includes(event.key)) enqueueUniverse();
});
addEventListener('nexus-activate', () => select(symbol));
document.addEventListener('visibilitychange', () => select(symbol));
setInterval(enqueueUniverse, 60000);
new MutationObserver(() => { if (active() && cached.has(symbol)) paint(); })
  .observe(position, {attributes:true, attributeFilter:['data-plan']});
select(symbol);
