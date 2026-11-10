import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/deal-radar.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { dealRadarRoute } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const siteOrigin = 'https://pt-vps-tools.h1nano.chatgpt.site';
const config = { origin: 'https://test-vps.trycloudflare.com', siteOrigin, jwk: await crypto.subtle.exportKey('jwk', keys.privateKey) };
const env = { PT_UNIVERSE_DATA: { get: async (key) => {
  assert.equal(key, 'private/knowledge/vps-transport-v1');
  return JSON.stringify(config);
} } };
const feed = 'https://api.example/api/deal-radar/latest';
const route = (url = feed, init) => dealRadarRoute(new Request(url, init), new URL(url), env);
const secret = 'PRIVATE_MUST_NOT_LEAK';
const now = Date.now();
let cacheEntry;
let calls = 0;
globalThis.caches = { open: async () => ({
  match: async (key) => { assert.equal(key.url, feed); return cacheEntry?.clone(); },
  put: async (key, response) => { assert.equal(key.url, feed); cacheEntry = response.clone(); },
}) };
globalThis.fetch = async (target, init) => {
  calls += 1;
  assert.equal(target, `${config.origin}/deal-radar/api/deals/`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.headers.get('cookie'), null);
  assert.equal(init.headers.get('authorization'), null);
  const message = ['pt-gateway-v1', 'hub', 'GET', '/deal-radar/api/deals/', init.headers.get('x-pt-time'), init.headers.get('x-pt-nonce'), siteOrigin, ''].join('\n');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, Buffer.from(init.headers.get('x-pt-signature'), 'base64url'), Buffer.from(message)));
  const row = { sourceId: 'epic', category: '游戏', title: 'Epic 测试活动', summary: secret, isNew: true, firstSeenAt: now, offerKind: 'free-game' };
  return Response.json({
    generatedAt: now, lastUpdatedAt: now, roundStatus: 'partial',
    sources: [{ id: 'epic', lastOk: true }, { id: 'linuxdo', lastOk: false, lastError: secret, lastFinalUrl: `https://linux.do/?key=${secret}` }],
    deals: [
      { ...row, canonicalUrl: `https://store.epicgames.com/zh-CN/p/test?key=${secret}` },
      { ...row, canonicalUrl: 'https://store.epicgames.com/zh-CN/p/test' },
      { ...row, canonicalUrl: 'https://store.epicgames.com.evil.example/redirect' },
      { ...row, sourceId: 'nodeseek', canonicalUrl: 'https://www.nodeseek.com/post-1' },
    ], failures: [{ sourceId: 'linuxdo', error: secret }], anomalies: [secret],
  });
};

assert.equal((await route(feed, { method: 'POST' })).status, 405);
assert.equal((await route(feed.replace('/latest', '/refresh'), { method: 'POST' })).status, 404);
assert.equal((await route(feed + '?path=/hub/status')).status, 404);
assert.equal(calls, 0);
const response = await route(feed, { headers: { origin: 'https://ximinhu66.github.io', cookie: secret, authorization: secret } });
assert.equal(response.status, 200);
assert.equal(response.headers.get('access-control-allow-origin'), 'https://ximinhu66.github.io');
assert.equal(response.headers.get('set-cookie'), null);
const text = await response.text();
assert.ok(!text.includes(secret) && !text.includes('nodeseek') && !text.includes('evil.example'));
const board = JSON.parse(text);
assert.equal(board.deals.length, 1);
assert.equal(board.deals[0].url, 'https://store.epicgames.com/zh-CN/p/test');
assert.equal(board.deals[0].offerKind, 'free-game');
assert.equal(board.deals[0].firstSeenAt, now);
assert.equal(board.sources.length, 5);
assert.equal(board.failures[0].error, '抓取失败');
assert.equal((await route()).status, 200);
assert.equal(calls, 1);
cacheEntry = undefined;
globalThis.fetch = async () => Response.redirect('https://login.example');
const failure = await route();
assert.equal(failure.status, 503);
assert.equal(failure.headers.get('cache-control'), 'no-store');
assert.equal(failure.headers.get('location'), null);
console.log('PASS: public board projection, credential isolation, signed fixed upstream read, cache, and mutation rejection.');
