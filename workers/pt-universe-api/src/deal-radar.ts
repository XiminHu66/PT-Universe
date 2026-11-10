import { normalizeBoardState } from '../../../services/deal-radar/src/lib/board-view';
import { SOURCE_DEFS } from '../../../services/deal-radar/src/lib/source-defs';
import type { BoardState } from '../../../services/deal-radar/src/lib/types';
import { readVpsDealBoard } from './knowledge';

const origin = 'https://ximinhu66.github.io';
const feedPath = '/api/deal-radar/latest';
const headers = {
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, OPTIONS',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const sourcesById = new Map(SOURCE_DEFS.map((source) => [source.id, source]));
type Env = Parameters<typeof readVpsDealBoard>[0];

function publicLink(raw: string, allowedHosts: string[]) {
  const url = new URL(raw);
  if (!allowedHosts.some((host) => url.hostname === host || url.hostname === `www.${host}`) || url.port) return null;
  // Source article permalinks are path-based. Keep credentials, tracking and arbitrary query parameters out of the feed.
  url.search = '';
  url.hash = '';
  return url.href;
}

export function publicDealBoard(raw: unknown): BoardState {
  const board = normalizeBoardState(raw);
  if (!board?.lastUpdatedAt || !board.sources.some((source) => sourcesById.has(source.id))) throw Error('invalid-deal-board');
  const seen = new Set<string>();
  const deals = board.deals.flatMap((deal) => {
    const source = sourcesById.get(deal.sourceId);
    if (!source || !deal.title) return [];
    const url = publicLink(deal.canonicalUrl, source.allowedHosts);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      id: deal.id, url, canonicalUrl: url, title: deal.title, summary: '',
      category: deal.category, sourceId: source.id, sourceName: source.name,
      publishedAt: deal.publishedAt, publishedLabel: deal.publishedLabel,
      expiresAt: deal.expiresAt, expiresLabel: deal.expiresLabel,
      expiresSoon: deal.expiresSoon, isNew: deal.isNew,
      firstSeenAt: deal.firstSeenAt, offerKind: deal.offerKind,
    }];
  });
  const sources = SOURCE_DEFS.map(({ id, name }) => {
    const source = board.sources.find((item) => item.id === id);
    return {
      id, name, activeCount: deals.filter((item) => item.sourceId === id).length,
      lastOk: source?.lastOk ?? null, lastFetched: source?.lastFetched ?? null, lastInserted: source?.lastInserted ?? null,
      lastError: null, lastFinalUrl: null,
    };
  });
  return {
    generatedAt: board.generatedAt, lastUpdatedAt: board.lastUpdatedAt, lastUpdatedLabel: board.lastUpdatedLabel,
    nextRefreshAt: board.nextRefreshAt, nextRefreshLabel: board.nextRefreshLabel,
    sourceHealth: { ok: sources.filter((source) => source.lastOk === true).length, total: sources.length },
    activeCount: deals.length, newCount: deals.filter((deal) => deal.isNew).length,
    refreshInProgress: false, roundStatus: board.roundStatus, freshness: board.freshness,
    failures: sources.filter((source) => source.lastOk === false).map((source) => ({ sourceId: source.id, sourceName: source.name, error: '抓取失败' })),
    sources, deals,
  };
}

export async function dealRadarRoute(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname !== feedPath || url.search) return Response.json({ error: 'Not found' }, { status: 404, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return Response.json({ error: 'Read only' }, { status: 405, headers: { ...headers, allow: 'GET, OPTIONS' } });
  // One cache key per edge location regardless of browser headers. The VPS only serves the existing stored board.
  const key = new Request(url.href);
  try {
    const cache = await caches.open('pt-deal-radar-v2').catch(() => null);
    const cached = await cache?.match(key).catch(() => undefined);
    if (cached) return cached;
    const data = publicDealBoard(await readVpsDealBoard(env));
    const response = Response.json(data, { headers: { ...headers, 'cache-control': 'public, max-age=60, s-maxage=300' } });
    await cache?.put(key, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return Response.json({ error: '暂时无法读取优惠数据，请稍后重试。' }, { status: 503, headers });
  }
}
