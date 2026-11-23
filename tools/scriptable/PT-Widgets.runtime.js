// PT Widgets runtime v1
const VERSION = 1;
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

function importStocks(data) {
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
  if (!imported.length) throw Error('备份里没有可读取的标的。');
  // Keep manual levels ahead of the rest when a long watchlist exceeds the per-run quote budget.
  imported.sort((a, b) => Number(Boolean(b.buy || b.sell)) - Number(Boolean(a.buy || a.sell)));
  return { stocks: imported.slice(0, 20), ignored: ignored + Math.max(0, imported.length - 20) };
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

async function marketData(store) {
  const stocks = store.read('watchlist')?.stocks ?? DEFAULT_STOCKS;
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

function text(parent, value, size, color = '#F3F6FF', lines = 1, bold = false) {
  const node = parent.addText(value);
  node.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  node.textColor = new Color(color);
  node.lineLimit = lines;
  node.minimumScaleFactor = 0.8;
  return node;
}

function card(title, accent, refresh, url = null) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#131B2B');
  widget.setPadding(12, 13, 12, 13);
  widget.refreshAfterDate = new Date(Date.now() + refresh * MIN);
  if (url) widget.url = url;
  text(widget, title, 12, accent, 1, true);
  widget.addSpacer(6);
  return widget;
}

function footer(widget, value) {
  widget.addSpacer();
  text(widget, value, 10, '#B5C1D5');
}

function emptyState(widget, title, detail) {
  widget.addSpacer();
  text(widget, title, 19, '#F3F6FF', 2, true);
  widget.addSpacer(4);
  text(widget, detail, 12, '#B5C1D5', 2);
  widget.addSpacer();
  return widget;
}

function marketWidget(rows, compact) {
  const widget = card('投资行动卡', '#9CB9FF', 15, MARKET);
  if (compact) {
    const row = rows[0];
    if (!row?.q) return emptyState(widget, '暂无行情', '轻点打开 Daily Nexus');
    widget.addSpacer();
    text(widget, row.stock.label, 20, '#F3F6FF', 1, true);
    text(widget, formatQuote(row.q, row.q.price), 24, '#F3F6FF', 1, true);
    widget.addSpacer(4);
    text(widget, stockDetail(row), 11, '#B8CCFF', 2);
    footer(widget, row.state + ' · ' + stamp(row.q.at));
    return widget;
  }
  if (!rows.some(row => row.q)) return emptyState(widget, '暂无行情', '轻点打开 Daily Nexus');
  for (const row of rows.slice(0, 3)) {
    const line = widget.addStack();
    line.centerAlignContent();
    text(line, row.stock.label, 14, '#F3F6FF', 1, true);
    line.addSpacer(5);
    if (row.q) text(line, formatQuote(row.q, row.q.price), 14, '#F3F6FF', 1, true);
    line.addSpacer();
    text(line, stockDetail(row), 11, '#B8CCFF');
    if (row.q) text(widget, row.state + ' · ' + stamp(row.q.at), 9, '#B5C1D5');
    widget.addSpacer(4);
  }
  footer(widget, 'Yahoo Finance · 常规盘报价');
  return widget;
}

function dealWidget(data, compact) {
  const { board, games, freshSteam, freshRadar } = data;
  const top = [games[0], board.offers[0]].filter(Boolean);
  if (top.length < 2 && games[1]) top.push(games[1]);
  if (top.length < 2 && board.offers[1]) top.push(board.offers[1]);
  const partial = !freshSteam || !freshRadar;
  const widget = card('免费游戏与大额 Deal', '#FFD58F', 45, compact ? top[0]?.url || DEAL_BOARD : DEAL_BOARD);
  if (!top.length) return emptyState(widget, partial ? '来源暂不可用' : '暂无符合条件的优惠',
    partial ? '轻点打开优惠雷达' : 'Steam / Epic · 优惠雷达');
  for (const item of top.slice(0, compact ? 1 : 2)) {
    const line = widget.addStack();
    line.layoutVertically();
    if (!compact) line.url = item.url;
    text(line, item.title, compact ? 18 : 15, '#F3F6FF', compact ? 3 : 1, true);
    const label = item.end ? item.label + ' · 截止 ' + stamp(item.end)
      : item.kind === 'game' ? item.label + ' · 截止未公布' : item.label;
    text(line, label, compact ? 11 : 12, '#FFC77A', compact ? 2 : 1);
    widget.addSpacer(7);
  }
  footer(widget, (partial ? '部分来源暂不可用 · ' : '雷达更新 · ') + stamp(board.at));
  return widget;
}

function newsWidget(packet, compact) {
  const items = (packet.value ?? []).filter(item => item.at <= Date.now() + 5 * MIN);
  const widget = card('机核 · RSS Orbit', '#A5EBDC', 60, compact ? items[0]?.url || RSS_BOARD : RSS_BOARD);
  if (!items.length) return emptyState(widget, '暂无新闻', '轻点打开 RSS Orbit');
  widget.addSpacer();
  for (const item of items.slice(0, compact ? 1 : 2)) {
    const line = widget.addStack();
    line.layoutVertically();
    if (!compact) line.url = item.url;
    text(line, item.title, compact ? 23 : 16, '#F3F6FF', compact ? 4 : 1, true);
    if (!compact) text(line, stamp(item.at), 11, '#B5C1D5');
    widget.addSpacer(compact ? 5 : 7);
  }
  if (compact) {
    const stale = packet.offline || Date.now() - items[0].at > 2 * DAY;
    footer(widget, (stale ? '缓存 · ' : '发布 · ') + stamp(items[0].at));
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

async function render(mode, store, compact) {
  if (mode === 'invest') return marketWidget(await marketData(store), compact);
  if (mode === 'deals') return dealWidget(await dealData(store), compact);
  if (mode === 'news') {
    const packet = await cached(store, 'news', 60 * MIN, async () => parseFeed(await load(RSS, 'xml')));
    return newsWidget(packet, compact);
  }
  return emptyState(card('PT Widgets', '#9CB9FF', 60), '请选择卡片', '参数填 invest、deals 或 news');
}

async function main(checkForUpdate) {
  const store = makeStore();
  if (args.shortcutParameter === 'alerts') {
    Script.setShortcutOutput(await notifyDeals(store));
  } else if (config.runsInWidget) {
    if (config.widgetFamily?.startsWith('accessory')) {
      Script.setWidget(emptyState(card('PT Widgets', '#9CB9FF', 60), '请选择小号', '用于主屏幕或待机显示'));
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
    menu.addCancelAction('关闭');
    const choice = await menu.presentSheet();
    try {
      if (choice >= 0 && choice <= 2) {
        const widget = await render(['invest', 'deals', 'news'][choice], store, choice === 2);
        if (choice === 2) await widget.presentSmall();
        else await widget.presentMedium();
      } else if (choice === 3) await importWatchlist(store);
      else if (choice === 4) await editRules(store);
      else if (choice === 5) await alertBox('优惠通知', await notifyDeals(store));
      else if (choice === 6) await alertBox('PT Widgets 更新', await checkForUpdate());
    } catch (error) {
      await alertBox('操作未完成', String(error.message || error));
    }
  }
}

module.exports = { api: 1, version: VERSION, main };
