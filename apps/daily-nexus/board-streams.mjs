const tvScript = 'https://widgets.tradingview-widget.com/w/en/tv-single-ticker.js';
const coinbaseURL = 'wss://ws-feed.exchange.coinbase.com';
const usExchanges = /^(NASDAQ|NYSE|AMEX|NYSEARCA|NYSEAMERICAN|BATS|OTC):/;

export function boardStreams(onQuote, onDisconnect) {
  let cards = [], active = false, socket, retry, loader;
  const frames = new Map();

  function connectCoinbase() {
    if (!active || socket) return;
    const products = new Set(cards.filter(entry=>entry.coinbase).map(entry=>entry.symbol));
    if (!products.size) return;
    let current;
    try { current = new WebSocket(coinbaseURL); }
    catch { return; }
    socket = current;
    current.addEventListener('open', () => current.send(JSON.stringify({
      type:'subscribe', channels:[{name:'ticker', product_ids:[...products]}]
    })));
    current.addEventListener('message', event => {
      if (socket !== current) return;
      try {
        const item = JSON.parse(event.data);
        if (item.type !== 'ticker' || !products.has(item.product_id)) return;
        const price = Number(item.price), open = Number(item.open_24h);
        if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(item.time))) return;
        onQuote(item.product_id, {price, currency:'USD', lastTradeAt:item.time,
          changePct:Number.isFinite(open) && open > 0 ? (price/open-1)*100 : null});
      } catch {}
    });
    current.addEventListener('close', () => {
      if (socket !== current) return;
      socket = undefined;
      onDisconnect();
      if (active) retry = setTimeout(connectCoinbase,15000);
    });
  }

  function mount() {
    for (const entry of cards) {
      if (entry.coinbase) continue;
      const layer = document.createElement('div');
      layer.className = 'board-tv-quote';
      layer.inert = true;
      const widget = document.createElement('tv-single-ticker');
      widget.setAttribute('symbol',entry.stock.symbol);
      widget.setAttribute('theme',document.documentElement.dataset.theme || 'dark');
      const setReady = ready => {
        if (frames.get(entry) !== layer) return;
        entry.cell.dataset.tradingview = ready ? 'ready' : 'fallback';
        layer.inert = !ready;
      };
      widget.addEventListener('tv-widget-ready',()=>setReady(true));
      widget.addEventListener('tv-widget-error',()=>setReady(false));
      const source = document.createElement('small');
      source.textContent = usExchanges.test(entry.stock.symbol) ? 'TradingView · 延迟' : 'TradingView · 自动更新';
      source.title = '报价延迟取决于交易所';
      layer.append(widget,source);
      frames.set(entry,layer);
      entry.cell.append(layer);
    }
    if (frames.size && !loader && !customElements.get('tv-single-ticker')) {
      loader = document.createElement('script');
      loader.type = 'module';
      loader.src = tvScript;
      loader.addEventListener('error',()=>{
        loader.remove();
        loader = null;
      });
      document.head.append(loader);
    }
    connectCoinbase();
  }

  function stop() {
    clearTimeout(retry);
    const old = socket;
    socket = undefined;
    old?.close();
    onDisconnect();
    for (const [entry,layer] of frames) {
      layer.remove();
      delete entry.cell.dataset.tradingview;
    }
    frames.clear();
  }

  function setActive(value) {
    if (active === value) return;
    active = value;
    if (active) mount();
    else stop();
  }

  function setCards(entries) {
    stop();
    cards = entries;
    if (active) mount();
  }

  return {setCards,setActive};
}
