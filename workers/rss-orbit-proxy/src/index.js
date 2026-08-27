const ALLOWED_ORIGINS = new Set([
  "https://ximinhu66.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
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

function responseWithCors(request, response, cacheState, headOnly = false) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
  headers.set("Content-Type", headers.get("Content-Type") || "application/rss+xml; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=120, s-maxage=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-RSS-Cache", cacheState);
  return new Response(headOnly ? null : response.body, { status: response.status, headers });
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
      return json(request, { ok: true, service: "rss-orbit-proxy", feeds: Object.keys(FEEDS).length });
    }

    const match = url.pathname.match(/^\/feed\/([a-z0-9-]+)$/i);
    const feedId = match?.[1] || "";
    const upstreamUrl = FEEDS[feedId];
    if (!upstreamUrl) {
      return json(request, { ok: false, error: "feed_not_allowed" }, 404);
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/feed/${feedId}`, { method: "GET" });
    const forceRefresh = url.searchParams.get("refresh") === "1";
    if (!forceRefresh) {
      const cached = await cache.match(cacheKey);
      if (cached) return responseWithCors(request, cached, "HIT", method === "HEAD");
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "User-Agent": "PT-Universe-RSS-Proxy/1.0 (+https://github.com/XiminHu66/PT-Universe)",
        },
        signal: AbortSignal.timeout(18000),
        cf: { cacheEverything: false },
      });
      if (!upstream.ok) {
        return json(request, { ok: false, error: "upstream_error", status: upstream.status }, 502);
      }

      const normalized = responseWithCors(request, upstream, forceRefresh ? "REFRESH" : "MISS");
      ctx.waitUntil(cache.put(cacheKey, normalized.clone()));
      return method === "HEAD" ? responseWithCors(request, normalized, forceRefresh ? "REFRESH" : "MISS", true) : normalized;
    } catch (error) {
      return json(request, { ok: false, error: "upstream_unavailable", detail: String(error?.message || error).slice(0, 160) }, 504);
    }
  },
};
