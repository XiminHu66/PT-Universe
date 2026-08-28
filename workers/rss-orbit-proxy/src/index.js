const ALLOWED_ORIGINS = new Set([
  "https://ximinhu66.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const ACTIVE_HOURS = new Set([0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
const FEED_KEY_PREFIX = "feed:";
const STATUS_KEY = "status";
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FETCH_BATCH_SIZE = 6;
const MAX_REDIRECTS = 3;
const COMPATIBILITY_FEEDS = new Map([
  ["zhihu.com/rss", "zhihu-daily"],
  ["www.zhihu.com/rss", "zhihu-daily"],
  ["36kr.com/feed", "36kr-hot-list"],
  ["www.36kr.com/feed", "36kr-hot-list"],
]);

export const FEEDS = Object.freeze({
  wallstreetcn: "https://dedicated.wallstreetcn.com/rss.xml",
  ftchinese: "https://www.ftchinese.com/rss/feed",
  techbang: "https://feeds.feedburner.com/techbang",
  "rfi-cn": "https://www.rfi.fr/cn/rss",
  "bbc-zh": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml",
  rthk: "https://www.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml",
  sspai: "https://sspai.com/feed",
  ithome: "https://www.ithome.com/rss/",
  solidot: "https://www.solidot.org/index.rss",
  appinn: "https://www.appinn.com/feed/",
  "infoq-cn": "https://www.infoq.cn/feed",
  gcores: "https://www.gcores.com/rss",
});

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://ximinhu66.github.io",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Expose-Headers": "X-RSS-Cache, X-RSS-Fetched-At, X-RSS-Source",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request, value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function originAllowed(request) {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function feedResponse(request, body, metadata, cacheState, status = 200, headOnly = false) {
  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", metadata?.contentType || "application/rss+xml; charset=utf-8");
  headers.set("Cache-Control", cacheState === "REFRESH" ? "no-store" : "public, max-age=120, s-maxage=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-RSS-Cache", cacheState);
  if (metadata?.fetchedAt) headers.set("X-RSS-Fetched-At", metadata.fetchedAt);
  if (metadata?.source) headers.set("X-RSS-Source", metadata.source);
  return new Response(headOnly ? null : body, { status, headers });
}

function pacificHour(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  return Number(parts.find(part => part.type === "hour")?.value);
}

export function shouldRunScheduledRefresh(timestamp) {
  return ACTIVE_HOURS.has(pacificHour(timestamp));
}

function isBlockedIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

export function validateCustomFeedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_url");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid_url");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.includes(":") || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan") ||
      hostname === "metadata.google.internal" || isBlockedIpv4(hostname)) {
    throw new Error("blocked_url");
  }
  return url;
}

async function fetchUpstream(value, redirectCount = 0) {
  const url = validateCustomFeedUrl(value);
  const response = await fetch(url.href, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "PT-Universe-RSS-Proxy/2.0 (+https://github.com/XiminHu66/PT-Universe)",
    },
    signal: AbortSignal.timeout(18000),
    redirect: "manual",
    cf: { cacheEverything: false },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location");
    if (!location || redirectCount >= MAX_REDIRECTS) throw new Error("too_many_redirects");
    return fetchUpstream(new URL(location, url).href, redirectCount + 1);
  }
  return response;
}

async function readTextBounded(response) {
  const declaredSize = Number(response.headers.get("Content-Length") || 0);
  if (declaredSize > MAX_FEED_BYTES) throw new Error("feed_too_large");
  if (!response.body) throw new Error("empty_feed");

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("feed_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), size };
}

function looksLikeFeed(text) {
  const opening = text.slice(0, 2048).toLowerCase();
  return opening.includes("<rss") || opening.includes("<feed") || opening.includes("<rdf:rdf");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rssDocument({ title, link, description, items }) {
  const body = items.map(item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ""}
      ${item.pubDate ? `<pubDate>${escapeXml(item.pubDate)}</pubDate>` : ""}
      <description>${escapeXml(item.description || "")}</description>
      ${item.image ? `<enclosure url="${escapeXml(item.image)}" type="image/jpeg" />` : ""}
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${escapeXml(title)}</title>
  <link>${escapeXml(link)}</link>
  <description>${escapeXml(description)}</description>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${body}
</channel></rss>`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PT-Universe-RSS-Proxy/2.1 (+https://github.com/XiminHu66/PT-Universe)",
    },
    signal: AbortSignal.timeout(12000),
    redirect: "follow",
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`compat_upstream_${response.status}`);
  return response.json();
}

async function buildZhihuDailyFeed() {
  const source = "https://daily.zhihu.com/api/4/news/latest";
  const payload = await fetchJson(source);
  if (!Array.isArray(payload?.stories) || !payload.stories.length) throw new Error("compat_invalid_data");
  const text = rssDocument({
    title: "知乎日报",
    link: "https://daily.zhihu.com/",
    description: "知乎每日精选兼容源，由知乎日报公开数据生成",
    items: payload.stories.map(story => ({
      title: story.title,
      link: story.url,
      description: story.hint,
      image: Array.isArray(story.images) ? story.images[0] : story.image,
    })),
  });
  return { text, source };
}

function shanghaiDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function chinaDateToRfc822(value) {
  if (!value) return "";
  const parsed = new Date(`${String(value).replace(" ", "T")}+08:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toUTCString();
}

async function build36KrHotListFeed() {
  let payload;
  let source;
  let lastError;
  for (let offset = 0; offset >= -2; offset--) {
    source = `https://openclaw.36krcdn.com/media/hotlist/${shanghaiDate(offset)}/24h_hot_list.json`;
    try {
      payload = await fetchJson(source);
      if (Array.isArray(payload?.data) && payload.data.length) break;
      throw new Error("compat_invalid_data");
    } catch (error) {
      lastError = error;
      payload = null;
    }
  }
  if (!payload) throw lastError || new Error("compat_unavailable");
  const text = rssDocument({
    title: "36氪 24 小时热榜",
    link: "https://36kr.com/",
    description: "36氪 RSS 兼容源，由 36氪公开热榜数据生成",
    items: payload.data.map(item => ({
      title: item.title,
      link: item.url,
      author: item.author,
      pubDate: chinaDateToRfc822(item.publishTime),
      description: item.content,
    })),
  });
  return { text, source };
}

function compatibilityFeedId(url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return COMPATIBILITY_FEEDS.get(`${url.hostname.toLowerCase()}${path}`) || "";
}

async function buildCompatibilityFeed(url) {
  const feedId = compatibilityFeedId(url);
  if (feedId === "zhihu-daily") return buildZhihuDailyFeed();
  if (feedId === "36kr-hot-list") return build36KrHotListFeed();
  return null;
}

async function readCachedFeed(env, feedId) {
  if (!env.RSS_CACHE) return null;
  const result = await env.RSS_CACHE.getWithMetadata(`${FEED_KEY_PREFIX}${feedId}`, { type: "text" });
  return result?.value ? result : null;
}

async function fetchAndStoreFeed(env, feedId, upstreamUrl, fetchedAt) {
  const response = await fetchUpstream(upstreamUrl);
  if (!response.ok) throw new Error(`upstream_${response.status}`);
  const { text, size } = await readTextBounded(response);
  if (!text.trim() || !looksLikeFeed(text)) throw new Error("invalid_feed");
  const contentType = response.headers.get("Content-Type") || "application/rss+xml; charset=utf-8";
  await env.RSS_CACHE.put(`${FEED_KEY_PREFIX}${feedId}`, text, {
    metadata: { fetchedAt, contentType, source: upstreamUrl, bytes: size },
  });
  return { feedId, ok: true, bytes: size, fetchedAt };
}

export async function refreshAllFeeds(env, fetchedAt = new Date().toISOString()) {
  if (!env.RSS_CACHE) throw new Error("RSS_CACHE binding is required");
  const entries = Object.entries(FEEDS);
  const results = [];

  for (let index = 0; index < entries.length; index += FETCH_BATCH_SIZE) {
    const batch = entries.slice(index, index + FETCH_BATCH_SIZE);
    const settled = await Promise.all(batch.map(async ([feedId, upstreamUrl]) => {
      try {
        return await fetchAndStoreFeed(env, feedId, upstreamUrl, fetchedAt);
      } catch (error) {
        return { feedId, ok: false, error: String(error?.message || error).slice(0, 120) };
      }
    }));
    results.push(...settled);
  }

  const status = {
    last_refresh: fetchedAt,
    ok: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).map(result => result.feedId),
    source_count: entries.length,
    timezone: PACIFIC_TIME_ZONE,
    schedule: "hourly at 08:00-23:00 and 00:00 Pacific",
    sources: Object.fromEntries(results.map(result => [result.feedId, {
      ok: result.ok,
      fetched_at: result.ok ? result.fetchedAt : fetchedAt,
      bytes: result.ok ? result.bytes : undefined,
      error: result.ok ? undefined : result.error,
    }])),
  };
  await env.RSS_CACHE.put(STATUS_KEY, JSON.stringify(status));
  console.log(JSON.stringify({ event: "rss_refresh", ...status }));
  return status;
}

async function statusPayload(env) {
  if (!env.RSS_CACHE) return null;
  return env.RSS_CACHE.get(STATUS_KEY, { type: "json" });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (!["GET", "HEAD"].includes(method)) {
      return json(request, { ok: false, error: "method_not_allowed" }, 405, { Allow: "GET, HEAD, OPTIONS" });
    }
    if (!originAllowed(request)) {
      return json(request, { ok: false, error: "origin_not_allowed" }, 403);
    }
    if (url.pathname === "/" || url.pathname === "/health") {
      const status = await statusPayload(env);
      return json(request, {
        ok: true,
        service: "rss-orbit-proxy",
        backend: "cloudflare-kv",
        feeds: Object.keys(FEEDS).length,
        timezone: PACIFIC_TIME_ZONE,
        schedule: "08:00-23:00 and 00:00 hourly",
        last_refresh: status?.last_refresh || null,
        last_result: status ? { ok: status.ok, failed: status.failed } : null,
        source_health: status?.sources || null,
      });
    }

    if (url.pathname === "/custom") {
      const origin = request.headers.get("Origin") || "";
      if (!ALLOWED_ORIGINS.has(origin)) return json(request, { ok: false, error: "origin_not_allowed" }, 403);
      let upstreamUrl;
      try {
        upstreamUrl = validateCustomFeedUrl(url.searchParams.get("url") || "");
      } catch (error) {
        return json(request, { ok: false, error: String(error?.message || error) }, 400);
      }
      try {
        const compatible = await buildCompatibilityFeed(upstreamUrl);
        if (compatible) {
          return feedResponse(request, compatible.text, {
            contentType: "application/rss+xml; charset=utf-8",
            fetchedAt: new Date().toISOString(),
            bytes: new TextEncoder().encode(compatible.text).byteLength,
            source: compatible.source,
          }, "COMPAT", 200, method === "HEAD");
        }
        const upstream = await fetchUpstream(upstreamUrl.href);
        if (!upstream.ok) throw new Error(`upstream_${upstream.status}`);
        const { text, size } = await readTextBounded(upstream);
        if (!text.trim() || !looksLikeFeed(text)) throw new Error("invalid_feed");
        return feedResponse(request, text, {
          contentType: upstream.headers.get("Content-Type") || "application/rss+xml; charset=utf-8",
          fetchedAt: new Date().toISOString(),
          bytes: size,
        }, "CUSTOM", 200, method === "HEAD");
      } catch (error) {
        return json(request, {
          ok: false,
          error: "upstream_unavailable",
          detail: String(error?.message || error).slice(0, 160),
        }, 504);
      }
    }

    const match = url.pathname.match(/^\/feed\/([a-z0-9-]+)$/i);
    const feedId = match?.[1] || "";
    const upstreamUrl = FEEDS[feedId];
    if (!upstreamUrl) {
      return json(request, { ok: false, error: "feed_not_allowed" }, 404);
    }

    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (!forceRefresh) {
      const cached = await readCachedFeed(env, feedId);
      if (cached) return feedResponse(request, cached.value, cached.metadata, "KV", 200, method === "HEAD");
    }

    try {
      const upstream = await fetchUpstream(upstreamUrl);
      if (!upstream.ok) throw new Error(`upstream_${upstream.status}`);
      const metadata = {
        contentType: upstream.headers.get("Content-Type") || "application/rss+xml; charset=utf-8",
        fetchedAt: new Date().toISOString(),
      };

      if (!forceRefresh && env.RSS_CACHE) {
        const { text, size } = await readTextBounded(upstream);
        if (!text.trim() || !looksLikeFeed(text)) throw new Error("invalid_feed");
        metadata.bytes = size;
        ctx.waitUntil(env.RSS_CACHE.put(`${FEED_KEY_PREFIX}${feedId}`, text, { metadata }));
        return feedResponse(request, text, metadata, "MISS", 200, method === "HEAD");
      }

      return feedResponse(request, upstream.body, metadata, "REFRESH", 200, method === "HEAD");
    } catch (error) {
      const cached = await readCachedFeed(env, feedId);
      if (cached) return feedResponse(request, cached.value, cached.metadata, "STALE", 200, method === "HEAD");
      return json(request, {
        ok: false,
        error: "upstream_unavailable",
        detail: String(error?.message || error).slice(0, 160),
      }, 504);
    }
  },

  async scheduled(controller, env) {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    if (!shouldRunScheduledRefresh(controller.scheduledTime)) {
      console.log(JSON.stringify({ event: "rss_refresh_skipped", scheduled_at: scheduledAt, timezone: PACIFIC_TIME_ZONE }));
      return;
    }
    await refreshAllFeeds(env, scheduledAt);
  },
};
