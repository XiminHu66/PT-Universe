const day = 86400000;
const ticker = /^[A-Z][A-Z0-9.^-]{0,14}$/;
const sources = {
  'disclosures-clerk.house.gov': {name:'众院原文', path:/^\/public_disc\/ptr-pdfs\/\d{4}\/\d+\.pdf$/i},
  'efdsearch.senate.gov': {name:'参院原文', path:/^\/search\/view\/ptr\/[a-f0-9-]+\/?$/i},
  'www.sec.gov': {name:'SEC 原文', path:/^\/Archives\/edgar\/data\/\d+\/\d+\/[\w.-]+$/i}
};

function validDay(value, latest) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > latest) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value + 'T');
}

function officialLink(value, type) {
  try {
    const url = new URL(value);
    const source = sources[url.hostname];
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !source?.path.test(url.pathname)) return null;
    if ((url.hostname === 'www.sec.gov') !== (type === '13f')) return null;
    return {url:url.origin + url.pathname, name:source.name};
  } catch { return null; }
}

function recordsFor(source, latest) {
  const seen = new Set(), trades = [];
  let invalid = 0, duplicates = 0;
  for (const trade of Array.isArray(source.trades) ? source.trades : []) {
    if (typeof trade?.ticker !== 'string' || !ticker.test(trade.ticker) || !validDay(trade.transactionDate, latest) ||
        !validDay(trade.disclosureDate, latest) || trade.transactionDate > trade.disclosureDate || typeof trade.type !== 'string' || !trade.type) {
      invalid++;
      continue;
    }
    const filing = officialLink(trade.sourceLink, 'congress');
    const key = JSON.stringify([filing?.url || trade.sourceLink, trade.ticker, trade.transactionDate,
      trade.disclosureDate, trade.type, trade.owner, trade.assetType, trade.amountLabel]);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    trades.push({...trade, filing, lag:(Date.parse(trade.disclosureDate)-Date.parse(trade.transactionDate))/day});
  }
  return {trades, invalid, duplicates};
}

function quarterFor(source, latest) {
  const quarter = source.snapshot;
  if (!validDay(quarter?.periodEnd, latest) || !validDay(quarter?.filedAt, latest) || quarter.periodEnd > quarter.filedAt) return null;
  const sameQuarter = Array.isArray(source.filingHistory) ? source.filingHistory.find(f => f?.filedAt === quarter.filedAt &&
    (!quarter.periodLabel || !f.periodLabel || f.periodLabel === quarter.periodLabel)) : null;
  const filing = officialLink(sameQuarter?.sourceUrl, '13f');
  const holdings = (Array.isArray(quarter.holdings) ? quarter.holdings : []).filter(item => item && (typeof item.ticker === 'string' && ticker.test(item.ticker) || typeof item.issuerName === 'string' && item.issuerName));
  return {...quarter, filing, holdings};
}

export function normalizeDisclosures(payload, now = Date.now()) {
  const generated = Date.parse(payload?.generatedAt);
  if (!Number.isFinite(generated) || generated > now + 5 * 60000 || !Array.isArray(payload.sources) || !payload.sources.length) return null;
  const latest = new Date(now).toISOString().slice(0, 10);
  const ids = new Set();
  const checked = [];
  for (const source of payload.sources) {
    if (typeof source?.id !== 'string' || !source.id || typeof source.name !== 'string' || !source.name || ids.has(source.id) || !['congress','13f'].includes(source.kind)) continue;
    ids.add(source.id);
    if (source.kind === 'congress') {
      const records = recordsFor(source, latest);
      checked.push({...source, ...records, ok:source.ok && (!records.invalid || records.trades.length > 0)});
    }
    else checked.push({...source, snapshot:quarterFor(source, latest)});
  }
  return checked.length ? {generatedAt:payload.generatedAt,sources:checked} : null;
}

export function keepAvailableSources(previous, incoming) {
  if (!previous) return incoming;
  const next = new Map(incoming.sources.map(source => [source.id, source]));
  for (const source of previous.sources) {
    const current = next.get(source.id);
    const missing = !current || (source.kind === '13f' && !current.snapshot && source.snapshot) ||
      (source.kind === 'congress' && !current.trades.length && source.trades.length && (!current.ok || current.invalid));
    if (missing) next.set(source.id,{...source,ok:false,error:'本次来源缺失或格式异常，保留上次数据'});
  }
  return {...incoming, sources:[...next.values()]};
}
