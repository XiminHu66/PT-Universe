import test from "node:test";
import assert from "node:assert/strict";
import worker, { FEEDS } from "../src/index.js";

const store = new Map();
globalThis.caches = {
  default: {
    async match(request) { return store.get(request.url)?.clone(); },
    async put(request, response) { store.set(request.url, response.clone()); },
  },
};

const ctx = { waitUntil(promise) { return promise; } };

test("health endpoint reports the allowlisted feed count", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/health"), {}, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "rss-orbit-proxy", feeds: 12 });
});

test("unknown feeds are rejected", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/feed/not-real"), {}, ctx);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "feed_not_allowed");
});

test("unapproved browser origins are rejected", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/feed/sspai", { headers: { Origin: "https://evil.example" } }), {}, ctx);
  assert.equal(response.status, 403);
});

test("allowlisted feeds are proxied with CORS headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, FEEDS.sspai);
    return new Response("<rss><channel><title>Test</title></channel></rss>", { headers: { "Content-Type": "application/rss+xml" } });
  };
  try {
    const request = new Request("https://proxy.example/feed/sspai?refresh=1", { headers: { Origin: "https://ximinhu66.github.io" } });
    const response = await worker.fetch(request, {}, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://ximinhu66.github.io");
    assert.equal(response.headers.get("X-RSS-Cache"), "REFRESH");
    assert.match(await response.text(), /<rss>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
