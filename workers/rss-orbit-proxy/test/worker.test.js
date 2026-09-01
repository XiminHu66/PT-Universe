import test from "node:test";
import assert from "node:assert/strict";
import worker, { FEEDS, mergeFeedHistory, refreshAllFeeds, shouldRunScheduledRefresh, validateCustomFeedUrl } from "../src/index.js";

function createKv(initial = {}) {
  const values = new Map();
  for (const [key, entry] of Object.entries(initial)) {
    values.set(key, typeof entry === "string" ? { value: entry, metadata: null } : entry);
  }
  return {
    values,
    writes: [],
    async get(key, options) {
      const entry = values.get(key);
      if (!entry) return null;
      return options?.type === "json" ? JSON.parse(entry.value) : entry.value;
    },
    async getWithMetadata(key) {
      const entry = values.get(key);
      return entry ? { value: entry.value, metadata: entry.metadata } : { value: null, metadata: null };
    },
    async put(key, value, options = {}) {
      const text = String(value);
      values.set(key, { value: text, metadata: options.metadata || null });
      this.writes.push({ key, value: text, options });
    },
  };
}

function createCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) { pending.push(promise); },
  };
}

const RSS = "<rss><channel><title>Test</title><item><title>Hello</title></item></channel></rss>";
const rssWithItems = items => `<rss><channel><title>Test</title>${items.map(({ id, title = id }) => `<item><guid>${id}</guid><title>${title}</title><link>https://example.com/${id}</link></item>`).join("")}</channel></rss>`;

test("feed history merges old entries and caps each source at 100", () => {
  const cached = rssWithItems(Array.from({ length: 100 }, (_, index) => ({ id: `old-${index}` })));
  const fresh = rssWithItems([
    { id: "new-1" },
    { id: "new-2" },
    { id: "old-0", title: "updated duplicate" },
  ]);
  const merged = mergeFeedHistory(fresh, cached);
  assert.equal((merged.match(/<item>/g) || []).length, 100);
  assert.match(merged, /<guid>new-1<\/guid>/);
  assert.match(merged, /<guid>new-2<\/guid>/);
  assert.equal((merged.match(/<guid>old-0<\/guid>/g) || []).length, 1);
  assert.doesNotMatch(merged, /<guid>old-99<\/guid>/);
});

test("health endpoint reports Cloudflare KV status", async () => {
  const kv = createKv({
    status: JSON.stringify({ last_refresh: "2026-08-27T15:00:00.000Z", ok: 12, failed: [], sources: { sspai: { ok: true, fetched_at: "2026-08-27T15:00:00.000Z" } } }),
  });
  const response = await worker.fetch(new Request("https://proxy.example/health"), { RSS_CACHE: kv }, createCtx());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, "rss-orbit-proxy");
  assert.equal(payload.backend, "cloudflare-kv");
  assert.equal(payload.feeds, 12);
  assert.equal(payload.last_refresh, "2026-08-27T15:00:00.000Z");
  assert.equal(payload.source_health.sspai.ok, true);
});

test("custom URL validation blocks local and private destinations", () => {
  assert.equal(validateCustomFeedUrl("https://example.com/feed.xml").href, "https://example.com/feed.xml");
  for (const url of ["file:///tmp/feed.xml", "http://localhost/rss", "http://127.0.0.1/rss", "http://10.2.3.4/rss", "http://[::1]/rss"]) {
    assert.throws(() => validateCustomFeedUrl(url));
  }
});

test("custom feeds refresh through Cloudflare without KV writes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.com/feed.xml");
    assert.equal(options.redirect, "manual");
    return new Response(RSS, { headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const kv = createKv();
    const response = await worker.fetch(new Request("https://proxy.example/custom?url=https%3A%2F%2Fexample.com%2Ffeed.xml", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: kv }, createCtx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "CUSTOM");
    assert.equal(await response.text(), RSS);
    assert.equal(kv.writes.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Zhihu's empty legacy RSS URL uses the daily compatibility feed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, "https://daily.zhihu.com/api/4/news/latest");
    return Response.json({ stories: [{ title: "知乎测试", url: "https://daily.zhihu.com/story/1", hint: "摘要", images: ["https://example.com/1.jpg"] }] });
  };
  try {
    const response = await worker.fetch(new Request("https://proxy.example/custom?url=https%3A%2F%2Fwww.zhihu.com%2Frss", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: createKv() }, createCtx());
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "COMPAT");
    assert.equal(response.headers.get("X-RSS-Source"), "https://daily.zhihu.com/api/4/news/latest");
    assert.match(text, /<title>知乎测试<\/title>/);
    assert.match(text, /<enclosure url="https:\/\/example.com\/1.jpg"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("36Kr's blocked legacy RSS URL uses the current CDN hot list", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(url, /^https:\/\/openclaw\.36krcdn\.com\/media\/hotlist\/\d{4}-\d{2}-\d{2}\/24h_hot_list\.json$/);
    return Response.json({ data: [{ title: "36氪测试", url: "https://36kr.com/p/1?channel=skills&from=rss", author: "作者", publishTime: "2026-08-28 12:07:21", content: "摘要" }] });
  };
  try {
    const response = await worker.fetch(new Request("https://proxy.example/custom?url=https%3A%2F%2F36kr.com%2Ffeed", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: createKv() }, createCtx());
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "COMPAT");
    assert.match(response.headers.get("X-RSS-Source"), /36krcdn\.com/);
    assert.match(text, /<title>36氪测试<\/title>/);
    assert.match(text, /channel=skills&amp;/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("custom feed endpoint requires the production browser origin", async () => {
  const env = { RSS_CACHE: createKv() };
  for (const headers of [{}, { Origin: "https://evil.example" }]) {
    const response = await worker.fetch(new Request("https://proxy.example/custom?url=https%3A%2F%2Fexample.com%2Ffeed.xml", { headers }), env, createCtx());
    assert.equal(response.status, 403);
  }
});

test("unknown feeds and unapproved browser origins are rejected", async () => {
  const env = { RSS_CACHE: createKv() };
  const unknown = await worker.fetch(new Request("https://proxy.example/feed/not-real"), env, createCtx());
  assert.equal(unknown.status, 404);
  const forbidden = await worker.fetch(new Request("https://proxy.example/feed/sspai", {
    headers: { Origin: "https://evil.example" },
  }), env, createCtx());
  assert.equal(forbidden.status, 403);
});

test("normal reads come directly from KV without an upstream request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("upstream should not be called"); };
  try {
    const kv = createKv({
      "feed:sspai": { value: RSS, metadata: { fetchedAt: "2026-08-27T15:00:00.000Z", contentType: "application/rss+xml" } },
    });
    const response = await worker.fetch(new Request("https://proxy.example/feed/sspai", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: kv }, createCtx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "KV");
    assert.equal(response.headers.get("X-RSS-Fetched-At"), "2026-08-27T15:00:00.000Z");
    assert.equal(await response.text(), RSS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual refresh merges history and persists the 100-item snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const fresh = rssWithItems([{ id: "new" }]);
  const cached = rssWithItems([{ id: "old" }]);
  globalThis.fetch = async url => {
    assert.equal(url, FEEDS.sspai);
    return new Response(fresh, { headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const kv = createKv({ "feed:sspai": cached });
    const response = await worker.fetch(new Request("https://proxy.example/feed/sspai?refresh=1", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: kv }, createCtx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "REFRESH");
    const text = await response.text();
    assert.match(text, /<guid>new<\/guid>/);
    assert.match(text, /<guid>old<\/guid>/);
    assert.equal(kv.writes.filter(write => write.key === "feed:sspai").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual refresh falls back to stale KV when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const kv = createKv({ "feed:sspai": { value: RSS, metadata: { fetchedAt: "2026-08-27T15:00:00.000Z" } } });
    const response = await worker.fetch(new Request("https://proxy.example/feed/sspai?refresh=1"), { RSS_CACHE: kv }, createCtx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "STALE");
    assert.equal(await response.text(), RSS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pacific schedule includes 08:00 through midnight and sleeps overnight", () => {
  assert.equal(shouldRunScheduledRefresh(Date.parse("2026-08-27T15:00:00Z")), true, "08:00 PDT");
  assert.equal(shouldRunScheduledRefresh(Date.parse("2026-01-15T16:00:00Z")), true, "08:00 PST");
  assert.equal(shouldRunScheduledRefresh(Date.parse("2026-08-28T07:00:00Z")), true, "00:00 PDT");
  assert.equal(shouldRunScheduledRefresh(Date.parse("2026-08-27T14:00:00Z")), false, "07:00 PDT");
  assert.equal(shouldRunScheduledRefresh(Date.parse("2026-08-28T08:00:00Z")), false, "01:00 PDT");
});

test("scheduled refresh writes every valid feed plus one status record", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.ok(Object.values(FEEDS).includes(url));
    return new Response(RSS, { headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const kv = createKv();
    const status = await refreshAllFeeds({ RSS_CACHE: kv }, "2026-08-27T15:00:00.000Z");
    assert.equal(status.ok, 12);
    assert.deepEqual(status.failed, []);
    assert.equal(status.sources.sspai.ok, true);
    assert.equal(status.sources.sspai.fetched_at, "2026-08-27T15:00:00.000Z");
    assert.equal(kv.writes.filter(write => write.key.startsWith("feed:")).length, 12);
    assert.equal(kv.writes.filter(write => write.key === "status").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled handler skips sleeping hours without fetching or writing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fetch should not run while sleeping"); };
  try {
    const kv = createKv();
    await worker.scheduled({ scheduledTime: Date.parse("2026-08-27T14:00:00Z") }, { RSS_CACHE: kv });
    assert.equal(kv.writes.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
