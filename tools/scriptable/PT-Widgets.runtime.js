// PT Widgets runtime v2
const VERSION = 2;
const SITE = 'https://ximinhu66.github.io/PT-Universe';
const MARKET = SITE + '/apps/daily-nexus/?view=board';
const DEAL_BOARD = SITE + '/apps/deal-radar/';
const RSS_BOARD = SITE + '/apps/rss-dashboard/';
const API = 'https://pt-universe-api.summer07-nanjolno.workers.dev';
const RSS = 'https://rss-orbit-proxy.summer07-nanjolno.workers.dev/feed/gcores';
const STEAM = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';
const MIN = 60000;
const DAY = 1440 * MIN;
const DEFAULT_STOCKS = ['NASDAQ:NVDA', 'NASDAQ:AMD', 'NASDAQ:MSFT', 'NASDAQ:GOOGL', 'NASDAQ:AAPL', 'NASDAQ:QQQ']
  .map(symbol => ({ symbol, label: symbol.split(':')[1], buy: null, sell: null }));

function makeStore() {
  const manager = FileManager.local();
  const dir = manager.joinPath(manager.documentsDirectory(), 'pt-widgets-v1');
  if (!manager.fileExists(dir)) manager.createDirectory(dir, true);
  const path = name => manager.joinPath(dir, name + '.json');
  return {
    read(name) {
      try { return JSON.parse(manager.readString(path(name))); }
      catch (_) { return null; }
    },
    write(name, value) { manager.writeString(path(name), JSON.stringify(value)); },
  };
}

async function load(url, type) {
  const req = new Request(url);
  req.timeoutInterval = 6;
  req.headers = { Accept: type === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml' };
  const data = type === 'json' ? await req.loadJSON() : await req.loadString();
  const status = req.response?.statusCode;
  if (status < 200 || status >= 300) throw Error('HTTP ' + status);
  return data;
}

async function cached(store, key, minAge, fetchValue) {
  const previous = store.read(key);
  if (previous && previous.checked > Date.now() - minAge) return { ...previous, offline: false };
  try {
    const value = await fetchValue();
    const next = { checked: Date.now(), value };
    try { store.write(key, next); } catch (error) { console.warn(String(error)); }
    return { ...next, offline: false };
  } catch (error) {
    console.warn(key + ': ' + String(error));
    return { checked: previous?.checked ?? null, value: previous?.value ?? null, offline: true };
  }
}

function positive(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isoTime(value) {
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function gpTime(value) {
  // The legacy GamerPower date has no zone. Use UTC conservatively for expiry.
  const raw = String(value || '');
  if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)) return isoTime(raw.replace(' ', 'T') + 'Z');
  return /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:?\d\d)$/.test(raw) ? isoTime(raw) : null;
}

function safeLink(value, hosts) {
  if (typeof value !== 'string' || /[\\\s]/.test(value)) return null;
  const match = /^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i.exec(value);
  return match && hosts.includes(match[1].toLowerCase()) ? value : null;
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function yahooSymbol(symbol) {
  const aliases = { 'TVC:SPX': '^GSPC', 'SP:SPX': '^GSPC', 'CBOE:VIX': '^VIX', 'TVC:VIX': '^VIX',
    'DJ:DJI': '^DJI', 'NASDAQ:NDX': '^NDX', 'COINBASE:BTCUSD': 'BTC-USD', 'COINBASE:ETHUSD': 'ETH-USD' };
  if (Object.prototype.hasOwnProperty.call(aliases, symbol)) return aliases[symbol];
  const match = /^(?:NASDAQ|NYSE|AMEX|NYSEARCA|ARCA|BATS):([A-Z0-9]+(?:[.-][A-Z0-9]+)?)$/.exec(symbol);
  return match ? match[1].replace('.', '-') : null;
}

function importStocks(data, allowEmpty = false) {
  if (!data || !Array.isArray(data.stocks)) throw Error('请选择 Daily Nexus「导出配置 JSON」的文件。');
  const seen = new Set();
  const imported = [];
  let ignored = 0;
  for (const item of data.stocks) {
    const symbol = clean(item?.symbol).toUpperCase();
    if (!yahooSymbol(symbol) || seen.has(symbol)) { ignored++; continue; }
    const buy = positive(item.buyPrice);
    const sell = positive(item.sellPrice);
    const validPair = buy === null || sell === null || buy < sell;
    imported.push({ symbol, label: Array.from(clean(item.label) || symbol.split(':')[1]).slice(0, 22).join(''),
      buy: validPair ? buy : null, sell: validPair ? sell : null });
    seen.add(symbol);
  }
  if (!imported.length && !allowEmpty) throw Error('备份里没有可读取的标的。');
  // Keep manual levels ahead of the rest when a long watchlist exceeds the per-run quote budget.
  imported.sort((a, b) => Number(Boolean(b.buy || b.sell)) - Number(Boolean(a.buy || a.sell)));
  return { stocks: imported.slice(0, 20), ignored: ignored + Math.max(0, imported.length - 20) };
}

const WATCHLIST_KEY = 'pt-widgets.watchlist-sync.v1';
const WATCHLIST_SCOPE = 'watchlist-widget-v1';

function pairing(value) {
  const m = /^([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\.([A-Za-z\d_-]{43})\.([A-Za-z\d_-]{43})$/i.exec(String(value || '').trim());
  if (!m) throw Error('配对码格式不对。请在 Daily Nexus 的「手机同步」重新复制。');
  return { id:m[1].toLowerCase(), token:m[2], secret:m[3] };
}

function base64url(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (typeof value !== 'string' || value.length % 4 === 1 || /[^\w-]/.test(value)) throw Error('同步数据格式错误。');
  const bytes = new Uint8Array(Math.floor(value.length * 3 / 4));
  let bits = 0, buffer = 0, i = 0;
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes[i++] = (buffer >>> bits) & 255; }
  }
  return bytes;
}

function syncConnection() {
  try { return Keychain.contains(WATCHLIST_KEY) ? pairing(Keychain.get(WATCHLIST_KEY)) : null; }
  catch (_) { return null; }
}

async function fetchWatchlist(connection) {
  const request = new Request(API + '/api/sync/' + connection.id + '/' + WATCHLIST_SCOPE);
  request.timeoutInterval = 5;
  request.onRedirect = () => null;
  request.headers = { Authorization:'Bearer ' + connection.token, Accept:'application/json', 'Cache-Control':'no-cache' };
  const packet = await request.loadJSON();
  if (request.response?.statusCode !== 200) throw Error('同步连接无效或暂不可用。');
  if (!Number.isSafeInteger(packet?.revision) || packet.revision < 1 || typeof packet.ciphertext !== 'string'
    || packet.ciphertext.length > 90000 || !isoTime(packet.updatedAt)) throw Error('网页还没有同步自选股。');
  const data = JSON.parse(packet.ciphertext);
  const iv = base64url(data.iv);
  const key = base64url(connection.secret);
  if (data.v !== 1 || iv.length !== 12 || key.length !== 32) throw Error('同步数据版本无效。');
  const aad = Uint8Array.from(connection.id + '/' + WATCHLIST_SCOPE, c => c.charCodeAt(0));
  const decoded = PTWidgetAES.gcm(key, iv, aad).decrypt(base64url(data.body));
  const plain = decoded.reduce((text, byte) => text + '%' + byte.toString(16).padStart(2, '0'), '');
  const content = JSON.parse(decodeURIComponent(plain));
  if (content?.version !== 1) throw Error('自选股版本不兼容。');
  return { ...importStocks(content, true), revision:packet.revision, updatedAt:packet.updatedAt };
}

async function connectedWatchlist(store, refresh = false) {
  const connection = syncConnection();
  const local = () => store.read('watchlist')?.stocks ?? DEFAULT_STOCKS;
  if (!connection) return { stocks:local(), status:'本机清单' };
  const key = 'synced-' + connection.id;
  const packet = await cached(store, key, refresh ? 0 : 10 * MIN, async () => {
    const next = await fetchWatchlist(connection);
    const prior = store.read(key)?.value;
    if (prior && next.revision < prior.revision) throw Error('同步版本早于本机缓存。');
    return next;
  });
  return { stocks:packet.value?.stocks ?? local(),
    status:packet.offline ? (packet.value ? '同步离线 · 上次清单' : '同步离线 · 本机清单') : '网页已同步' };
}

async function pairWatchlist(store) {
  const previous = syncConnection();
  const dialog = new Alert();
  dialog.title = '连接 Daily Nexus';
  dialog.message = previous
    ? '已连接网页。可粘贴新配对码，或将当前网页清单存为本机清单后断开。'
    : '在 Daily Nexus 看板点「手机同步」，启用后复制配对码。';
  dialog.addTextField('粘贴配对码');
  dialog.addAction('连接');
  if (previous) dialog.addDestructiveAction('断开同步');
  dialog.addCancelAction('取消');
  const action = await dialog.presentAlert();
  if (action === 0) {
    const code = dialog.textFieldValue(0).trim();
    const connection = pairing(code);
    const value = await fetchWatchlist(connection);
    store.write('synced-' + connection.id, { checked:Date.now(), value });
    Keychain.set(WATCHLIST_KEY, code);
    await alertBox('已连接 Daily Nexus', '已同步 ' + value.stocks.length + ' 只标的。网页保存后的修改会在组件刷新时拉取。'
      + (value.ignored ? '\n有 ' + value.ignored + ' 只超额、重复或暂不支持。' : ''));
  } else if (previous && action === 1) {
    const value = store.read('synced-' + previous.id)?.value;
    if (value) store.write('watchlist', { stocks:value.stocks, ignored:value.ignored });
    Keychain.remove(WATCHLIST_KEY);
    await alertBox('已断开同步', '投资卡将使用本机清单。');
  }
}

function quoteValue(result, ticker) {
  const m = result?.chart?.result?.[0]?.meta;
  const price = positive(m?.regularMarketPrice);
  const time = positive(m?.regularMarketTime);
  if (m?.symbol?.toUpperCase() !== ticker || !price || !time || time * 1000 > Date.now() + 2 * MIN) {
    throw Error('行情缺失');
  }
  const start = positive(m.currentTradingPeriod?.regular?.start);
  const end = positive(m.currentTradingPeriod?.regular?.end);
  const currency = /^[A-Z]{3}$/.test(m.currency || '') ? m.currency : null;
  if (!currency) throw Error('行情币种缺失');
  return { price, at: time * 1000, start: start ? start * 1000 : null, end: end ? end * 1000 : null, currency };
}

function assessStock(stock, packet, now) {
  const q = packet.value;
  if (!q) return { stock, q: null, state: '暂无行情', tier: 4, distance: Infinity };
  const open = q.start && q.end && now >= q.start && now < q.end;
  const missedClose = q.start && q.end && now >= q.end && now - q.end < 12 * 60 * MIN && q.at < q.start;
  const stale = packet.offline || missedClose || now - q.at > (open ? 25 * MIN : 4 * DAY);
  const result = { stock, q, state: stale ? '旧行情' : open ? '常规盘' : '常规盘末价',
    tier: stale ? 3 : 2, distance: Infinity, target: null };
  const targets = [
    { name: '买入', price: stock.buy, reached: q.price <= stock.buy },
    { name: '卖出', price: stock.sell, reached: q.price >= stock.sell },
  ].filter(t => t.price).map(t => ({ ...t, gap: Math.abs(q.price / t.price - 1) * 100 }));
  targets.sort((a, b) => Number(b.reached) - Number(a.reached) || a.gap - b.gap);
  if (!stale && targets.length) {
    result.target = targets[0];
    result.tier = targets[0].reached ? 0 : 1;
    result.distance = targets[0].gap;
  }
  return result;
}

async function marketData(store, stocks = store.read('watchlist')?.stocks ?? DEFAULT_STOCKS) {
  const memo = new Map();
  const results = await Promise.all(stocks.map(async stock => {
    const ticker = yahooSymbol(stock.symbol);
    if (!memo.has(ticker)) {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1d&interval=5m';
      memo.set(ticker, cached(store, 'quote-' + ticker, 10 * MIN, async () => quoteValue(await load(url, 'json'), ticker)));
    }
    return assessStock(stock, await memo.get(ticker), Date.now());
  }));
  return results.sort((a, b) => a.tier - b.tier || a.distance - b.distance);
}

function dollars(number) {
  return '$' + Number(number).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatQuote(q, value) {
  if (q.currency === 'USD') return dollars(value);
  return q.currency + ' ' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function stockDetail(row) {
  if (row.target) {
    const t = row.target;
    const status = t.reached ? (row.state === '常规盘' ? '已达' : '末价已达') : '距' + t.gap.toFixed(1) + '%';
    return t.name + ' ' + formatQuote(row.q, t.price) + ' · ' + status;
  }
  return row.state === '旧行情' || !row.q ? row.state : '未设参考价';
}

function parseWatchRules(raw) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 15) throw Error('最多 15 条关键词。');
  return lines.map(line => {
    const [term, price, ...extra] = line.split('|').map(s => s.trim());
    if (!term || term.length < 3 || term.length > 70 || !/^\d+(?:\.\d{1,2})?$/.test(price || '') || !positive(price) || extra.length) {
      throw Error('每行格式是「关键词 | 最高美元价」，如 Mini PC | 500。');
    }
    return { term: term.toLowerCase(), max: Number(price) };
  });
}

function dealSelection(board, rules, now) {
  if (!Array.isArray(board?.deals) || !isoTime(board.lastUpdatedAt)) throw Error('优惠雷达快照无效');
  const at = isoTime(board.lastUpdatedAt);
  const healthy = at <= now + 2 * MIN && now - at <= 5 * 60 * MIN && board.freshness?.stale !== true;
  const live = board.deals.filter(x => !x.expiresAt || isoTime(x.expiresAt) > now);
  const epic = live.filter(x => x.sourceId === 'epic' && x.offerKind === 'free-game' && isoTime(x.expiresAt))
    .map(x => ({
      title: clean(x.title), url: safeLink(x.url, ['store.epicgames.com']), end: isoTime(x.expiresAt),
      label: 'Epic 国区', kind: 'game',
    })).filter(x => x.url && x.title).map(x => ({ ...x, id: 'epic-' + x.url.split('?')[0] + '-' + x.end }));
  const offers = [];
  for (const x of live) {
    if (x.sourceId !== 'slickdeals' || x.category !== '低价优惠') continue;
    const date = isoTime(x.publishedAt) || isoTime(x.firstSeenAt);
    if (!date || date > now + 2 * MIN || now - date > 2 * DAY) continue;
    const title = clean(x.title);
    const url = safeLink(x.url, ['slickdeals.net', 'www.slickdeals.net']);
    if (!url || !title) continue;
    const saving = positive(/\b(?:save|savings? of)\s+(?:up to\s+)?\$([\d,]+(?:\.\d{1,2})?)/i.exec(title)?.[1]?.replace(/,/g, ''));
    const discount = positive(/\b(\d{1,2})%\s+(?:off|discount)\b/i.exec(title)?.[1]);
    const pricePart = title.split(/\s(?:\+|with|w\/|after|via|when|on orders)\s*|\s\(reg\b/i)[0];
    const prices = [...pricePart.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)];
    const price = prices.length === 1 && saving === null ? positive(prices[0][1].replace(/,/g, '')) : null;
    const ambiguousPrice = /\b(?:up to|from|starting at|as low as|per month|trade[ -]?in)\b/i.test(title);
    const watched = price && !ambiguousPrice && rules.some(rule => title.toLowerCase().includes(rule.term) && price <= rule.max);
    const major = /\bup to\b/i.test(title) ? false : (saving >= 100 || discount >= 50 && price >= 80);
    if (!watched && !major) continue;
    const label = watched ? '目标价内 ' + dollars(price) : saving ? '标题称省 ' + dollars(saving) : '标题称 ' + discount + '% off';
    offers.push({ id: 'deal-' + url.split('?')[0], title, url, date, end: isoTime(x.expiresAt),
      label: label + (x.offerKind === 'coupon' || x.offerKind === 'clip-coupon' ? ' · 券' : ''), kind: 'offer', watched });
  }
  offers.sort((a, b) => Number(b.watched) - Number(a.watched) || b.date - a.date);
  return { epic, offers, healthy, at };
}

function steamSelection(raw, now) {
  if (!Array.isArray(raw)) throw Error('Steam 活动响应无效');
  return raw.flatMap(item => {
    if (item?.type?.toLowerCase() !== 'game' || item.status?.toLowerCase() !== 'active' ||
        !/\bsteam\b/i.test(item.platforms || '')) return [];
    const end = gpTime(item.end_date);
    const published = gpTime(item.published_date);
    if (end && end <= now || !end && (!published || now - published > 14 * DAY)) return [];
    const details = [item.title, item.description, item.instructions].join(' ');
    if (/free weekend|free to play|free trial|playtest|early access beta|\d+\s+ARP required|\bpoints (?:are )?required/i.test(details)) return [];
    const url = safeLink(item.open_giveaway_url, ['www.gamerpower.com', 'gamerpower.com', 'store.steampowered.com']);
    const title = clean(item.title);
    if (!url || !title || !positive(item.id)) return [];
    return [{ id: 'steam-' + item.id, kind: 'game', title, end, label: 'Steam · GamerPower', url }];
  });
}

function dedup(items) {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

async function dealData(store) {
  const rules = store.read('deal-rules') ?? [];
  const [radar, steam] = await Promise.all([
    cached(store, 'deals', 30 * MIN, async () => {
      const full = await load(API + '/api/deal-radar/latest', 'json');
      if (!Array.isArray(full?.deals) || !isoTime(full.lastUpdatedAt)) throw Error('优惠源不可用');
      return { lastUpdatedAt: full.lastUpdatedAt, freshness: full.freshness, deals: full.deals.filter(
        x => x.sourceId === 'epic' || x.sourceId === 'slickdeals').map(
        ({ sourceId, title, url, category, offerKind, publishedAt, firstSeenAt, expiresAt }) =>
          ({ sourceId, title, url, category, offerKind, publishedAt, firstSeenAt, expiresAt })) };
    }),
    cached(store, 'steam', 60 * MIN, async () => {
      const full = await load(STEAM, 'json');
      if (Number(full?.status) === 0) return [];
      if (!Array.isArray(full)) throw Error('Steam 活动响应无效');
      return full;
    }),
  ]);
  const now = Date.now();
  const board = radar.value ? dealSelection(radar.value, rules, now) : { epic: [], offers: [], healthy: false, at: null };
  const steamGames = steam.value ? steamSelection(steam.value, now) : [];
  const games = dedup([...board.epic, ...steamGames]).sort((a, b) => (a.end || Infinity) - (b.end || Infinity));
  const freshRadar = board.healthy && !radar.offline;
  const freshSteam = !!steam.value && !steam.offline;
  return { board, games, rules, freshRadar, freshSteam,
    alertable: [...(freshRadar ? [...board.epic, ...board.offers] : []), ...(freshSteam ? steamGames : [])] };
}

function parseFeed(xml) {
  const items = [];
  const paths = [];
  let item = null;
  let complete = false;
  let isRSS = false;
  const parser = new XMLParser(xml);
  parser.didStartElement = (name) => {
    paths.push(name);
    if (paths.length === 1) isRSS = name === 'rss';
    if (paths.join('/') === 'rss/channel/item') item = { title: '', link: '', pubDate: '' };
  };
  parser.foundCharacters = chars => {
    const key = paths[paths.length - 1];
    if (item && paths.length === 4 && ['title', 'link', 'pubDate'].includes(key)) item[key] += chars;
  };
  parser.didEndElement = () => {
    if (item && paths.length === 3 && paths[2] === 'item') {
      const url = safeLink(clean(item.link), ['gcores.com', 'www.gcores.com']);
      const title = clean(item.title);
      const at = isoTime(clean(item.pubDate));
      if (url && title && at && /\/articles\/\d+/.test(url)) items.push({ url, title, at, id: url.split('?')[0] });
      item = null;
    }
    paths.pop();
  };
  parser.didEndDocument = () => { complete = true; };
  parser.parse();
  if (!complete || !isRSS || !items.length) throw Error('RSS Orbit 没有可读取的新闻');
  return dedup(items).sort((a, b) => b.at - a.at).slice(0, 3);
}

function stamp(at, pattern = 'M/d HH:mm') {
  if (!at) return '—';
  const date = new DateFormatter();
  date.locale = 'en_US_POSIX';
  date.dateFormat = pattern;
  return date.string(new Date(at));
}

const DAY_SKIN = {
  background:'#F7FAFD', ink:'#152439', muted:'#465A72', brand:'#235497',
  deal:'#79500A', news:'#126254', reached:'#136450', warning:'#874918', rule:'#DEE7F0',
};
const NIGHT_SKIN = {
  background:'#111C2B', ink:'#F7FAFD', muted:'#C2D0DF', brand:'#B9D5FE',
  deal:'#FFE1A6', news:'#AFEADC', reached:'#AFEADC', warning:'#FFD4AA', rule:'#37485C',
};

function widgetColor(tone, compact) {
  const day = new Color(DAY_SKIN[tone]);
  return compact ? Color.dynamic(day, new Color(NIGHT_SKIN[tone])) : day;
}

function text(parent, value, size, color, lines = 1, bold = false) {
  const node = parent.addText(value);
  node.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  node.textColor = color;
  node.lineLimit = lines;
  node.minimumScaleFactor = 0.86;
  return node;
}

function card(title, accent, refresh, url, compact, status = '') {
  const widget = new ListWidget();
  const tone = name => widgetColor(name, compact);
  widget.backgroundColor = tone('background');
  widget.setPadding(11, 13, 11, 13);
  widget.refreshAfterDate = new Date(Date.now() + refresh * MIN);
  if (url) widget.url = url;
  const header = widget.addStack();
  header.centerAlignContent();
  text(header, title, 12, tone(accent), 1, true);
  if (status) {
    header.addSpacer();
    text(header, status, 10, tone('muted'));
  }
  widget.addSpacer(6);
  return { widget, tone };
}

function divider(widget, tone) {
  const line = widget.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = tone('rule');
}

function emptyState(card, title, detail) {
  const { widget, tone } = card;
  widget.addSpacer();
  text(widget, title, 18, tone('ink'), 2, true);
  widget.addSpacer(4);
  text(widget, detail, 12, tone('muted'), 2);
  widget.addSpacer();
  return widget;
}

function marketWidget(rows, compact, syncStatus = '本机清单') {
  const layout = card('投资行动卡', 'brand', 15, MARKET, compact, compact ? '' : syncStatus);
  const { widget, tone } = layout;
  if (!rows.length) return emptyState(layout, '自选股为空', '轻点打开 Daily Nexus');
  if (!rows.some(row => row.q)) return emptyState(layout, '暂无行情', '轻点打开 Daily Nexus');
  if (compact) {
    const row = rows[0];
    widget.addSpacer();
    text(widget, row.stock.symbol.split(':').pop(), 19, tone('ink'), 1, true);
    text(widget, formatQuote(row.q, row.q.price), 27, tone('ink'), 1, true);
    widget.addSpacer(4);
    const signal = tone(row.target?.reached ? 'reached' : 'brand');
    const [level, distance] = stockDetail(row).split(' · ');
    text(widget, level, 12, signal, 1, true);
    if (distance) text(widget, distance, 11, signal);
    widget.addSpacer();
    text(widget, row.state + ' · ' + stamp(row.q.at), 10, tone('muted'));
    if (syncStatus.startsWith('同步离线')) text(widget, '同步离线', 10, tone('warning'));
    return widget;
  }
  for (const [index, row] of rows.slice(0, 3).entries()) {
    if (index) {
      widget.addSpacer(3);
      divider(widget, tone);
      widget.addSpacer(3);
    }
    const line = widget.addStack();
    line.centerAlignContent();
    text(line, row.stock.symbol.split(':').pop(), 15, tone('ink'), 1, true);
    line.addSpacer(7);
    if (row.q) text(line, formatQuote(row.q, row.q.price), 15, tone('ink'), 1, true);
    line.addSpacer();
    text(line, stockDetail(row), 12, tone(row.target?.reached ? 'reached' : row.state === '旧行情' ? 'warning' : 'brand'));
    if (row.q) text(widget, row.state + ' · ' + stamp(row.q.at), 10, tone('muted'));
  }
  return widget;
}

function dealWidget(data, compact) {
  const { board, games, freshSteam, freshRadar } = data;
  const top = [games[0], board.offers[0]].filter(Boolean);
  if (top.length < 2 && games[1]) top.push(games[1]);
  if (top.length < 2 && board.offers[1]) top.push(board.offers[1]);
  const partial = !freshSteam || !freshRadar;
  const layout = card('免费游戏与大额 Deal', 'deal', 45, compact ? top[0]?.url || DEAL_BOARD : DEAL_BOARD, compact);
  const { widget, tone } = layout;
  if (!top.length) return emptyState(layout, partial ? '来源暂不可用' : '暂无符合条件的优惠',
    partial ? '轻点打开优惠雷达' : 'Steam / Epic · 优惠雷达');
  const visible = top.slice(0, compact ? 1 : 2);
  if (visible.length === 1) widget.addSpacer();
  for (const [index, item] of visible.entries()) {
    if (index) {
      widget.addSpacer(5);
      divider(widget, tone);
      widget.addSpacer(5);
    }
    const line = widget.addStack();
    line.layoutVertically();
    if (!compact) line.url = item.url;
    const size = compact ? 16 : visible.length === 1 ? 19 : 14;
    text(line, item.title, size, tone('ink'), compact ? 3 : 2, true);
    const label = item.end ? item.label + ' · 截止 ' + stamp(item.end)
      : item.kind === 'game' ? item.label + ' · 截止未公布' : item.label;
    text(line, label, 11, tone('deal'), compact ? 2 : 1);
  }
  if (partial || visible.length === 1) widget.addSpacer();
  if (partial) text(widget, '部分来源暂不可用', 10, tone('warning'));
  return widget;
}

function newsWidget(packet, compact) {
  const items = (packet.value ?? []).filter(item => item.at <= Date.now() + 5 * MIN);
  const layout = card('机核 · RSS Orbit', 'news', 60, compact ? items[0]?.url || RSS_BOARD : RSS_BOARD, compact);
  const { widget, tone } = layout;
  if (!items.length) return emptyState(layout, '暂无新闻', '轻点打开 RSS Orbit');
  widget.addSpacer();
  for (const [index, item] of items.slice(0, compact ? 1 : 2).entries()) {
    if (index) {
      widget.addSpacer(5);
      divider(widget, tone);
      widget.addSpacer(5);
    }
    const line = widget.addStack();
    line.layoutVertically();
    if (!compact) line.url = item.url;
    text(line, item.title, compact ? 20 : 15, tone('ink'), compact ? 3 : 2, true);
    const stale = packet.offline || Date.now() - item.at > 2 * DAY;
    if (!compact) text(line, (stale ? '缓存 · ' : '') + stamp(item.at), 10, tone('muted'));
  }
  widget.addSpacer();
  if (compact) {
    const stale = packet.offline || Date.now() - items[0].at > 2 * DAY;
    text(widget, (stale ? '缓存 · ' : '发布 · ') + stamp(items[0].at), 11, tone('muted'));
  }
  return widget;
}

async function notifyDeals(store) {
  const result = await dealData(store);
  const now = Date.now();
  const seen = Object.fromEntries(Object.entries(store.read('alerts') ?? {}).filter(([, at]) => now - at < 30 * DAY));
  const next = dedup(result.alertable).filter(item => !seen[item.id]).slice(0, 3);
  if (!next.length) return result.freshRadar && result.freshSteam ? '本次没有新的匹配活动。' : '本次没有可确认的新活动，部分来源暂不可用。';
  const notice = new Notification();
  notice.title = next.length === 1 ? next[0].label : '免费游戏与大额 Deal · ' + next.length + ' 条';
  notice.body = next.map(item => item.title).join('\n');
  notice.openURL = next.length === 1 ? next[0].url : DEAL_BOARD;
  await notice.schedule();
  for (const item of next) seen[item.id] = now;
  store.write('alerts', seen);
  return '已安排 ' + next.length + ' 条新活动的通知。';
}

async function alertBox(title, message) {
  const box = new Alert();
  box.title = title;
  box.message = message;
  box.addAction('好');
  await box.presentAlert();
}

async function importWatchlist(store) {
  const path = await DocumentPicker.openFile();
  if (!path) return;
  const manager = FileManager.local();
  if (manager.fileSize(path) > 24 * 1024 * 1024) throw Error('文件太大。请从 Daily Nexus 导出不带大背景图片的备份。');
  const value = importStocks(JSON.parse(manager.readString(path)));
  store.write('watchlist', value);
  const configured = value.stocks.filter(item => item.buy || item.sell).length;
  await alertBox('导入完成', '已导入 ' + value.stocks.length + ' 只，' + configured + ' 只带参考价。'
    + (syncConnection() ? '\n已连接网页，投资卡优先显示网页清单。' : '')
    + (value.ignored ? ' 有 ' + value.ignored + ' 只超额、重复或暂不支持。' : ''));
}

async function editRules(store) {
  const actions = new Alert();
  actions.title = 'Deal 关注价';
  actions.message = (store.read('deal-rules') ?? []).map(r => r.term + ' | ' + r.max).join('\n') || '还没有关注价。';
  actions.addAction('新增或更新一条');
  actions.addAction('从剪贴板替换全部');
  actions.addAction('清空关注价');
  actions.addCancelAction('返回');
  const action = await actions.presentAlert();
  if (action === 0) {
    const fields = new Alert();
    fields.title = '设置商品关注价';
    fields.addTextField('关键词，例如 Mini PC');
    fields.addTextField('美元最高价，例如 500');
    fields.addAction('保存');
    fields.addCancelAction('取消');
    if (await fields.presentAlert() !== 0) return;
    const [rule] = parseWatchRules(fields.textFieldValue(0) + '|' + fields.textFieldValue(1));
    const previous = store.read('deal-rules') ?? [];
    const updated = [...previous.filter(x => x.term !== rule.term), rule];
    if (updated.length > 15) throw Error('最多 15 条关键词。');
    store.write('deal-rules', updated);
  } else if (action === 1) {
    const raw = Pasteboard.pasteString();
    if (!raw?.trim()) throw Error('请先复制「关键词 | 最高美元价」，每行一条。');
    store.write('deal-rules', parseWatchRules(raw));
  } else if (action === 2) {
    const confirm = new Alert();
    confirm.title = '清空这部 iPhone 上的关注价？';
    confirm.addDestructiveAction('清空');
    confirm.addCancelAction('取消');
    if (await confirm.presentAlert() === 0) store.write('deal-rules', []);
  }
}

async function render(mode, store, compact, refreshWatchlist = false) {
  if (mode === 'invest') {
    const watchlist = await connectedWatchlist(store, refreshWatchlist);
    return marketWidget(await marketData(store, watchlist.stocks), compact, watchlist.status);
  }
  if (mode === 'deals') return dealWidget(await dealData(store), compact);
  if (mode === 'news') {
    const packet = await cached(store, 'news', 60 * MIN, async () => parseFeed(await load(RSS, 'xml')));
    return newsWidget(packet, compact);
  }
  return emptyState(card('PT Widgets', 'brand', 60, null, compact), '请选择卡片', '参数填 invest、deals 或 news');
}

async function main(checkForUpdate) {
  const store = makeStore();
  if (args.shortcutParameter === 'alerts') {
    Script.setShortcutOutput(await notifyDeals(store));
  } else if (config.runsInWidget) {
    if (config.widgetFamily?.startsWith('accessory')) {
      Script.setWidget(emptyState(card('PT Widgets', 'brand', 60, null, true), '请选择小号', '用于主屏幕或待机显示'));
    } else {
      Script.setWidget(await render(String(args.widgetParameter || '').trim().toLowerCase(), store, config.widgetFamily === 'small'));
    }
  } else {
    const menu = new Alert();
    menu.title = 'PT Widgets · v' + VERSION;
    menu.addAction('预览投资行动卡');
    menu.addAction('预览免费游戏与大额 Deal');
    menu.addAction('预览横屏版新闻');
    menu.addAction('导入 Daily Nexus 自选股');
    menu.addAction('设置 Deal 关注价');
    menu.addAction('检查本次优惠通知');
    menu.addAction('检查更新');
    menu.addAction('连接 Daily Nexus');
    menu.addCancelAction('关闭');
    const choice = await menu.presentSheet();
    try {
      if (choice >= 0 && choice <= 2) {
        const widget = await render(['invest', 'deals', 'news'][choice], store, choice === 2, choice === 0);
        if (choice === 2) await widget.presentSmall();
        else await widget.presentMedium();
      } else if (choice === 3) await importWatchlist(store);
      else if (choice === 4) await editRules(store);
      else if (choice === 5) await alertBox('优惠通知', await notifyDeals(store));
      else if (choice === 6) await alertBox('PT Widgets 更新', await checkForUpdate());
      else if (choice === 7) await pairWatchlist(store);
    } catch (error) {
      await alertBox('操作未完成', String(error.message || error));
    }
  }
}

// AES-GCM from @noble/ciphers 1.3.0 (aes.js), bundled for Scriptable.
// The updater downloads one self-contained runtime file.
/*
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)
Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var PTWidgetAES=(()=>{var W=Object.defineProperty;var ft=Object.getOwnPropertyDescriptor;var lt=Object.getOwnPropertyNames;var ut=Object.prototype.hasOwnProperty;var ht=(t,n)=>{for(var e in n)W(t,e,{get:n[e],enumerable:!0})},at=(t,n,e,o)=>{if(n&&typeof n=="object"||typeof n=="function")for(let r of lt(n))!ut.call(t,r)&&r!==e&&W(t,r,{get:()=>n[r],enumerable:!(o=ft(n,r))||o.enumerable});return t};var gt=t=>at(W({},"__esModule",{value:!0}),t);var Kt={};ht(Kt,{gcm:()=>rt});function F(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"}function pt(t){if(typeof t!="boolean")throw new Error(`boolean expected, not ${t}`)}function d(t,...n){if(!F(t))throw new Error("Uint8Array expected");if(n.length>0&&!n.includes(t.length))throw new Error("Uint8Array expected of length "+n+", got length="+t.length)}function C(t,n=!0){if(t.destroyed)throw new Error("Hash instance has been destroyed");if(n&&t.finished)throw new Error("Hash#digest() has already been called")}function V(t,n){d(t);let e=n.outputLen;if(t.length<e)throw new Error("digestInto() expects output buffer of length at least "+e)}function $(t){return new Uint8Array(t.buffer,t.byteOffset,t.byteLength)}function U(t){return new Uint32Array(t.buffer,t.byteOffset,Math.floor(t.byteLength/4))}function B(...t){for(let n=0;n<t.length;n++)t[n].fill(0)}function S(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}var yt=new Uint8Array(new Uint32Array([287454020]).buffer)[0]===68;function wt(t){if(typeof t!="string")throw new Error("string expected");return new Uint8Array(new TextEncoder().encode(t))}function T(t){if(typeof t=="string")t=wt(t);else if(F(t))t=_(t);else throw new Error("Uint8Array expected, got "+typeof t);return t}function G(t,n){if(t.length!==n.length)return!1;let e=0;for(let o=0;o<t.length;o++)e|=t[o]^n[o];return e===0}var J=(t,n)=>{function e(o,...r){if(d(o),!yt)throw new Error("Non little-endian hardware is not yet supported");if(t.nonceLength!==void 0){let u=r[0];if(!u)throw new Error("nonce / iv required");t.varSizeNonce?d(u):d(u,t.nonceLength)}let c=t.tagLength;c&&r[1]!==void 0&&d(r[1]);let f=n(o,...r),i=(u,h)=>{if(h!==void 0){if(u!==2)throw new Error("cipher output not supported");d(h)}},s=!1;return{encrypt(u,h){if(s)throw new Error("cannot encrypt() twice with same key + nonce");return s=!0,d(u),i(f.encrypt.length,h),f.encrypt(u,h)},decrypt(u,h){if(d(u),c&&u.length<c)throw new Error("invalid ciphertext length: smaller than tagLength="+c);return i(f.decrypt.length,h),f.decrypt(u,h)}}}return Object.assign(e,t),e};function Q(t,n,e=!0){if(n===void 0)return new Uint8Array(t);if(n.length!==t)throw new Error("invalid output length, expected "+t+", got: "+n.length);if(e&&!I(n))throw new Error("invalid output, must be aligned");return n}function z(t,n,e,o){if(typeof t.setBigUint64=="function")return t.setBigUint64(n,e,o);let r=BigInt(32),c=BigInt(4294967295),f=Number(e>>r&c),i=Number(e&c),s=o?4:0,l=o?0:4;t.setUint32(n+s,f,o),t.setUint32(n+l,i,o)}function X(t,n,e){pt(e);let o=new Uint8Array(16),r=S(o);return z(r,0,BigInt(n),e),z(r,8,BigInt(t),e),o}function I(t){return t.byteOffset%4===0}function _(t){return Uint8Array.from(t)}var L=16,Z=new Uint8Array(16),A=U(Z),dt=225,bt=(t,n,e,o)=>{let r=o&1;return{s3:e<<31|o>>>1,s2:n<<31|e>>>1,s1:t<<31|n>>>1,s0:t>>>1^dt<<24&-(r&1)}},x=t=>(t>>>0&255)<<24|(t>>>8&255)<<16|(t>>>16&255)<<8|t>>>24&255|0;function xt(t){t.reverse();let n=t[15]&1,e=0;for(let o=0;o<t.length;o++){let r=t[o];t[o]=r>>>1|e,e=(r&1)<<7}return t[0]^=-n&225,t}var Et=t=>t>64*1024?8:t>1024?4:2,N=class{constructor(n,e){this.blockLen=L,this.outputLen=L,this.s0=0,this.s1=0,this.s2=0,this.s3=0,this.finished=!1,n=T(n),d(n,16);let o=S(n),r=o.getUint32(0,!1),c=o.getUint32(4,!1),f=o.getUint32(8,!1),i=o.getUint32(12,!1),s=[];for(let p=0;p<128;p++)s.push({s0:x(r),s1:x(c),s2:x(f),s3:x(i)}),{s0:r,s1:c,s2:f,s3:i}=bt(r,c,f,i);let l=Et(e||1024);if(![1,2,4,8].includes(l))throw new Error("ghash: invalid window size, expected 2, 4 or 8");this.W=l;let h=128/l,a=this.windowSize=2**l,g=[];for(let p=0;p<h;p++)for(let w=0;w<a;w++){let b=0,E=0,y=0,v=0;for(let m=0;m<l;m++){if(!(w>>>l-m-1&1))continue;let{s0:H,s1:st,s2:ct,s3:it}=s[l*p+m];b^=H,E^=st,y^=ct,v^=it}g.push({s0:b,s1:E,s2:y,s3:v})}this.t=g}_updateBlock(n,e,o,r){n^=this.s0,e^=this.s1,o^=this.s2,r^=this.s3;let{W:c,t:f,windowSize:i}=this,s=0,l=0,u=0,h=0,a=(1<<c)-1,g=0;for(let p of[n,e,o,r])for(let w=0;w<4;w++){let b=p>>>8*w&255;for(let E=8/c-1;E>=0;E--){let y=b>>>c*E&a,{s0:v,s1:m,s2:K,s3:H}=f[g*i+y];s^=v,l^=m,u^=K,h^=H,g+=1}}this.s0=s,this.s1=l,this.s2=u,this.s3=h}update(n){C(this),n=T(n),d(n);let e=U(n),o=Math.floor(n.length/L),r=n.length%L;for(let c=0;c<o;c++)this._updateBlock(e[c*4+0],e[c*4+1],e[c*4+2],e[c*4+3]);return r&&(Z.set(n.subarray(o*L)),this._updateBlock(A[0],A[1],A[2],A[3]),B(A)),this}destroy(){let{t:n}=this;for(let e of n)e.s0=0,e.s1=0,e.s2=0,e.s3=0}digestInto(n){C(this),V(n,this),this.finished=!0;let{s0:e,s1:o,s2:r,s3:c}=this,f=U(n);return f[0]=e,f[1]=o,f[2]=r,f[3]=c,n}digest(){let n=new Uint8Array(L);return this.digestInto(n),this.destroy(),n}},j=class extends N{constructor(n,e){n=T(n),d(n);let o=xt(_(n));super(o,e),B(o)}update(n){n=T(n),C(this);let e=U(n),o=n.length%L,r=Math.floor(n.length/L);for(let c=0;c<r;c++)this._updateBlock(x(e[c*4+3]),x(e[c*4+2]),x(e[c*4+1]),x(e[c*4+0]));return o&&(Z.set(n.subarray(r*L)),this._updateBlock(x(A[3]),x(A[2]),x(A[1]),x(A[0])),B(A)),this}digestInto(n){C(this),V(n,this),this.finished=!0;let{s0:e,s1:o,s2:r,s3:c}=this,f=U(n);return f[0]=e,f[1]=o,f[2]=r,f[3]=c,n.reverse()}};function tt(t){let n=(o,r)=>t(r,o.length).update(T(o)).digest(),e=t(new Uint8Array(16),0);return n.outputLen=e.outputLen,n.blockLen=e.blockLen,n.create=(o,r)=>t(o,r),n}var q=tt((t,n)=>new N(t,n)),mt=tt((t,n)=>new j(t,n));var Y=16,Ut=4,M=new Uint8Array(Y),Bt=283;function D(t){return t<<1^Bt&-(t>>7)}function nt(t,n){let e=0;for(;n>0;n>>=1)e^=t&-(n&1),t=D(t);return e}var At=(()=>{let t=new Uint8Array(256);for(let e=0,o=1;e<256;e++,o^=D(o))t[e]=o;let n=new Uint8Array(256);n[0]=99;for(let e=0;e<255;e++){let o=t[255-e];o|=o<<8,n[t[e]]=(o^o>>4^o>>5^o>>6^o>>7^99)&255}return B(t),n})();var Lt=t=>t<<24|t>>>8,R=t=>t<<8|t>>>24;function _t(t,n){if(t.length!==256)throw new Error("Wrong sbox length");let e=new Uint32Array(256).map((l,u)=>n(t[u])),o=e.map(R),r=o.map(R),c=r.map(R),f=new Uint32Array(256*256),i=new Uint32Array(256*256),s=new Uint16Array(256*256);for(let l=0;l<256;l++)for(let u=0;u<256;u++){let h=l*256+u;f[h]=e[l]^o[u],i[h]=r[l]^c[u],s[h]=t[l]<<8|t[u]}return{sbox:t,sbox2:s,T0:e,T1:o,T2:r,T3:c,T01:f,T23:i}}var ot=_t(At,t=>nt(t,3)<<24|t<<16|t<<8|nt(t,2));var vt=(()=>{let t=new Uint8Array(16);for(let n=0,e=1;n<16;n++,e=D(e))t[n]=e;return t})();function St(t){d(t);let n=t.length;if(![16,24,32].includes(n))throw new Error("aes: invalid key size, should be 16, 24 or 32, got "+n);let{sbox2:e}=ot,o=[];I(t)||o.push(t=_(t));let r=U(t),c=r.length,f=s=>O(e,s,s,s,s),i=new Uint32Array(n+28);i.set(r);for(let s=c;s<i.length;s++){let l=i[s-1];s%c===0?l=f(Lt(l))^vt[s/c-1]:c>6&&s%c===4&&(l=f(l)),i[s]=i[s-c]^l}return B(...o),i}function P(t,n,e,o,r,c){return t[e<<8&65280|o>>>8&255]^n[r>>>8&65280|c>>>24&255]}function O(t,n,e,o,r){return t[n&255|e&65280]|t[o>>>16&255|r>>>16&65280]<<16}function et(t,n,e,o,r){let{sbox2:c,T01:f,T23:i}=ot,s=0;n^=t[s++],e^=t[s++],o^=t[s++],r^=t[s++];let l=t.length/4-2;for(let p=0;p<l;p++){let w=t[s++]^P(f,i,n,e,o,r),b=t[s++]^P(f,i,e,o,r,n),E=t[s++]^P(f,i,o,r,n,e),y=t[s++]^P(f,i,r,n,e,o);n=w,e=b,o=E,r=y}let u=t[s++]^O(c,n,e,o,r),h=t[s++]^O(c,e,o,r,n),a=t[s++]^O(c,o,r,n,e),g=t[s++]^O(c,r,n,e,o);return{s0:u,s1:h,s2:a,s3:g}}function k(t,n,e,o,r){d(e,Y),d(o),r=Q(o.length,r);let c=e,f=U(c),i=S(c),s=U(o),l=U(r),u=n?0:12,h=o.length,a=i.getUint32(u,n),{s0:g,s1:p,s2:w,s3:b}=et(t,f[0],f[1],f[2],f[3]);for(let y=0;y+4<=s.length;y+=4)l[y+0]=s[y+0]^g,l[y+1]=s[y+1]^p,l[y+2]=s[y+2]^w,l[y+3]=s[y+3]^b,a=a+1>>>0,i.setUint32(u,a,n),{s0:g,s1:p,s2:w,s3:b}=et(t,f[0],f[1],f[2],f[3]);let E=Y*Math.floor(s.length/Ut);if(E<h){let y=new Uint32Array([g,p,w,b]),v=$(y);for(let m=E,K=0;m<h;m++,K++)r[m]=o[m]^v[K];B(y)}return r}function Tt(t,n,e,o,r){let c=r?r.length:0,f=t.create(e,o.length+c);r&&f.update(r);let i=X(8*o.length,8*c,n);f.update(o),f.update(i);let s=f.digest();return B(i),s}var rt=J({blockSize:16,nonceLength:12,tagLength:16,varSizeNonce:!0},function(n,e,o){if(e.length<8)throw new Error("aes/gcm: invalid nonce length");let r=16;function c(i,s,l){let u=Tt(q,!1,i,l,o);for(let h=0;h<s.length;h++)u[h]^=s[h];return u}function f(){let i=St(n),s=M.slice(),l=M.slice();if(k(i,!1,l,l,s),e.length===12)l.set(e);else{let h=M.slice(),a=S(h);z(a,8,BigInt(e.length*8),!1);let g=q.create(s).update(e).update(h);g.digestInto(l),g.destroy()}let u=k(i,!1,l,M);return{xk:i,authKey:s,counter:l,tagMask:u}}return{encrypt(i){let{xk:s,authKey:l,counter:u,tagMask:h}=f(),a=new Uint8Array(i.length+r),g=[s,l,u,h];I(i)||g.push(i=_(i)),k(s,!1,u,i,a.subarray(0,i.length));let p=c(l,h,a.subarray(0,a.length-r));return g.push(p),a.set(p,i.length),B(...g),a},decrypt(i){let{xk:s,authKey:l,counter:u,tagMask:h}=f(),a=[s,l,h,u];I(i)||a.push(i=_(i));let g=i.subarray(0,-r),p=i.subarray(-r),w=c(l,h,g);if(a.push(w),!G(w,p))throw new Error("aes/gcm: invalid ghash tag");let b=k(s,!1,u,g);return B(...a),b}}});return gt(Kt);})();
/*! Bundled license information:

@noble/ciphers/esm/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)
*/

module.exports = { api: 1, version: VERSION, main };
