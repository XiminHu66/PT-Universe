import test from "node:test";
import assert from "node:assert/strict";
import worker, { FEEDS, refreshAllFeeds, shouldRunScheduledRefresh } from "../src/index.js";

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

test("health endpoint reports Cloudflare KV status", async () => {
  const kv = createKv({
    status: JSON.stringify({ last_refresh: "2026-08-27T15:00:00.000Z", ok: 12, failed: [] }),
  });
  const response = await worker.fetch(new Request("https://proxy.example/health"), { RSS_CACHE: kv }, createCtx());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, "rss-orbit-proxy");
  assert.equal(payload.backend, "cloudflare-kv");
  assert.equal(payload.feeds, 12);
  assert.equal(payload.last_refresh, "2026-08-27T15:00:00.000Z");
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

test("manual refresh bypasses KV and does not spend a KV write", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, FEEDS.sspai);
    return new Response(RSS, { headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const kv = createKv({ "feed:sspai": "<rss>old</rss>" });
    const response = await worker.fetch(new Request("https://proxy.example/feed/sspai?refresh=1", {
      headers: { Origin: "https://ximinhu66.github.io" },
    }), { RSS_CACHE: kv }, createCtx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-RSS-Cache"), "REFRESH");
    assert.equal(await response.text(), RSS);
    assert.equal(kv.writes.length, 0);
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
