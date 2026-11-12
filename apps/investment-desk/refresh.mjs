export const DEFAULT_WATCHLIST = [
  ['^GSPC', 'SPX', 'S&P 500'], ['QQQ', 'QQQ', 'Nasdaq 100 ETF'],
  ['AAPL', 'AAPL', 'Apple'], ['SMH', 'SMH', 'VanEck Semiconductor ETF'],
  ['NVDA', 'NVDA', 'NVIDIA'], ['BTC-USD', 'BTCUSD', 'Bitcoin / USD'],
  ['INTC', 'INTC', 'Intel'], ['UNH', 'UNH', 'UnitedHealth'],
  ['HOOD', 'HOOD', 'Robinhood'], ['NOW', 'NOW', 'ServiceNow'],
  ['VST', 'VST', 'Vistra'], ['MRVL', 'MRVL', 'Marvell Technology']
].map(([symbol, display, name]) => ({symbol, display, name}));

const quoteFields = ['price', 'previousClose', 'change', 'changePct', 'lastTradeAt', 'currency', 'liveSource', 'checkedAt'];
const detailFields = ['news', 'options', 'fundamentals', 'fetchedAt'];

export function batchQuote(raw, symbol) {
  if (raw?.symbol !== symbol || !Number.isFinite(raw.price) || raw.price <= 0 || !Number.isFinite(Date.parse(raw.lastTradeAt))) {
    throw Error('未取得有效报价');
  }
  const day = raw.lastTradeAt.slice(0, 10);
  const previous = raw.history?.findLast(bar => bar.d < day && Number.isFinite(bar.c) && bar.c > 0)?.c;
  return {
    ...raw,
    previousClose: previous ?? null,
    change: previous == null ? null : raw.price - previous,
    changePct: previous == null ? null : (raw.price / previous - 1) * 100
  };
}

export function mergeMarketItem(current, incoming) {
  if (!current) return incoming;
  const merged = {...current, ...incoming};
  const oldQuote = (Date.parse(current.lastTradeAt) || 0) > (Date.parse(incoming.lastTradeAt) || 0);
  if (oldQuote) {
    for (const key of quoteFields) {
      if (key in current) merged[key] = current[key];
      else delete merged[key];
    }
  }
  if (current.history?.length) {
    const oldDay = current.history.at(-1).d;
    const newDay = incoming.history?.at(-1)?.d;
    if (!newDay || oldDay > newDay || oldDay === newDay && oldQuote) merged.history = current.history;
  }
  if (incoming.fetchedAt && Date.parse(current.fetchedAt) > Date.parse(incoming.fetchedAt)) {
    for (const key of detailFields) merged[key] = current[key];
  }
  return merged;
}

const dbName = 'ptu-investment-market-v1';
let connection;

function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('market');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('行情缓存暂不可用'));
  });
  return connection;
}

export async function readBatchSnapshot() {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const request = db.transaction('market').objectStore('market').get('latest');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
}

export async function saveBatchSnapshot(value) {
  try {
    const db = await database();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('market', 'readwrite');
      transaction.objectStore('market').put(value, 'latest');
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch { return false; }
}
