const coinbaseURL = 'wss://ws-feed.exchange.coinbase.com';

export function boardStreams(onQuote, onDisconnect) {
  let products = new Set(), active = false, socket, retry;

  function connectCoinbase() {
    if (!active || socket || !products.size) return;
    const subscribed = [...products];
    let current;
    try { current = new WebSocket(coinbaseURL); }
    catch { return; }
    socket = current;
    current.addEventListener('open', () => current.send(JSON.stringify({
      type:'subscribe', channels:[{name:'ticker', product_ids:subscribed}]
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

  function stop() {
    clearTimeout(retry);
    const old = socket;
    socket = undefined;
    old?.close();
    onDisconnect();
  }

  function setActive(value) {
    if (active === value) return;
    active = value;
    if (active) connectCoinbase();
    else stop();
  }

  function setCards(entries) {
    const next = new Set(entries.filter(entry=>entry.coinbase).map(entry=>entry.symbol));
    if (next.size === products.size && [...next].every(symbol=>products.has(symbol))) return;
    stop();
    products = next;
    connectCoinbase();
  }

  return {setCards,setActive};
}
