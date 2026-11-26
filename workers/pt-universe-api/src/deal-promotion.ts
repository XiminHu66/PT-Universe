import { parseDocument } from 'htmlparser2';
import { findAll, findOne, isTag, textContent } from 'domutils';
import { merchantProduct, priceValue, PROMOTION_SOURCES, safeHttps, type Lead, type PromotionSource, type Quote } from '../../../services/deal-radar/src/lib/promotion';
import { dealPrice, priceFromTitle, type DealPrice } from '../../../services/deal-radar/src/lib/promotion-pricing';
import { verifyMonitorToken } from './monitor';

const ORIGIN = 'https://ximinhu66.github.io';
const BASE = '/api/deal-radar/promo/';
const REVISION = 'manual-promotion-v2';
const headers = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
type Env = { DB: D1Database };

function plain(html: string) {
  return textContent(parseDocument(html).children).replace(/\s+/g, ' ').trim();
}

function compact(value: unknown, length = 240) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, length) : '';
}

type Structured = Record<string, unknown>;
function record(value: unknown): Structured | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Structured : null;
}

function nodes(value: unknown, depth = 0): Structured[] {
  if (depth >= 5) return [];
  if (Array.isArray(value)) return value.slice(0, 100).flatMap(child => nodes(child, depth + 1));
  const node = record(value);
  return node ? [node, ...nodes(node['@graph'], depth + 1)] : [];
}

function structuredData(html: string): Structured[] {
  const scripts = html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi);
  const output: Structured[] = [];
  for (const script of scripts) {
    if (script[1].length > 220_000) continue;
    try { output.push(...nodes(JSON.parse(script[1]))); } catch { /* Skip invalid scripts independently. */ }
    if (output.length > 120) break;
  }
  return output;
}

function isType(node: Structured, type: string) {
  const raw = node['@type'];
  return raw === type || (Array.isArray(raw) && raw.includes(type));
}

function sourceLink(value: unknown, source: PromotionSource): string | null {
  if (typeof value !== 'string') return null;
  try {
    const absolute = new URL(value, PROMOTION_SOURCES[source].url);
    const url = safeHttps(absolute.href);
    if (!url || url.hostname.replace(/^www\./, '') !== new URL(PROMOTION_SOURCES[source].url).hostname.replace(/^www\./, '')) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function parsePromotionSource(html: string, source: PromotionSource): Lead[] {
  const byUrl = new Map<string, Lead>();
  const add = (value: unknown, name: unknown, extras: Pick<Lead, 'publishedAt' | 'detail' | 'offer' | 'validFrom' | 'validUntil'> = {}) => {
    const url = sourceLink(value, source);
    const title = compact(name);
    if (!url || !title || byUrl.has(url) || byUrl.size >= 32) return;
    byUrl.set(url, { source, url, title, ...extras });
  };

  if (source === 'slickdeals') {
    if (!/<rss[\s>]/i.test(html.slice(0, 600))) throw Error('订阅源返回了其他页面');
    const xml = parseDocument(html, { xmlMode: true });
    for (const item of findAll(tag => tag.name === 'item', xml.children).slice(0, 32)) {
      const field = (name: string) => {
        const child = findOne(tag => tag.name === name, item.children, false);
        return child ? textContent(child) : '';
      };
      const published = Date.parse(field('pubDate'));
      const title = field('title');
      add(field('link'), title, {
        publishedAt: Number.isFinite(published) && published <= Date.now() ? published : undefined,
        offer: priceFromTitle(title, plain(field('description').slice(0, 3500))),
      });
    }
  } else if (source === 'dealmoon') {
    const collection = structuredData(html).find(node => isType(node, 'CollectionPage'));
    const items = record(collection?.mainEntity)?.itemListElement;
    if (Array.isArray(items)) for (const row of items.slice(0, 32)) {
      const item = record(record(row)?.item);
      const offer = record(item?.offers);
      const name = compact(item?.name);
      add(item?.url, name, { detail: compact(record(offer?.seller)?.name, 130) || undefined, offer: priceFromTitle(name) });
    }
  } else if (source === 'bestbuy') {
    const cards = /<a\b(?=[^>]*data-testid="offer-card-body-copy-link")[^>]*href="([^"]+)"[^>]*>([\s\S]{1,2500}?)<\/a>/gi;
    for (const card of html.matchAll(cards)) {
      const title = plain(card[2]);
      add(card[1], title, { offer: priceFromTitle(title) });
    }
  } else {
    // Retailer HTML has a second copy in hydration scripts. The main content
    // attaches each price and date to its own product card.
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    const content = parseDocument(main ?? html);
    const isProductLink = (href = '') => /^(?:https:\/\/www\.costco\.com)?\/p\/[^?#]+\/\d+\/?$/i.test(href);
    const anchors = findAll(tag => tag.name === 'a' && isProductLink(tag.attribs.href), content.children);
    for (const anchor of anchors) {
      const title = compact(textContent(anchor));
      if (!title || /^(?:buy online|shop now|view details)$/i.test(title)) continue;
      let card = anchor.parent;
      while (card && isTag(card) && card.attribs['data-testid'] !== 'Grid') card = card.parent;
      const attrs = (testId: string) => card && isTag(card)
        ? findOne(tag => tag.attribs['data-testid'] === testId, card.children, true)
        : null;
      const price = attrs('Text_prices_and_percentages_prices');
      const prefix = attrs('Text_prices_and_percentages_prepend_text');
      const suffix = attrs('Text_prices_and_percentages_append_text');
      const dollars = priceValue(price ? textContent(price).replace(/\s/g, '') : undefined) ?? undefined;
      const extra = suffix ? compact(textContent(suffix)) : '';
      const savings = extra.match(/^after\s+\$([\d,.]+)\s+off$/i);
      const saved = savings ? priceValue(savings[1]) ?? undefined : undefined;
      const onlySavings = !!prefix && /save/i.test(textContent(prefix));
      const body = card && isTag(card) ? compact(textContent(card), 1000) : '';
      const scope: DealPrice['scope'] = /warehouse\s*&\s*online/i.test(body) ? 'both' :
        /online only/i.test(body) ? 'online' : /warehouse only/i.test(body) ? 'warehouse' : undefined;
      const dates = body.match(/valid\s+(\d{1,2})\/(\d{1,2})\/((?:\d{4}|\d{2}))\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/((?:\d{4}|\d{2}))/i);
      const date = (offset: number) => dates && `${dates[offset + 2].padStart(4, '20')}-${dates[offset].padStart(2, '0')}-${dates[offset + 1].padStart(2, '0')}`;
      add(anchor.attribs.href, title, {
        offer: dealPrice({
          current: onlySavings ? undefined : dollars,
          savings: onlySavings ? dollars : saved,
          original: !onlySavings && dollars !== undefined && saved !== undefined ? dollars + saved : undefined,
          basis: 'before-promo', scope,
          kind: /price varies by size/i.test(body) ? 'from' : 'exact',
        }),
        validFrom: date(1) ?? undefined, validUntil: date(4) ?? undefined,
      });
    }
  }

  if (!byUrl.size) throw Error('没有读到可识别的优惠，请打开来源核对');
  return [...byUrl.values()];
}

export function parsePromotionQuote(html: string, product: NonNullable<ReturnType<typeof merchantProduct>>, checkedAt: number): Quote {
  const candidates = structuredData(html).filter(node => isType(node, 'Product'));
  type Product = NonNullable<ReturnType<typeof merchantProduct>>;
  function fromUrl(raw: unknown) {
    if (typeof raw !== 'string') return null;
    try { return merchantProduct(new URL(raw, product.url).href); }
    catch { return null; }
  }
  function matches(ref: Product, sku: string) {
    if (ref.key === product.key) return true;
    if (!product.bestBuy || !ref.bestBuy) return false;
    if (product.bestBuy.sku && (ref.bestBuy.sku ?? sku) !== product.bestBuy.sku) return false;
    if (product.bestBuy.code) return ref.bestBuy.code === product.bestBuy.code;
    return !!product.bestBuy.sku && sku === product.bestBuy.sku;
  }
  const identified = candidates.filter(node => {
    const offer = Array.isArray(node.offers) ? record(node.offers[0]) : record(node.offers);
    return [node.url, node['@id'], offer?.url].map(fromUrl)
      .some(ref => ref && matches(ref, compact(node.sku)));
  });
  const candidate = identified.length === 1 ? identified[0] :
    !product.bestBuy && identified.length === 0 && candidates.length === 1 ? candidates[0] : null;
  if (!candidate) throw Error('商家未给出唯一商品报价');
  const sku = compact(candidate.sku);
  const options = (Array.isArray(candidate.offers) ? candidate.offers : [candidate.offers]).map(record);
  const offers = product.bestBuy ? options.filter(offer =>
    sku && offer?.sku === sku && record(offer.seller)?.name === 'Best Buy' &&
    compact(offer.itemCondition).split('/').pop() === 'NewCondition',
  ) : options;
  const offer = offers.length === 1 ? offers[0] : null;
  const name = compact(candidate.name);
  const price = priceValue(offer?.price);
  if (!name || !offer || !isType(offer, 'Offer') || offer.priceCurrency !== 'USD' || price === null) throw Error('商家未给出单一美元售价');
  const identities = [candidate.url, candidate['@id'], offer.url].map(fromUrl);
  if (identities.some(ref => ref && !matches(ref, sku))) throw Error('商家返回了其他规格');
  const validUntil = compact(offer.priceValidUntil);
  if (validUntil && Number.isFinite(Date.parse(validUntil)) && Date.parse(validUntil) + 86_400_000 < checkedAt) throw Error('报价已过期');
  const condition = compact(offer.itemCondition).split('/').pop();
  if (condition && condition !== 'NewCondition') throw Error('商家报价属于二手或翻新商品');
  const stock = compact(offer.availability).split('/').pop();
  const availability = stock === 'InStock' || stock === 'OnlineOnly' ? 'in-stock' :
    stock === 'OutOfStock' || stock === 'SoldOut' || stock === 'Discontinued' ? 'out-of-stock' : 'unknown';
  return { name, price, availability, checkedAt, url: product.url };
}

async function limitedText(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('来源没有返回内容');
  const decoder = new TextDecoder();
  const pieces: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return pieces.join('') + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) throw Error('来源页面超过读取上限');
      pieces.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function upstream(url: string, limit: number) {
  const response = await fetch(url, {
    redirect: 'manual', signal: AbortSignal.timeout(12_000),
    headers: { accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.7', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 (compatible; PTUniverseDealRadar/1.0)' },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw Error(response.status >= 300 && response.status < 400 ? '来源要求跳转，请打开原页核对' : `来源返回 HTTP ${response.status}`);
  }
  return limitedText(response, limit);
}

async function reserve(db: D1Database, key: string, limit: number, step: number) {
  await db.prepare('CREATE TABLE IF NOT EXISTS deal_promotion_budget (key TEXT PRIMARY KEY, window INTEGER NOT NULL, n INTEGER NOT NULL)').run();
  const window = Math.floor(Date.now() / step);
  const result = await db.prepare(`INSERT INTO deal_promotion_budget(key,window,n) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET n=CASE WHEN window=excluded.window THEN n+1 ELSE 1 END,window=excluded.window
    WHERE window<excluded.window OR (window=excluded.window AND n<?)`).bind(key, window, limit).run();
  return result.meta.changes === 1;
}

function out(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export async function dealPromotionRoute(request: Request, url: URL, env: Env) {
  const id = url.pathname.slice(BASE.length);
  if (url.search || (id !== 'quote' && id !== 'status' && !Object.hasOwn(PROMOTION_SOURCES, id))) return out({ error: '未找到来源' }, 404);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (id === 'status') return request.method === 'GET' ? out({ revision: REVISION }) : out({ error: '仅可读取状态' }, 405);
  if (request.method !== 'POST') return out({ error: '请手动刷新' }, 405);
  if (request.headers.get('origin') !== ORIGIN) return out({ error: '刷新来源无效' }, 403);
  let product: ReturnType<typeof merchantProduct> = null;
  if (id === 'quote') {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
    if (token.length > 2500 || !await verifyMonitorToken(token)) return out({ error: '请连接 PT 私有后台后核价' }, 401);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return out({ error: '缺少商品链接' }, 400);
    try {
      const raw = JSON.parse(await limitedText(new Response(request.body), 1500));
      product = merchantProduct(raw.url);
    } catch { return out({ error: '商品链接无效' }, 400); }
    if (!product) return out({ error: '该链接暂不支持自动核价' }, 400);
  }
  const source = id as PromotionSource;
  // Fixed source lanes and one global owner quote budget are shared across edge locations.
  try {
    const allowed = product ? await reserve(env.DB, id, 40, 86_400_000) :
      await reserve(env.DB, id, 3, 300_000) && await reserve(env.DB, id + ':day', 36, 86_400_000);
    if (!allowed) {
      return out({ error: product ? '今日商品核价额度已用完' : '来源刷新过于频繁，请稍后重试' }, 429);
    }
  } catch {
    return out({ error: '暂时无法确认刷新额度，请稍后重试' }, 503);
  }
  try {
    if (product) {
      const html = await upstream(product.url, product.key.startsWith('costco.com/') ? 4_000_000 : 2_500_000);
      return out({ quote: parsePromotionQuote(html, product, Date.now()) });
    }
    const html = await upstream(PROMOTION_SOURCES[source].url, source === 'costco' ? 4_000_000 : 1_500_000);
    return out({ checkedAt: Date.now(), leads: parsePromotionSource(html, source) });
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    const message = /^(来源|商家|没有读到|报价)/.test(raw) ? raw : '来源超时或暂不可用';
    return out({ error: message }, 502);
  }
}
