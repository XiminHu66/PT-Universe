import {API} from '../_shared/on-demand.mjs';
import {batchQuote, readBatchSnapshot} from '../investment-desk/refresh.mjs';

const cacheKey = 'ptu.nexus.board-quotes-v1';
const sharedSnapshotKey = 'ptu.investment.batch-snapshot-v1';
const refreshMs = 15 * 60_000;
const staleMs = 36 * 60 * 60_000;
const marketTime = new Intl.DateTimeFormat('en-US', {
  timeZone:'America/Los_Angeles', month:'numeric', day:'numeric',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});
const US_EXCHANGES = new Set(['NASDAQ','NYSE','AMEX','NYSEARCA','NYSEAMERICAN','BATS','OTC']);
const equivalents = {
  'TVC:SPX':'^GSPC', 'SP:SPX':'^GSPC', 'CBOE:VIX':'^VIX', 'TVC:US10Y':'^TNX', 'TVC:DXY':'DX-Y.NYB'
};

function quoteSymbol(symbol) {
  const [exchange, ticker] = symbol.split(':');
  if (equivalents[symbol]) return equivalents[symbol];
  if (exchange === 'COINBASE' && /^[A-Z0-9]{2,10}USD$/.test(ticker)) return ticker.slice(0, -3) + '-USD';
  if (US_EXCHANGES.has(exchange) && /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) return ticker;
  return null;
}

function compactQuote(raw) {
  if (!Number.isFinite(raw?.price) || raw.price <= 0 || !Number.isFinite(Date.parse(raw.lastTradeAt))) return null;
  return {price:raw.price, lastTradeAt:raw.lastTradeAt,
    currency:/^[A-Z]{3}$/.test(raw.currency) ? raw.currency : 'USD',
    changePct:Number.isFinite(raw.changePct) ? raw.changePct : null,
    checkedAt:raw.checkedAt,
    closes:(raw.closes || raw.history?.slice(-16).map(bar=>bar.c) || []).filter(value=>Number.isFinite(value)&&value>0)};
}

function marketLink(symbol) {
  return 'https://www.tradingview.com/symbols/' + encodeURIComponent(symbol.replace(':','-')) + '/';
}

export function mountBoardMarket(isActive) {
  const quotes = new Map(), attempts = new Map(), pending = new Set();
  let cards = [], initializing = true;

  function merge(symbol, raw) {
    const quote = compactQuote(raw);
    const existing = quotes.get(symbol);
    if (quote && (!existing || Date.parse(quote.lastTradeAt) >= Date.parse(existing.lastTradeAt))) quotes.set(symbol, quote);
    const checked = Date.parse(quote?.checkedAt);
    if (Number.isFinite(checked)) attempts.set(symbol, Math.max(attempts.get(symbol) || 0, checked));
  }

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    for (const [symbol, quote] of Object.entries(cached)) merge(symbol,quote);
  } catch {}

  function render() {
    for (const {symbol, card, price, change, time, age, chart} of cards) {
      const quote = quotes.get(symbol);
      const unit = symbol === '^TNX' ? 'percent' : symbol.startsWith('^') || symbol === 'DX-Y.NYB' ? 'index' : 'currency';
      price.textContent = quote ? new Intl.NumberFormat('en-US', {
        style:unit === 'currency' ? 'currency' : 'decimal', currency:quote.currency,
        minimumFractionDigits:2, maximumFractionDigits:2
      }).format(quote.price) + (unit === 'percent' ? '%' : '') : '—';
      const pct = quote?.changePct;
      change.textContent = Number.isFinite(pct) ? (pct > 0 ? '+' : '') + pct.toFixed(2) + '%' : '';
      change.dataset.direction = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
      const stale = !!quote && Date.now() - Date.parse(quote.lastTradeAt) > staleMs;
      card.dataset.stale = String(stale);
      age.textContent = stale ? '旧报价' : '';
      time.textContent = quote ? marketTime.format(new Date(quote.lastTradeAt)).replace(',', '') + ' PT'
        : initializing || pending.has(symbol) ? '读取中' : '报价暂不可用';
      if (quote) time.dateTime = quote.lastTradeAt;
      drawTrend(chart,quote?.closes,stale);
    }
  }

  function drawTrend(chart, closes = [], stale) {
    chart.hidden = closes.length < 2 || stale;
    if (chart.hidden) return;
    const ctx = chart.getContext('2d');
    const low = Math.min(...closes), range = Math.max(...closes) - low || 1;
    ctx.clearRect(0,0,chart.width,chart.height);
    ctx.strokeStyle = closes.at(-1) >= closes[0] ? '#20876b' : '#bd4d60';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [i,close] of closes.entries()) {
      const x = 1 + i * (chart.width - 2) / (closes.length - 1);
      const y = chart.height - 2 - (close - low) * (chart.height - 4) / range;
      if (i) ctx.lineTo(x,y);
      else ctx.moveTo(x,y);
    }
    ctx.stroke();
  }

  async function syncSharedQuotes() {
    const data = await readBatchSnapshot();
    for (const [symbol,quote] of Object.entries(data?.symbols || {})) merge(symbol,quote);
    render();
  }
  addEventListener('storage',event=>{
    if (event.key === sharedSnapshotKey) syncSharedQuotes();
  });

  const ready = Promise.allSettled([
    fetch(new URL('../stock-alert/data/quotes.json', import.meta.url), {signal:AbortSignal.timeout(8000)})
      .then(response=>response.ok ? response.json() : null)
      .then(data=>{ for (const [symbol, quote] of Object.entries(data?.symbols || {})) merge(symbol,quote); render(); }),
    syncSharedQuotes()
  ]).then(()=>{ initializing = false; render(); });

  async function refresh(force = false) {
    if (!isActive()) return;
    // Use the persisted trading-desk snapshot before sending any duplicate quote requests.
    await ready;
    await syncSharedQuotes();
    const now = Date.now();
    const symbols = [...new Set(cards.map(card=>card.symbol))]
      .filter(symbol=>!pending.has(symbol) && (force || now - (attempts.get(symbol) || 0) >= refreshMs));
    if (!symbols.length || !isActive()) return;
    symbols.forEach(symbol=>pending.add(symbol));
    render();
    let next = 0;
    async function requestQuotes() {
      while (next < symbols.length && isActive()) {
        const symbol = symbols[next++];
        attempts.set(symbol, now);
        try {
          const fetchQuote = () => fetch(API + '/api/investment/quote?symbol=' + encodeURIComponent(symbol),
            {signal:AbortSignal.timeout(25000)});
          let response = await fetchQuote().catch(()=>null);
          const last = quotes.get(symbol);
          if (isActive() && (!response || response.status >= 500) && (!last || now - Date.parse(last.lastTradeAt) > staleMs)) {
            await new Promise(resolve=>setTimeout(resolve,700));
            if (isActive()) response = await fetchQuote();
          }
          if (!response?.ok) continue;
          const {quote} = await response.json();
          merge(symbol, {...batchQuote(quote,symbol), checkedAt:new Date().toISOString()});
        } catch {
          // Keep the last valid quote for this symbol on an upstream or connection failure.
        } finally {
          pending.delete(symbol);
          render();
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(4, symbols.length)},requestQuotes));
    symbols.forEach(symbol=>pending.delete(symbol));
    try {
      const current = new Set(cards.map(card=>card.symbol));
      localStorage.setItem(cacheKey,JSON.stringify(Object.fromEntries([...quotes].filter(([symbol])=>current.has(symbol)))));
    } catch {}
    render();
  }

  function setCards(cells) {
    cards = [];
    for (const {cell, stock} of cells) {
      const symbol = quoteSymbol(stock.symbol);
      if (!symbol) continue;
      const card = document.createElement('a');
      card.className = 'board-quote';
      card.href = marketLink(stock.symbol);
      card.target = '_blank';
      card.rel = 'noopener';
      const label = document.createElement('b');
      label.className = 'board-quote-symbol';
      label.textContent = stock.label || symbol;
      const price = document.createElement('strong');
      price.className = 'board-quote-price';
      const change = document.createElement('span');
      change.className = 'board-quote-change';
      const time = document.createElement('time');
      const age = document.createElement('span');
      age.className = 'board-quote-age';
      const meta = document.createElement('span');
      meta.className = 'board-quote-meta';
      const chart = document.createElement('canvas');
      chart.width = 76;
      chart.height = 28;
      chart.setAttribute('aria-hidden','true');
      meta.append(age,time,chart);
      card.append(label,change,price,meta);
      cell.replaceChildren(card);
      cards.push({symbol, card, price, change, time, age, chart});
    }
    render();
    refresh();
    return cells.filter(({stock})=>!quoteSymbol(stock.symbol));
  }

  return {setCards, refresh};
}
