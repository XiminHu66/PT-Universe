import {API, refreshData} from '../_shared/on-demand.mjs';
import {portfolioDecision} from '../_decision/portfolio.mjs';
import {marketSessions, reviewWindow, showWindow} from '../investment-desk/sessions.mjs';
import {priceLocation, priceZones} from '../investment-desk/price-zones.mjs';
import {DEFAULT_WATCHLIST, mergeMarketItem} from '../investment-desk/refresh.mjs';

const KEYS = {
  watchlist: "stock_alert_watchlist_v1",
  ranges: "stock_alert_ranges_v1",
  selected: "stock_alert_selected_v1",
  theme: "stock_alert_theme_v1",
  notifications: "stock_alert_notifications_v1"
};
const integrated = document.body.dataset.workspace === 'investment';
const marketPanel = document.getElementById('panel-market');
const $ = id => document.getElementById(id);
const state = {
  watchlist: readStorage(KEYS.watchlist, DEFAULT_WATCHLIST),
  list: readStorage('ptu.decision.holdings', []).length ? 'holdings' : 'watch',
  companies: [],
  evidenceErrors: {},
  evidenceBusy: false,
  ranges: readStorage(KEYS.ranges, {}),
  selected: new URLSearchParams(location.search).get("symbol")?.toUpperCase() || localStorage.getItem(KEYS.selected) || "NVDA",
  data: { generatedAt: null, symbols: readStorage('stock-demand-data', {}) },
  period: "1Y",
  analysis: null,
  dismissedAlert: false,
  optionExpiryBySymbol: {},
  optionSideBySymbol: {},
  rangeDrafts: {},
  directQuoteAt: null,
  directQuoteSymbol: null,
  directQuoteDisabled: false
};

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
function writeStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function finite(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function fmt(value, digits = 2) { const number = finite(value); return number === null ? "—" : number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function fmtCompact(value) { const number = finite(value); if (number === null) return "—"; return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number); }
function pct(value, digits = 2) { const number = finite(value); return number === null ? "—" : `${number >= 0 ? "+" : ""}${number.toFixed(digits)}%`; }
function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function displayFor(symbol) { return state.watchlist.find(item => item.symbol === symbol)?.display || symbol.replace("-USD", "USD").replace("^GSPC", "SPX"); }
function dataFor(symbol = state.selected) { return state.data.symbols?.[symbol] || null; }
function currencyMark(item) { return item?.currency === "USD" || !item?.currency ? "$" : `${item.currency} `; }

function toast(message) {
  const node = $("toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

async function fetchJson(url, timeout = 12000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function fetchFreshest(sources, label) {
  const results = await Promise.allSettled(sources.map(source => fetchJson(source)));
  const candidates = results.flatMap((result, index) => {
    if (result.status === "fulfilled" && result.value?.symbols) return [result.value];
    if (result.status === "rejected") console.warn(`${label} data source failed`, sources[index], result.reason);
    return [];
  });
  return candidates.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0))[0] || null;
}

async function loadMarketData(showFeedback = false) {
  $("refreshButton").classList.add("loading");
  const stamp = Date.now();
  // Pages-hosted files are deployed on every data commit and avoid the longer
  // raw.githubusercontent.com CDN cache. Raw GitHub remains the fallback.
  const sources = [new URL(`data/market.json?t=${stamp}`, import.meta.url)];
  const quoteSources = [new URL(`data/quotes.json?t=${stamp}`, import.meta.url)];
  const [loaded, quotes] = await Promise.all([
    fetchFreshest(sources, "Market"),
    fetchFreshest(quoteSources, "Quote")
  ]);
  if (loaded?.symbols) {
    const directItem = state.directQuoteSymbol ? dataFor(state.directQuoteSymbol) : null;
    const directCarry = directItem ? { symbol: state.directQuoteSymbol, at: state.directQuoteAt, price: directItem.price, previousClose: directItem.previousClose, change: directItem.change, changePct: directItem.changePct, lastTradeAt: directItem.lastTradeAt, liveSource: directItem.liveSource } : null;
    const previous = state.data.symbols;
    state.data = loaded;
    for(const [symbol,item] of Object.entries(readStorage('stock-demand-data',{})))
      if(!state.data.symbols[symbol]||Date.parse(item.fetchedAt||'')>Date.parse(state.data.symbols[symbol].fetchedAt||state.data.generatedAt||''))state.data.symbols[symbol]=item;
    if (quotes?.symbols) {
      Object.entries(quotes.symbols).forEach(([symbol, quote]) => {
        if (state.data.symbols[symbol]&&Date.parse(quote.lastTradeAt||'')>=Date.parse(state.data.symbols[symbol].lastTradeAt||'')) Object.assign(state.data.symbols[symbol], quote);
      });
      state.data.quoteGeneratedAt = quotes.generatedAt;
    }
    // A delayed static snapshot must not erase custom holdings or newer API quotes.
    for (const [symbol, quote] of Object.entries(previous)) {
      const current = state.data.symbols[symbol];
      if (!current || Date.parse(quote.lastTradeAt) >= Date.parse(current.lastTradeAt || 0))
        state.data.symbols[symbol] = {...current, ...quote};
    }
    if (directCarry && new Date(directCarry.at).getTime() > new Date(state.data.quoteGeneratedAt || 0).getTime() && state.data.symbols[directCarry.symbol]) {
      Object.assign(state.data.symbols[directCarry.symbol], directCarry);
    }
    if (showFeedback) toast("已读取最新发布快照，模型已重新推演");
  } else if (showFeedback) toast("暂时无法更新，保留已有数据");
  $("refreshButton").classList.remove("loading");
  updateMarketStatus(); renderAll();
  if (!integrated && !dataFor()) await fetchCustomSymbol(state.selected, showFeedback);
  return Boolean(loaded?.symbols);
}

const stockJobs=new Map(), companyJobs=new Map(), companyChecks=new Map();
let stockStatus='', loadedMarket=null, announcedSymbol=null;
async function refreshStock(symbol=state.selected,force=false,feedback=false){
 if(stockJobs.has(symbol))return stockJobs.get(symbol);
 const task=(async()=>{
  if(symbol===state.selected){stockStatus=integrated ? '刷新中…' : '正在按需更新 '+symbol+'…';updateMarketStatus();}
  try{
   const result=await refreshData('stock',{symbol,force});const item=result.data;
   if(item.symbol!==symbol||!item.history?.length||item.price==null)throw Error('行情数据无效');
   const updated = mergeMarketItem(dataFor(symbol), item);
   state.data.symbols[symbol]=updated;
   if(integrated)dispatchEvent(new CustomEvent('investment-market-item',{detail:{symbol,item:updated}}));
   const cached=readStorage('stock-demand-data',{});cached[symbol]=item;try{writeStorage('stock-demand-data',cached)}catch{}
   if(symbol===state.selected)stockStatus=integrated ? '' : '按需更新 '+ageText(item.fetchedAt);
   if(feedback)toast(symbol+' 行情、新闻与期权已核对；来源可能延迟');
   return true;
  }catch(e){if(symbol===state.selected)stockStatus=e.message+' · 保留旧数据';if(feedback)toast(e.message);return false;}
  finally{stockJobs.delete(symbol);if(symbol===state.selected){updateMarketStatus();renderAll();}}
 })();stockJobs.set(symbol,task);return task;
}
function refreshCompany(symbol) {
  if(!integrated||companyJobs.has(symbol)||Date.now()-(companyChecks.get(symbol)||0)<300000)return;
  const task=(async()=>{
    try{
      const response=await fetch(API+'/api/investment/company?symbol='+encodeURIComponent(symbol),{signal:AbortSignal.timeout(18000)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'财报暂不可用');
      companyChecks.set(symbol,Date.now());
      if(result.company)state.companies=[...state.companies.filter(c=>c.ticker!==symbol),result.company];
      delete state.evidenceErrors[symbol];
    }catch(error){state.evidenceErrors[symbol]=error.message}
    finally{companyJobs.delete(symbol);if(symbol===state.selected)renderSelected()}
  })();
  companyJobs.set(symbol,task);
}
function openMarket() {
  if(!loadedMarket)loadedMarket=loadMarketData(false);
  const symbol=state.selected;
  loadedMarket.then(()=>{
    if(symbol!==state.selected||marketPanel.hidden)return;
    if (Date.now() - Date.parse(dataFor(symbol)?.fetchedAt) >= 300000 || !dataFor(symbol)?.fetchedAt) refreshStock(symbol);
    refreshCompany(symbol);
  });
}
function selectMarketSymbol(symbol, announce=true) {
  if(!/^[A-Z0-9.^-]{1,20}$/.test(symbol))return;
  if(state.list==='holdings'&&!holdings().some(h=>h.symbol===symbol))state.list='watch';
  state.selected=symbol;
  state.dismissedAlert=false;
  stockStatus="";
  localStorage.setItem(KEYS.selected,symbol);
  if(!announce)announcedSymbol=symbol;
  renderAll();
  if(!integrated||!marketPanel.hidden){
    if(integrated)openMarket();
    else refreshStock(symbol);
  }
}
async function fetchCustomSymbol(symbol,feedback=true){return refreshStock(symbol,false,feedback);}
async function fetchLiveSelectedQuote(force=false){return refreshStock(state.selected,force,force);}

function ageText(timestamp) {
  if (!timestamp) return "等待更新";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
  if(minutes>=1440)return `${Math.floor(minutes/1440)} 天前`;
  if(minutes>=60)return `${Math.floor(minutes/60)} 小时前`;
  return minutes < 2 ? "刚刚" : `${minutes} 分钟前`;
}

function updateMarketStatus() {
  const badge = $("marketBadge");
  const session = integrated ? marketSessions() : null;
  const marketState = session ? (session.open ? "open" : "closed") : state.data.marketState || inferMarketState();
  const open = marketState === "open"; badge.classList.toggle("open", open); badge.innerHTML = `<i></i> ${open ? "美股交易中" : "美股已休市"}`;
  const item = dataFor(); const direct = state.directQuoteSymbol === state.selected && state.directQuoteAt;
  const snapshotAt = item?.fetchedAt || state.data.quoteGeneratedAt || state.data.generatedAt;
  if (integrated) {
    const updated = $("updatedAt");
    const tradeAt = item?.lastTradeAt;
    updated.textContent = stockStatus || (tradeAt ? `报价 ${ageText(tradeAt)}` : '等待报价');
    updated.title = [tradeAt && `报价时间 ${new Date(tradeAt).toLocaleString()}`, snapshotAt && `数据快照 ${new Date(snapshotAt).toLocaleString()}`].filter(Boolean).join(' · ');
    return;
  }
  if (!snapshotAt && !direct) { $("updatedAt").textContent = "等待报价 · 模型随报价更新"; return; }
  const tradeAt = item?.lastTradeAt || snapshotAt;
  $("updatedAt").textContent = `报价 ${ageText(tradeAt)} · ${direct ? "浏览器直连" : `快照 ${ageText(snapshotAt)}`}`;
  $("updatedAt").title='仅打开、切换股票或手动刷新时更新；价格提醒仅在页面取数后判断';
  if(stockStatus)$("updatedAt").textContent+=' · '+stockStatus;
}
function inferMarketState() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value; const day = get("weekday"); const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return !["Sat","Sun"].includes(day) && minutes >= 570 && minutes < 960 ? "open" : "closed";
}

function renderAll() {
  if (!state.watchlist.length) state.watchlist = structuredClone(DEFAULT_WATCHLIST);
  if (!state.watchlist.some(item => item.symbol === state.selected) && !holdings().some(item => item.symbol === state.selected)) {if(/^[A-Z0-9.^-]{1,20}$/.test(state.selected))state.watchlist.push({symbol:state.selected,display:state.selected,name:state.selected});else state.selected=state.watchlist[0].symbol;}
  const entries = listEntries();
  if (state.list === 'holdings' && entries.length && !entries.some(h=>h.symbol===state.selected)) state.selected = entries[0].symbol;
  renderWatchlist(); renderSelected();
}

function alertState(symbol, item) {
  const price = finite(item?.price); const range = state.ranges[symbol]; if (price === null || !range) return null;
  if (finite(range.buyLow) !== null && finite(range.buyHigh) !== null && price >= range.buyLow && price <= range.buyHigh) return "buy";
  if (finite(range.sellLow) !== null && finite(range.sellHigh) !== null && price >= range.sellLow && price <= range.sellHigh) return "sell";
  return null;
}

function modelZoneState(item) {
  const price = finite(item?.price); const analysis = calculateAnalysis(item?.history || [], price);
  if (price === null || !analysis) return null;
  if (price >= analysis.buyLow && price <= analysis.buyHigh) return "buy";
  if (price >= analysis.sellLow && price <= analysis.sellHigh) return "sell";
  return null;
}

function holdings() { return readStorage('ptu.decision.holdings', []).filter(h=>h.quantity>0); }
function listEntries() { return state.list === 'holdings' ? holdings().map(h=>({...h,display:h.symbol,name:h.description||h.symbol})) : state.watchlist; }
function decisionFor(symbol) {
  const holding = holdings().find(h=>h.symbol===symbol) || {symbol,quantity:0};
  const company = state.companies.find(c=>c.ticker===symbol);
  return {holding, company, decision:portfolioDecision(holding,dataFor(symbol),company,readStorage('ptu.labs.theses',[]))};
}
function renderWatchlist() {
  const held = state.list === 'holdings';
  for (const button of document.querySelectorAll('[data-list]')) {
    const active = button.dataset.list === state.list;
    button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1;
    button.querySelector('span').textContent=button.dataset.list==='holdings'?holdings().length:state.watchlist.length;
  }
  $('watchlist').setAttribute('aria-labelledby',held?'holdingsTab':'watchTab');
  $('addSymbolForm').hidden=held; $('resetWatchlist').hidden=held;
  if ($('listSummary')) $('listSummary').textContent = held ? 'CSV 持仓' : '自选标的';
  $("watchlist").innerHTML = listEntries().map(item => {
    const market = dataFor(item.symbol);
    const price = finite(market?.price);
    const change = finite(market?.changePct);
    const alert = alertState(item.symbol, market);
    const modelZone = integrated ? null : modelZoneState(market);
    const d = decisionFor(item.symbol).decision;
    const prices = integrated && d.buy ? priceZones(d) : null;
    const location = prices && reviewWindow(market?.lastTradeAt) ? priceLocation(price, prices) : null;
    const zoneTag = {
      buy:['买入区间','buy',prices?.buy ? formatPriceRange(prices.buy) : ''],
      sell:['止盈区间','trim',prices?.sell ? formatPriceRange(prices.sell) : ''],
      aboveSell:['高于止盈区','trim',prices?.sell ? formatPriceRange(prices.sell) : ''],
      risk:['止损区间','sell',prices?.risk ? '低于 $'+fmt(prices.risk) : '']
    }[location];
    const active = item.symbol === state.selected;
    const zoneLabel = alert ? (alert === 'buy' ? '买入提醒' : '止盈提醒') : modelZone ? (modelZone === 'buy' ? '模型买' : '模型卖') : '';
    const zone = zoneLabel ? `<em class="zone-tag ${alert ? 'custom' : ''}">${zoneLabel}</em>` : '';
    return `<button class="watch-item ${active ? 'active' : ''} ${modelZone ? `model-${modelZone}` : ''} ${alert ? `alert-${alert}` : ''}" data-symbol="${escapeHtml(item.symbol)}" type="button" ${active ? 'aria-current="true"' : ''}>
      <span class="ticker-avatar">${escapeHtml(item.display.slice(0,4))}</span>
      <span class="ticker-id">
        <strong>${escapeHtml(item.display)}${integrated ? '' : zone}</strong>
        ${integrated ? zone : `<small>${held ? `${fmt(item.quantity, 6).replace(/\.?0+$/,'')} 股 · 成本 $${fmt(item.cost)}` : escapeHtml(item.name || item.symbol)}</small>`}
        ${!integrated ? `<em class="decision-tag ${d.state}">${escapeHtml(d.label)}</em>`
          : zoneTag && !alert ? `<em class="decision-tag price-zone-tag ${zoneTag[1]}" title="${escapeHtml(zoneTag[2])}">${zoneTag[0]}</em>` : ''}
      </span>
      <span class="ticker-quote"><strong>${price === null ? '—' : `${escapeHtml(currencyMark(market))}${fmt(price)}`}</strong>${change === null || price === null ? '' : `<small class="${change >= 0 ? 'positive' : 'negative'}">${pct(change)}</small>`}</span>
      ${held ? '' : `<span class="remove-symbol" data-remove="${escapeHtml(item.symbol)}" aria-label="移出观察">×</span>`}
    </button>`;
  }).join("") || '<p class="position-empty">尚未导入持仓。点击「导入 / 更新持仓 CSV」即可载入；观察列表仍可使用。</p>';
}

function safeSource(url, label) {
  try { const u=new URL(url); if(!['https:','http:'].includes(u.protocol))return ''; return `<a href="${escapeHtml(u.href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`; } catch { return ''; }
}
const formatPriceRange = values => `$${fmt(values[0])}–$${fmt(values[1])}`;
const priceZoneLabels = {
  buy:['当前在买入区间','buy'], sell:['当前在止盈区间','trim'],
  aboveSell:['当前高于止盈区间','trim'], risk:['当前在止损区间','sell'],
  belowBuy:['当前低于买入区间','wait'], outside:['当前未到买卖区间','wait']
};

function describePlan(d, holding, window, location) {
  if (!d.buy) return d.reasons[0] || '暂时无法给出价格区间。';
  if (!window) return '行情需要更新。下方是上次计算的区间。';
  if (location === 'risk') return holding.quantity > 0 ? '已触及止损区间。按你的止损计划处理。' : '暂停买入，等价格和趋势企稳。';
  if (location === 'buy') {
    if (d.state === 'buy') return '可考虑分批买入。';
    if (d.state === 'candidate') return '先核对财报，再考虑买入。';
    return '暂缓买入，先确认趋势和财报。';
  }
  if (location === 'sell' || location === 'aboveSell') return holding.quantity > 0 ? '持有时可考虑分批止盈。' : '等待价格回落。';
  if (d.state === 'sell') return '趋势或持有理由转弱，暂缓买入。';
  return location === 'belowBuy' ? '等价格企稳，再看买入条件。' : '价格到区间时再评估。';
}

function planRanges(prices, location) {
  const {buy, sell, risk} = prices;
  return `<div class="position-ranges plan-levels">
    <div class="plan-buy${location === 'buy' ? ' is-current' : ''}"><small>买入区间</small><strong>${buy ? formatPriceRange(buy) : '暂无'}</strong></div>
    <div class="plan-sell${location === 'sell' || location === 'aboveSell' ? ' is-current' : ''}"><small>止盈区间</small><strong>${sell ? formatPriceRange(sell) : '暂无'}</strong></div>
    <div class="plan-risk${location === 'risk' ? ' is-current' : ''}"><small>止损区间</small><strong>${risk ? '低于 $'+fmt(risk) : '暂无'}</strong></div>
  </div>`;
}

function renderPositionDecision() {
  const {holding:h,company:c,decision:d}=decisionFor(state.selected), q=dataFor();
  const pnl=h.quantity>0&&h.cost>0&&q?.currency==='USD'&&d.price>0?(d.price-h.cost)*h.quantity:null;
  const time=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'缺失';
  const shares = h.quantity > 0 ? `${fmt(h.quantity, 6).replace(/\.?0+$/, '')} 股` : '';
  const pnlPct = pnl === null ? '' : pct((d.price / h.cost - 1) * 100);
  const holdingDetails = shares ? `持仓 ${shares} · 均价 $${fmt(h.cost)}${pnl === null ? '' : ` · 浮盈亏 ${pnl >= 0 ? '+' : '−'}$${fmt(Math.abs(pnl))}`}` : '仅观察 · 未持有';
  const expanded=$('positionEvidence')?.open;
  const personal=state.ranges[state.selected];
  const personalSummary=integrated&&personal?['buy','sell'].flatMap(side=>{
    const lo=finite(personal[side+'Low']),hi=finite(personal[side+'High']);
    return lo!==null&&hi!==null?[(side==='buy'?'买入':'止盈')+' $'+fmt(lo)+'–$'+fmt(hi)]:[];
  }).join(' · '):'';
  const position = $('positionDecision');
  const window = integrated && d.buy ? reviewWindow(q?.lastTradeAt) : null;
  const prices = priceZones(d);
  const location = window ? priceLocation(d.price, prices) : null;
  const [zoneLabel, zoneTone] = priceZoneLabels[location] || [d.buy && !window ? '待刷新行情' : '暂无区间','unknown'];
  const context = JSON.stringify({symbol: state.selected, rule: window ? d.state : '', window, buy: d.buy, sell: d.sell});
  if (position.dataset.plan !== context) position.dataset.plan = context;
  position.dataset.rule = d.state;
  position.innerHTML=`
    ${integrated ? `<div class="plan-heading"><h2>价格区间</h2><strong class="decision-tag ${zoneTone}">${zoneLabel}</strong></div>` : ''}
    ${integrated && shares ? `<p class="position-holding">持仓 ${shares}${pnlPct ? ` <span>· 浮盈亏 <b class="${pnl >= 0 ? 'positive' : 'negative'}">${pnlPct}</b></span>` : ''}</p>` : ''}
    ${!integrated ? `<div class="position-heading"><strong class="decision-tag ${d.state}">${escapeHtml(d.label)}</strong><span>${holdingDetails}${pnlPct ? ` (${pnlPct})` : ''}</span></div>` : ''}
    <p class="decision-reasons">${escapeHtml(integrated ? describePlan(d, h, window, location) : d.reasons.join('；'))}</p>
    ${window ? `<p class="plan-window"><span>观察期</span><strong>${showWindow(window.start, window.end)}</strong></p>` : ''}
    ${integrated ? (d.buy ? planRanges(prices, location) : '') : d.buy ? `<div class="position-ranges"><div><small>买入 / 加仓参考</small><strong>$${fmt(d.buy[0])}–${fmt(d.buy[1])}</strong></div><div><small>减仓 / 止盈参考</small><strong>$${fmt(d.sell[0])}–${fmt(d.sell[1])}</strong></div><div><small>止损区间</small><strong>低于 $${fmt(d.invalidation)}</strong></div></div>` : ''}
    ${personalSummary?`<p class="personal-range-summary">个人提醒区间 · ${escapeHtml(personalSummary)}</p>`:''}
    ${state.evidenceErrors[state.selected]?`<p class="evidence-error">本次刷新：${escapeHtml(state.evidenceErrors[state.selected])}；保留带时间的已有证据。</p>`:''}
    <div class="position-footer">
      <details id="positionEvidence" ${expanded?'open':''}>
        <summary>查看价位依据${state.evidenceBusy?' · 刷新中':''}</summary>
        ${integrated && shares ? `<p>${holdingDetails}</p>` : ''}
        ${window ? '<p>观察期覆盖 5 个交易日。价格到区间时复查条件，期满重算。</p>' : ''}
        <ul>${[...d.reasons,...d.evidence].map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>
        <p>${safeSource(q?.sourceURL||'https://finance.yahoo.com/quote/'+encodeURIComponent(state.selected)+'/', '行情原始页面')} · 报价 ${escapeHtml(time(q?.lastTradeAt))} · 日线截至 ${escapeHtml(q?.history?.at(-1)?.d||'缺失')}</p>
        <p>${c?`${safeSource(c.sourceURL,'财报原始页面')} · 检查 ${escapeHtml(time(c.updatedAt))}`:'无可用公司财报；ETF 不套用公司财报规则。'}</p>
        <p>买入区参考历史支撑，止盈区间参考历史上涨遇阻的位置。区间宽度随近期波动变化。低于止损价位即进入止损区间。</p>
      </details>
      <div class="position-actions">${integrated ? '<button type="button" data-edit-range>调整个人区间</button>' : '<button type="button" data-investment-tab="thesis">财报与论点</button><button type="button" data-investment-tab="audit">核验名人信号</button>'}</div>
    </div>`;
}

function renderSelected() {
  if(announcedSymbol!==state.selected){
    announcedSymbol=state.selected;
    dispatchEvent(new CustomEvent('workspace-symbol-changed',{detail:{symbol:state.selected}}));
  }
  const item = dataFor(); const watch = state.watchlist.find(entry => entry.symbol === state.selected) || { display: state.selected, name: state.selected };
  $("quoteSymbol").textContent = watch.display; $("quoteName").textContent = item?.name || watch.name || "等待行情";
  $("quoteExchange").textContent = item?.exchange || "—";
  if (integrated) $("quoteExchange").hidden = !item?.exchange;
  $("quoteCurrency").textContent = currencyMark(item);
  $("quotePrice").textContent = fmt(item?.price);
  const change = finite(item?.change); const changePct = finite(item?.changePct); const changeNode = $("quoteChange");
  const signedChange = change === null ? '' : `${change >= 0 ? '+' : '−'}${currencyMark(item)}${fmt(Math.abs(change))}`;
  changeNode.textContent = integrated ? pct(changePct) : change === null ? '—' : `${change >= 0 ? '+' : ''}${fmt(change)}  ${pct(changePct)}`;
  changeNode.hidden = integrated && changePct === null;
  changeNode.title = integrated && signedChange ? `较前收 ${signedChange}` : '';
  changeNode.className = `quote-change ${(changePct ?? change) >= 0 ? 'positive' : 'negative'}`;
  $("optionsLink").href = `https://finance.yahoo.com/quote/${encodeURIComponent(state.selected)}/options/`;
  $("newsLink").href = `https://finance.yahoo.com/quote/${encodeURIComponent(state.selected)}/news/`;
  const analysis = calculateAnalysis(item?.history || [], item?.price); state.analysis = analysis;
  $("statPrev").textContent = fmt(item?.previousClose);
  $("stat52").textContent = analysis ? `${fmt(analysis.low52)} – ${fmt(analysis.high52)}` : "—";
  if (!integrated) {
    $("statVol").textContent = analysis ? `${fmt(analysis.annualVol,1)}%` : "—";
    $("statAtr").textContent = analysis ? fmt(analysis.atr) : "—";
  }
  renderPositionDecision();
  renderChart(item?.history || []); renderAnalysis(analysis, item?.history || [], item?.fundamentals); renderRangeForm(analysis); renderOptions(item?.options, item?.price); renderNews(item?.news || []); renderAlert(item);
}

function sma(values, period) { if (values.length < period) return null; return values.slice(-period).reduce((sum, value) => sum + value, 0) / period; }
function emaSeries(values, period) {
  if (!values.length) return []; const multiplier = 2 / (period + 1); const output = [values[0]];
  for (let index = 1; index < values.length; index++) output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  return output;
}
function standardDeviation(values) { if (!values.length) return null; const mean = values.reduce((sum,v) => sum + v,0) / values.length; return Math.sqrt(values.reduce((sum,v) => sum + (v-mean)**2,0) / values.length); }
function rsi(values, period = 14) {
  if (values.length <= period) return null; const diffs = values.slice(-period - 1).slice(1).map((value,index) => value - values.slice(-period - 1)[index]);
  const gains = diffs.reduce((sum,value) => sum + Math.max(0,value),0) / period; const losses = diffs.reduce((sum,value) => sum + Math.max(0,-value),0) / period;
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}
function atr(history, period = 14) {
  if (history.length <= period) return null; const sample = history.slice(-period - 1); const ranges = sample.slice(1).map((row,index) => Math.max(row.h-row.l, Math.abs(row.h-sample[index].c), Math.abs(row.l-sample[index].c)));
  return ranges.reduce((sum,value) => sum + value,0) / ranges.length;
}
function lastValid(values) { return [...values].reverse().find(value => Number.isFinite(value)) ?? null; }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a,b) => a-b); if (!sorted.length) return null; const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; }

function calculateAnalysis(history, livePrice) {
  const valid = history.filter(row => finite(row.c) !== null && finite(row.h) !== null && finite(row.l) !== null); if (valid.length < 20) return null;
  const closes = valid.map(row => Number(row.c)); const highs = valid.map(row => Number(row.h)); const lows = valid.map(row => Number(row.l)); const price = finite(livePrice) ?? closes.at(-1);
  const sma20 = sma(closes,20), sma50 = sma(closes,50), sma200 = sma(closes,200); const rsi14 = rsi(closes); const atr14 = atr(valid) || price*.025;
  const ema12 = emaSeries(closes,12), ema26 = emaSeries(closes,26); const macdSeries = closes.map((_,index) => index < 25 ? null : ema12[index]-ema26[index]);
  const macdValues = macdSeries.filter(Number.isFinite); const macd = lastValid(macdValues), macdSignal = lastValid(emaSeries(macdValues,9));
  const std20 = standardDeviation(closes.slice(-20)); const bbUpper = sma20 + 2*std20, bbLower = sma20 - 2*std20;
  const high20 = Math.max(...highs.slice(-20)), low20 = Math.min(...lows.slice(-20)); const high60 = Math.max(...highs.slice(-60)), low60 = Math.min(...lows.slice(-60));
  const high52 = Math.max(...highs.slice(-252)), low52 = Math.min(...lows.slice(-252));
  const returns = closes.slice(-252).slice(1).map((value,index) => Math.log(value / closes.slice(-252)[index])); const annualVol = standardDeviation(returns) * Math.sqrt(252) * 100;
  const supports = [sma20,sma50,sma200,bbLower,low20,low60].filter(value => Number.isFinite(value) && value <= price*1.04 && value >= price*.65);
  const resistances = [bbUpper,high20,high60,high52,price+2*atr14].filter(value => Number.isFinite(value) && value >= price*.96 && value <= price*1.45);
  let support = median(supports) ?? price-1.5*atr14; let resistance = median(resistances) ?? price+2*atr14;
  if (sma50 && price > sma50 && sma20 > sma50) support = Math.max(support, Math.min(sma20,price));
  // Zones are centered on historical support/resistance. Do not anchor their edge
  // to the live price, otherwise the price can never actually enter the zone.
  const buyLow = Math.max(price*.55, support-.75*atr14); const buyHigh = support+.45*atr14;
  const sellLow = resistance-.35*atr14; const sellHigh = resistance+.75*atr14;
  let trendScore = 0; if (sma20) trendScore += price > sma20 ? 1 : -1; if (sma50) trendScore += price > sma50 ? 1 : -1; if (sma200) trendScore += price > sma200 ? 1 : -1; if (sma20 && sma50) trendScore += sma20 > sma50 ? 1 : -1;
  let signal = "等待"; let tone = "neutral";
  if (price >= sellLow || rsi14 >= 72) { signal = "偏向止盈"; tone = "sell"; }
  else if (price >= buyLow && price <= buyHigh) { signal = rsi14 < 48 ? "进入买入区" : "接近支撑"; tone = "buy"; }
  else if (trendScore >= 3 && rsi14 < 68 && macd >= macdSignal) { signal = "趋势持有"; tone = "buy"; }
  else if (trendScore <= -2) { signal = "谨慎等待"; tone = "sell"; }
  else signal = "区间等待";
  const completeness = clamp(valid.length/252,0,1); const alignment = Math.abs(trendScore)/4; const confidence = Math.round(clamp(48+completeness*25+alignment*17-(annualVol>75?8:0),35,90));
  const summaryParts = [];
  if (trendScore >= 3) summaryParts.push("中短期均线结构偏多"); else if (trendScore <= -2) summaryParts.push("价格位于多条关键均线下方"); else summaryParts.push("趋势信号尚未形成一致方向");
  if (rsi14 > 70) summaryParts.push("RSI 已进入偏热区"); else if (rsi14 < 35) summaryParts.push("RSI 接近超卖区"); else summaryParts.push("RSI 处于中性区间");
  summaryParts.push(`模型以约 ${fmt(atr14)} 的 ATR 为区间缓冲`);
  return { price,sma20,sma50,sma200,rsi14,atr:atr14,macd,macdSignal,bbUpper,bbLower,high52,low52,annualVol,buyLow,buyHigh,sellLow,sellHigh,trendScore,signal,tone,confidence,summary:summaryParts.join("；")+"。" };
}

function walkForwardTest(history) {
  const valid = history.filter(row => finite(row.c) !== null && finite(row.h) !== null && finite(row.l) !== null);
  if (valid.length < 120) return null;
  const trades = [];
  for (let index = 80; index < valid.length - 20; index++) {
    const entry = Number(valid[index].c); const model = calculateAnalysis(valid.slice(0, index + 1), entry);
    if (!model || entry < model.buyLow || entry > model.buyHigh) continue;
    const future = valid.slice(index + 1, index + 21).map(row => Number(row.c));
    trades.push({ returnPct: (future.at(-1) / entry - 1) * 100, drawdownPct: (Math.min(...future) / entry - 1) * 100 });
    index += 9;
  }
  if (!trades.length) return { sample: 0 };
  const returns = trades.map(trade => trade.returnPct); const drawdowns = trades.map(trade => trade.drawdownPct);
  return {
    sample: trades.length,
    winRate: returns.filter(value => value > 0).length / trades.length * 100,
    averageReturn: returns.reduce((sum, value) => sum + value, 0) / trades.length,
    medianReturn: median(returns),
    worstDrawdown: Math.min(...drawdowns)
  };
}

function renderEvidence(history, fundamentals) {
  const test = walkForwardTest(history);
  if (!test || !test.sample) {
    $("backtestMetrics").innerHTML = `<div class="empty-state">${test ? "历史区间信号不足" : "至少需要约 120 个交易日"}</div>`;
    $("backtestNote").textContent = "当前样本不足以形成可靠统计；不会用指标一致度冒充历史胜率。";
  } else {
    const metrics = [
      ["样本", test.sample, "10日去重信号"], ["20日胜率", `${fmt(test.winRate, 0)}%`, "收益大于 0"],
      ["平均收益", pct(test.averageReturn, 1), `中位数 ${pct(test.medianReturn, 1)}`], ["最差回撤", pct(test.worstDrawdown, 1), "入场后 20 日内"]
    ];
    $("backtestMetrics").innerHTML = metrics.map(([name, value, note]) => `<div><span>${name}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
    $("backtestNote").textContent = `滚动检验共 ${test.sample} 次信号；非独立样本，不含交易成本、滑点、分红和税费。`;
  }
  if (!fundamentals) {
    $("fundamentalMetrics").innerHTML = `<div class="empty-state">该标的暂无估值快照</div>`;
    return;
  }
  const growth = value => finite(value) === null ? "—" : pct(Number(value) * 100, 1);
  const values = [
    ["过去 PE", fmt(fundamentals.trailingPE, 1)], ["预期 PE", fmt(fundamentals.forwardPE, 1)],
    ["市净率", fmt(fundamentals.priceToBook, 1)], ["PEG", fmt(fundamentals.pegRatio, 1)],
    ["盈利增长", growth(fundamentals.earningsGrowth)], ["营收增长", growth(fundamentals.revenueGrowth)]
  ];
  $("fundamentalMetrics").innerHTML = values.map(([name, value]) => `<div><span>${name}</span><strong>${value}</strong></div>`).join("");
}

function renderAnalysis(analysis, history = [], fundamentals = null) {
  if (!analysis) {
    $("modelBuyBox").classList.remove("active-zone"); $("modelSellBox").classList.remove("active-zone");
    $("signalText").textContent = "数据不足"; $("confidenceBar").style.width = "0"; $("confidenceText").textContent = "至少需要 20 个交易日";
    $("buyRange").textContent = $("sellRange").textContent = "—"; $("indicatorGrid").innerHTML = `<div class="empty-state">等待历史数据</div>`; $("analysisSummary").textContent = "当前标的尚无足够历史数据。"; renderEvidence(history, fundamentals); return;
  }
  $("signalText").textContent = analysis.signal; $("signalText").className = analysis.tone === "buy" ? "positive" : analysis.tone === "sell" ? "negative" : "";
  $("confidenceBar").style.width = `${analysis.confidence}%`; $("confidenceText").textContent = `指标一致度 ${analysis.confidence}%`;
  $("buyRange").textContent = `$${fmt(analysis.buyLow)} – ${fmt(analysis.buyHigh)}`; $("sellRange").textContent = `$${fmt(analysis.sellLow)} – ${fmt(analysis.sellHigh)}`;
  $("modelBuyBox").classList.toggle("active-zone", analysis.price >= analysis.buyLow && analysis.price <= analysis.buyHigh);
  $("modelSellBox").classList.toggle("active-zone", analysis.price >= analysis.sellLow && analysis.price <= analysis.sellHigh);
  const inBuyZone = analysis.price >= analysis.buyLow && analysis.price <= analysis.buyHigh; const inSellZone = analysis.price >= analysis.sellLow && analysis.price <= analysis.sellHigh;
  $("buyDistance").textContent = inBuyZone ? "当前已进入模型区间" : `距区间上沿 ${pct((analysis.buyHigh/analysis.price-1)*100,1)}`;
  $("sellDistance").textContent = inSellZone ? "当前已进入模型区间" : `距区间下沿 ${pct((analysis.sellLow/analysis.price-1)*100,1)}`;
  const indicators = [
    ["SMA 20",fmt(analysis.sma20),analysis.price>analysis.sma20?"价格在上":"价格在下"], ["SMA 50",fmt(analysis.sma50),analysis.price>analysis.sma50?"价格在上":"价格在下"],
    ["SMA 200",fmt(analysis.sma200),analysis.sma200?analysis.price>analysis.sma200?"长期偏多":"长期偏弱":"样本不足"], ["RSI 14",fmt(analysis.rsi14,1),analysis.rsi14>70?"偏热":analysis.rsi14<35?"偏冷":"中性"],
    ["MACD",fmt(analysis.macd,2),analysis.macd>analysis.macdSignal?"动量向上":"动量向下"], ["布林带",`${fmt(analysis.bbLower)} / ${fmt(analysis.bbUpper)}`,"下轨 / 上轨"]
  ];
  if (integrated) indicators.push(
    ['年化波动率', `${fmt(analysis.annualVol, 1)}%`, '基于近一年日线'],
    ['ATR 14', fmt(analysis.atr), '14 日平均真实波幅']
  );
  $("indicatorGrid").innerHTML = indicators.map(([name,value,note]) => `<div class="indicator"><span>${name}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
  $("analysisSummary").textContent = analysis.summary;
  renderEvidence(history, fundamentals);
}

function renderChart(history) {
  const periods = { "1M":22, "3M":66, "6M":132, "1Y":260 };
  const valid = history.filter(row => finite(row.c) !== null);
  const start = Math.max(0, valid.length - (periods[state.period] || 260));
  const rows = valid.slice(start);
  const dates = $("chartDates");
  if (dates) {
    dates.replaceChildren(...(rows.length < 2 ? [] : [rows[0], rows.at(-1)].map(row => {
      const label = document.createElement('span');
      label.textContent = row.d;
      return label;
    })));
  }
  if (rows.length < 2) { $("chart").innerHTML = `<div class="chart-empty">暂无可绘制的历史数据</div>`; return; }
  const width = 900, height = 230, top = 12, bottom = 24; const closes = rows.map(row => Number(row.c));
  const sma50Values = rows.map((_, index) => {
    const end = start + index + 1;
    return end < 50 ? null : valid.slice(end - 50, end).reduce((sum, row) => sum + Number(row.c), 0) / 50;
  });
  const values = closes.concat(sma50Values.filter(Number.isFinite)); let min = Math.min(...values), max = Math.max(...values); const pad = Math.max((max-min)*.1, max*.005); min -= pad; max += pad;
  const x = index => index/(rows.length-1)*width; const y = value => top+(max-value)/(max-min)*(height-top-bottom);
  const linePath = valuesArray => valuesArray.map((value,index) => Number.isFinite(value) ? `${index && Number.isFinite(valuesArray[index-1])?"L":"M"}${x(index).toFixed(1)},${y(value).toFixed(1)}` : "").join(" ");
  const pricePath = linePath(closes); const areaPath = `${pricePath} L${width},${height-bottom} L0,${height-bottom} Z`; const smaPath = linePath(sma50Values);
  const levels = [0,.25,.5,.75,1].map(ratio => ({ y:top+ratio*(height-top-bottom), price:max-ratio*(max-min) }));
  const gridLines = levels.map(level => `<line x1="0" y1="${level.y}" x2="${width}" y2="${level.y}"/>`).join("");
  const gridLabels = levels.map(level => integrated
    ? `<span style="top:${level.y / height * 100}%">${fmt(level.price)}</span>`
    : `<text x="${width-4}" y="${level.y-4}">${fmt(level.price)}</text>`).join("");
  const id = `g${state.selected.replace(/\W/g,"")}`;
  $("chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><g stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke">${gridLines}</g>${integrated ? '' : `<g fill="var(--muted)" font-size="8" text-anchor="end">${gridLabels}</g>`}<path d="${areaPath}" fill="url(#${id})"/><path d="${smaPath}" fill="none" stroke="var(--blue)" stroke-opacity=".65" stroke-width="1.4" vector-effect="non-scaling-stroke"/><path d="${pricePath}" fill="none" stroke="var(--accent)" stroke-width="2.2" vector-effect="non-scaling-stroke"/><circle cx="${x(rows.length-1)}" cy="${y(closes.at(-1))}" r="3.5" fill="var(--accent)" vector-effect="non-scaling-stroke"/></svg>${integrated ? `<div class="chart-values" aria-hidden="true">${gridLabels}</div>` : ''}`;
}

function renderRangeForm(analysis) {
  const range = state.ranges[state.selected], draft=state.rangeDrafts[state.selected];
  for(const id of ['buyLow','buyHigh','sellLow','sellHigh']){
    const value=range?.[id];
    const text=draft?.[id]??(finite(value)===null?'':Number(value).toFixed(2));
    if($(id+'Input').value!==text)$(id+'Input').value=text;
  }
  const status = $("rangeStatus"); status.textContent = range ? "已保存" : "未设置"; status.classList.toggle("saved",Boolean(range));
  $("useModelRanges").disabled = integrated ? !decisionFor(state.selected).decision.buy || !reviewWindow(dataFor()?.lastTradeAt) : !analysis;
}

function optionTrendSvg(points) {
  const values = points.map(point => finite(point.putCallVolume)).filter(value => value !== null);
  if (!values.length) return "";
  const width = 320, height = 62, pad = 6; let low = Math.min(...values, .5), high = Math.max(...values, 1.5); if (high === low) high += .1;
  const x = index => values.length === 1 ? width / 2 : pad + index / (values.length - 1) * (width - pad * 2);
  const y = value => pad + (high - value) / (high - low) * (height - pad * 2);
  const path = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const neutralY = y(1);
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${neutralY}" x2="${width}" y2="${neutralY}"/><path d="${path}"/><circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="3"/></svg>`;
}

function optionSnapshots(options) {
  if (!options) return [];
  const snapshots = Array.isArray(options.expirations) ? options.expirations.filter(item => item?.expiration) : [];
  return snapshots.length ? snapshots : options.expiration ? [options] : [];
}

function selectedOptionSnapshot(options, symbol = state.selected) {
  const snapshots = optionSnapshots(options);
  if (!snapshots.length) return null;
  const requested = state.optionExpiryBySymbol[symbol] || options.defaultExpiration;
  return snapshots.find(item => item.expiration === requested) || snapshots[0];
}

function renderOptions(options, spotPrice) {
  if (!options || options.error) { $("optionsBody").innerHTML = `<div class="empty-state">${options?.error ? "该标的暂无期权快照" : "等待自动抓取期权快照"}</div>`; return; }
  const snapshots = optionSnapshots(options); const view = selectedOptionSnapshot(options);
  if (!view) { $("optionsBody").innerHTML = `<div class="empty-state">等待自动抓取期权快照</div>`; return; }
  state.optionExpiryBySymbol[state.selected] = view.expiration;
  const expiryTime = Math.floor(new Date(`${view.expiration}T00:00:00Z`).getTime() / 1000);
  $("optionsLink").href = `https://finance.yahoo.com/quote/${encodeURIComponent(state.selected)}/options/${Number.isFinite(expiryTime) ? `?date=${expiryTime}` : ""}`;
  const ratio = finite(view.putCallVolume); const tone = ratio === null ? "" : ratio > 1.15 ? "negative" : ratio < .75 ? "positive" : "";
  const callVolume = finite(view.callVolume) || 0, putVolume = finite(view.putVolume) || 0, totalVolume = callVolume + putVolume;
  const callShare = totalVolume ? callVolume / totalVolume * 100 : 50; const putShare = 100 - callShare;
  const profiles = (view.strikeProfile || []).filter(row => finite(row.strike) !== null).sort((a, b) => Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)).slice(0, 9).sort((a, b) => a.strike - b.strike);
  const maxOi = Math.max(1, ...profiles.flatMap(row => [finite(row.callOi) || 0, finite(row.putOi) || 0]));
  const profileRows = profiles.map(row => {
    const near = spotPrice && Math.abs(row.strike - spotPrice) === Math.min(...profiles.map(item => Math.abs(item.strike - spotPrice)));
    const strikeDigits = Number(row.strike) % 1 ? 1 : 0;
    return `<div class="oi-row ${near ? "near" : ""}"><span class="oi-number">${fmtCompact(row.callOi)}</span><i class="call-oi" style="width:${clamp((finite(row.callOi)||0)/maxOi*100,0,100).toFixed(1)}%"></i><b>${fmt(row.strike, strikeDigits)}</b><i class="put-oi" style="width:${clamp((finite(row.putOi)||0)/maxOi*100,0,100).toFixed(1)}%"></i><span class="oi-number">${fmtCompact(row.putOi)}</span></div>`;
  }).join("");
  const levels = [view.putWall, spotPrice, view.maxPain, view.callWall].map(finite).filter(value => value !== null);
  let ladder = "";
  if (levels.length >= 2) {
    let low = Math.min(...levels), high = Math.max(...levels); const pad = Math.max((high - low) * .12, (spotPrice || high) * .01); low -= pad; high += pad;
    const marker = (label, value, kind) => finite(value) === null ? "" : `<span class="price-marker ${kind}" style="left:${clamp((value-low)/(high-low)*100,2,98).toFixed(1)}%"><i></i><b>${label}</b><small>$${fmt(value, 0)}</small></span>`;
    ladder = `<div class="option-ladder"><div class="ladder-track"></div>${marker("Put Wall",view.putWall,"put")}${marker("现价",spotPrice,"spot")}${marker("Max Pain",view.maxPain,"pain")}${marker("Call Wall",view.callWall,"call")}</div>`;
  }
  const trend = (view.trend || []).filter(point => finite(point.putCallVolume) !== null);
  const side=state.optionSideBySymbol[state.selected]||'all';
  const contracts = (view.topContracts || []).filter(c=>side==='all'||c.type===side).map(contract => `<div class="contract ${contract.type === "put" ? "put" : ""}"><b>${escapeHtml(contract.type?.toUpperCase()||"—")} ${fmt(contract.strike)}</b><span>量 ${fmtCompact(contract.volume)}</span><span>OI ${fmtCompact(contract.openInterest)}</span><span>量/OI ${fmt(contract.volumeOi,1)}</span></div>`).join("");
  const expiryOptions = snapshots.map(item => `<option value="${escapeHtml(item.expiration)}" ${item.expiration === view.expiration ? "selected" : ""}>${escapeHtml(item.expiration)} · ${item.daysToExpiry ?? "—"} DTE</option>`).join("");
  $("optionsBody").innerHTML = `<div class="option-expiry-control"><label for="expirySelect">查看到期日</label><select id="expirySelect" class="expiry-select" ${snapshots.length < 2 ? "disabled" : ""}>${expiryOptions}</select><small>快照 ${ageText(view.capturedAt)}</small></div><div class="options-summary">
    <div class="option-stat"><span>当前到期日</span><strong>${escapeHtml(view.expiration || "—")}</strong><small>${view.daysToExpiry ?? "—"} DTE · 共 ${snapshots.length} 个日期</small></div>
    <div class="option-stat"><span>Put / Call 成交量</span><strong class="${tone}">${fmt(ratio,2)}</strong><small>${ratio>1?"Put 更活跃":"Call 更活跃"}</small></div>
    <div class="option-stat"><span>Put / Call OI</span><strong>${fmt(view.putCallOi,2)}</strong><small>未平仓比率</small></div>
    <div class="option-stat"><span>估算 Max Pain</span><strong>$${fmt(view.maxPain)}</strong><small>按当前 OI 粗估</small></div>
  </div>
  <section class="option-viz"><div class="mini-heading"><span>Call / Put 成交活跃度</span><small>方向代理，不是主动买卖单</small></div><div class="flow-labels"><b>Call ${fmt(callShare,0)}%</b><b>Put ${fmt(putShare,0)}%</b></div><div class="flow-meter"><i style="width:${callShare.toFixed(1)}%"></i><i style="width:${putShare.toFixed(1)}%"></i></div></section>
  <section class="option-viz"><div class="mini-heading"><span>Put / Call 成交比趋势</span><small>${trend.length > 1 ? `${trend.length} 个快照` : "正在积累快照"}</small></div><div class="ratio-chart">${optionTrendSvg(trend)}<span>1.0 中性线</span></div></section>
  <section class="option-viz"><div class="mini-heading"><span>期权关键价格带</span><small>OI Wall 是潜在支撑/阻力，不保证守住</small></div>${ladder || '<div class="empty-state compact">等待价格带</div>'}</section>
  <section class="option-viz oi-profile"><div class="mini-heading"><span>行权价 OI 分布</span><small>Call OI ← 行权价 → Put OI</small></div>${profileRows || '<div class="empty-state compact">下次完整数据更新后显示</div>'}</section>
  <div class="contract-list"><div class="option-expiry-control"><h3>活跃合约 · 按成交量 / OI</h3><label for="optionSide">类型</label><select id="optionSide" class="expiry-select">${[['all','全部'],['call','Call'],['put','Put']].map(([value,label])=>`<option value="${value}" ${value===side?'selected':''}>${label}</option>`).join('')}</select></div>${contracts || '<div class="empty-state compact">无活跃合约</div>'}</div><p class="options-caption">快照聚合成交量与未平仓量，无法区分每笔主动买入或卖出；Max Pain 与 OI Wall 是描述性统计，不是预测。</p>`;
}

function renderNews(news) {
  if (!news.length) { $("newsList").innerHTML = `<div class="empty-state">暂无新闻，点击“更多”打开外部新闻页</div>`; return; }
  $("newsList").innerHTML = news.slice(0,7).map(article => {
    const age = article.publishedAt ? relativeTime(article.publishedAt) : ""; const href = /^https?:\/\//.test(article.url||"") ? article.url : "#";
    return `<a class="news-item" href="${escapeHtml(href)}" target="_blank" rel="noopener"><div class="news-meta"><span>${escapeHtml(article.publisher||"Market News")}</span><span>${escapeHtml(age)}</span></div><h3>${escapeHtml(article.title||"Untitled")}</h3></a>`;
  }).join("");
}
function relativeTime(dateValue) { const seconds = Math.max(0,(Date.now()-new Date(dateValue).getTime())/1000); if(seconds<3600)return `${Math.max(1,Math.round(seconds/60))} 分钟前`; if(seconds<86400)return `${Math.round(seconds/3600)} 小时前`; return `${Math.round(seconds/86400)} 天前`; }

function renderAlert(item) {
  const kind = alertState(state.selected,item); const banner = $("alertBanner"); if (!kind || state.dismissedAlert) { banner.hidden = true; return; }
  const range = state.ranges[state.selected]; banner.hidden = false; banner.classList.toggle("sell",kind==="sell");
  $("alertIcon").textContent = kind === "buy" ? "↓" : "↑"; $("alertTitle").textContent = kind === "buy" ? "进入自定义买入区间" : "进入自定义止盈区间";
  $("alertText").textContent = `${displayFor(state.selected)} 当前价 $${fmt(item.price)}，位于 $${fmt(range[`${kind}Low`])} – $${fmt(range[`${kind}High`])}。`;
  maybeNotify(kind,item,range);
}
function maybeNotify(kind,item,range) {
  if (localStorage.getItem(KEYS.notifications) !== "on" || !('Notification' in window) || Notification.permission !== "granted") return;
  const marker = `${state.selected}-${kind}-${new Date().toISOString().slice(0,10)}`; if (sessionStorage.getItem(marker)) return; sessionStorage.setItem(marker,"1");
  new Notification(`${displayFor(state.selected)} ${kind === "buy" ? "买入" : "止盈"}区间提醒`, { body:`当前价 $${fmt(item.price)} · 区间 $${fmt(range[`${kind}Low`])}–$${fmt(range[`${kind}High`])}` });
}

function navigateInvestment(tab) {
  if (integrated) dispatchEvent(new CustomEvent('investment-select',{detail:{tab,symbol:state.selected}}));
  else if (parent!==window) parent.postMessage({channel:'pt-workspace',type:'navigate',tab,symbol:state.selected},location.origin);
  else location.href='../investment-desk/?tab='+tab+'&symbol='+encodeURIComponent(state.selected);
}
function bindEvents() {
  document.querySelectorAll('[data-list]').forEach((button,index,buttons)=>{
    button.onclick=()=>{state.list=button.dataset.list;renderAll()};
    button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-index;buttons[next].click();buttons[next].focus()}};
  });
  $('manageHoldings')?.addEventListener('click', () => navigateInvestment('review'));
  $('positionDecision').onclick=e=>{const button=e.target.closest('[data-investment-tab]');if(button)navigateInvestment(button.dataset.investmentTab)};
  $("watchlist").addEventListener("click", event => {
    const remove = event.target.closest("[data-remove]"); if (remove) { event.stopPropagation(); removeSymbol(remove.dataset.remove); return; }
    const button = event.target.closest("[data-symbol]"); if (!button) return; selectMarketSymbol(button.dataset.symbol);
  });
  $("addSymbolForm").addEventListener("submit", event => { event.preventDefault(); const input=$("symbolInput"); let symbol=input.value.trim().toUpperCase(); if(!symbol)return; if(symbol==="SPX")symbol="^GSPC"; if(symbol==="BTCUSD")symbol="BTC-USD"; if(!state.watchlist.some(item=>item.symbol===symbol))state.watchlist.push({symbol,display:symbol.replace("-USD","USD").replace("^GSPC","SPX"),name:symbol}); state.selected=symbol; input.value=""; writeStorage(KEYS.watchlist,state.watchlist);if(integrated)dispatchEvent(new Event('investment-watchlist-changed')); localStorage.setItem(KEYS.selected,symbol); renderAll(); fetchCustomSymbol(symbol); });
  $("resetWatchlist").addEventListener("click",()=>{state.watchlist=structuredClone(DEFAULT_WATCHLIST);writeStorage(KEYS.watchlist,state.watchlist);if(integrated)dispatchEvent(new Event('investment-watchlist-changed'));renderAll();toast("已恢复 deskboard 默认列表");});
  $("refreshButton").addEventListener("click",async()=>{
    if(!integrated)dispatchEvent(new Event('workspace-refresh-investment'));
    else refreshCompany(state.selected);
    $("refreshButton").classList.add('loading');$("refreshButton").disabled=true;
    try{await refreshStock(state.selected,true,true)}finally{$("refreshButton").classList.remove('loading');$("refreshButton").disabled=false;}
  });
  $("optionsBody").addEventListener("change", event => {
    if (event.target.id === "expirySelect") state.optionExpiryBySymbol[state.selected] = event.target.value;
    else if(event.target.id === "optionSide")state.optionSideBySymbol[state.selected]=event.target.value;
    else return;
    renderOptions(dataFor()?.options, dataFor()?.price);
  });
  document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-period]").forEach(node=>{node.classList.toggle("active",node===button);node.setAttribute("aria-pressed",String(node===button));});state.period=button.dataset.period;renderChart(dataFor()?.history||[]);}));
  const rangeFields=['buyLow','buyHigh','sellLow','sellHigh'];
  const readRange=()=>Object.fromEntries(rangeFields.map(key=>[key,$(key+'Input').value]));
  $("rangeForm").addEventListener("input",()=>{state.rangeDrafts[state.selected]=readRange()});
  $("rangeForm").addEventListener("submit",event=>{
    event.preventDefault();
    const range=Object.fromEntries(Object.entries(readRange()).map(([key,value])=>[key,finite(value)]));
    const valid=prefix=>{
      const lo=range[prefix+'Low'],hi=range[prefix+'High'];
      return (lo===null&&hi===null)||(lo!==null&&hi!==null&&lo>0&&hi>=lo);
    };
    if(!valid('buy')||!valid('sell')){toast("每组区间请同时填入大于零的最低价和最高价，或留空");return}
    if(range.buyLow===null&&range.sellLow===null)delete state.ranges[state.selected];
    else state.ranges[state.selected]=range;
    delete state.rangeDrafts[state.selected];
    writeStorage(KEYS.ranges,state.ranges);
    toast("个人区间已保存");
    renderAll();
  });
  $("useModelRanges").addEventListener("click",()=>{
    if (integrated && !reviewWindow(dataFor()?.lastTradeAt)) return;
    const {buy,sell}=decisionFor(state.selected).decision;
    const ranges=integrated?buy&&[...buy,...sell]:state.analysis&&rangeFields.map(key=>state.analysis[key]);
    if(!ranges)return;
    state.rangeDrafts[state.selected]=Object.fromEntries(rangeFields.map((key,i)=>[key,ranges[i].toFixed(2)]));
    renderRangeForm(state.analysis);
    toast("已填入技术区间，保存后用于提醒");
  });
  $("clearRanges")?.addEventListener("click",()=>{
    state.rangeDrafts[state.selected]=Object.fromEntries(rangeFields.map(key=>[key,'']));
    renderRangeForm(state.analysis);
    toast("已清空输入，保存后取消提醒");
  });
  for(const button of document.querySelectorAll('[data-evidence]'))button.addEventListener('click',()=>showEvidence(button.dataset.evidence));
  $("positionDecision").addEventListener('click',event=>{if(event.target.closest('[data-edit-range]'))showEvidence('ranges')});
  $("dismissAlert").addEventListener("click",()=>{state.dismissedAlert=true;$("alertBanner").hidden=true;});
  $("methodButton").addEventListener("click",()=>$("methodDialog").showModal());
  $("themeButton")?.addEventListener("click",()=>{document.body.classList.toggle("light");localStorage.setItem(KEYS.theme,document.body.classList.contains("light")?"light":"dark");});
  $("notifyButton").addEventListener("click",async()=>{if(!("Notification" in window)){toast("当前浏览器不支持系统通知");return;} const result=await Notification.requestPermission(); if(result==="granted"){localStorage.setItem(KEYS.notifications,"on");$("notifyButton").textContent=integrated?"提醒已开":"●";toast("价格通知已启用");}else toast("未获得通知权限");});
}
function removeSymbol(symbol) { if(state.watchlist.length<=1){toast("至少保留一个标的");return;} state.watchlist=state.watchlist.filter(item=>item.symbol!==symbol);if(state.selected===symbol)state.selected=state.watchlist[0].symbol;writeStorage(KEYS.watchlist,state.watchlist);localStorage.setItem(KEYS.selected,state.selected);renderAll(); }

function showEvidence(section){
  for(const button of document.querySelectorAll('[data-evidence]'))button.setAttribute('aria-pressed',String(button.dataset.evidence===section));
  for(const panel of document.querySelectorAll('[data-evidence-panel]'))panel.hidden=panel.dataset.evidencePanel!==section;
}
function init() {
  if (!integrated && localStorage.getItem(KEYS.theme)==="light") document.body.classList.add("light");
  if (localStorage.getItem(KEYS.notifications)==="on") $("notifyButton").textContent=integrated?"提醒已开":"●";
  if (state.list==='holdings' && !holdings().some(h=>h.symbol===state.selected)) state.selected=holdings()[0].symbol;
  bindEvents(); updateMarketStatus(); renderAll();
  if(!integrated)loadMarketData(false).then(()=>fetchLiveSelectedQuote(false));
  else if(!marketPanel.hidden)openMarket();

}
init();

addEventListener('workspace-select-symbol',e=>{
  if(state.selected!==e.detail.symbol)selectMarketSymbol(e.detail.symbol,false);
});
addEventListener('workspace-activate',e=>{
  if(integrated&&e.detail.tab==='market'){
    if(e.detail.symbol!==state.selected)selectMarketSymbol(e.detail.symbol,false);
    else openMarket();
  }
});
function reloadRecords(e){
  state.watchlist=readStorage(KEYS.watchlist,DEFAULT_WATCHLIST);
  if(e?.detail?.key==='holdings'&&holdings().length)state.list='holdings';
  renderAll();
}
addEventListener('workspace-records',reloadRecords);
if(integrated)addEventListener('decision-change',e=>{if(['holdings','watchlist'].includes(e.detail.key))reloadRecords(e)});
addEventListener('storage',reloadRecords);
addEventListener('pt-sync-applied',reloadRecords);
function receivePortfolio(e){
  const {market,companies,errors,busy}=e.detail;
  for(const [symbol,q] of Object.entries(market?.symbols||{})){
    state.data.symbols[symbol] = mergeMarketItem(dataFor(symbol), q);
  }
  if(companies)for(const c of companies){const old=state.companies.find(item=>item.ticker===c.ticker);if(!old||Date.parse(c.updatedAt)>=Date.parse(old.updatedAt))state.companies=[...state.companies.filter(item=>item.ticker!==c.ticker),c];}
  state.evidenceErrors={...state.evidenceErrors,...errors};state.evidenceBusy=!!busy;
  updateMarketStatus();
  renderAll();
}
addEventListener('workspace-investment-data',receivePortfolio);
if(integrated)addEventListener('investment-data',receivePortfolio);
// The classic bridge can become ready before this module's imports finish.
dispatchEvent(new Event('workspace-request-investment'));
