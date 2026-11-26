import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/deal-promotion.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { dealPromotionRoute, parsePromotionQuote, parsePromotionSource } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const sqlite = new DatabaseSync(':memory:');
const env = { DB: { prepare: sql => ({
  run: async () => ({ meta: sqlite.prepare(sql).run() }),
  bind: (...args) => ({ run: async () => ({ meta: sqlite.prepare(sql).run(...args) }) }),
}) } };
const origin = 'https://ximinhu66.github.io';
const route = (id, method = 'POST', requestOrigin = origin) => {
  const url = new URL('https://test.example/api/deal-radar/promo/' + id);
  return dealPromotionRoute(new Request(url, { method, headers: { origin: requestOrigin } }), url, env);
};
const sample = '<rss><channel><item><title><![CDATA[SSD deal]]></title><link>https://slickdeals.net/f/example?tracking=1</link></item><item><title>External</title><link>https://example.com/f</link></item></channel></rss>';
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async (url, init) => {
  network++;
  assert.equal(new URL(url).hostname, 'slickdeals.net');
  assert.equal(init.redirect, 'manual');
  return new Response(sample);
};
try {
  assert.equal((await route('status', 'GET')).status, 200);
  assert.equal((await route('status')).status, 405);
  assert.equal((await route('slickdeals', 'GET')).status, 405);
  assert.equal((await route('slickdeals', 'POST', 'https://example.com')).status, 403);
  assert.equal((await route('slickdeals?url=https://example.com')).status, 404);
  assert.equal((await route('quote')).status, 401);
  assert.equal(network, 0);
  const results = await Promise.all(Array.from({ length: 4 }, () => route('slickdeals')));
  assert.equal(results.filter(result => result.status === 200).length, 3);
  assert.equal(results.filter(result => result.status === 429).length, 1);
  const feed = await results.find(result => result.status === 200).json();
  assert.equal(feed.leads.length, 1);
  assert.equal(feed.leads[0].url, 'https://slickdeals.net/f/example');
  assert.equal(network, 3);
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}

assert.throws(() => parsePromotionSource('<html>blocked</html>', 'dealmoon'));
const url = 'https://www.amazon.com/dp/B0CR6JND4M';
const product = { url, key: 'amazon.com/B0CR6JND4M' };
const offer = { '@type': 'Offer', price: '35.50', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url };
const html = (offer, props = {}) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Example Dock', url, offers: offer, ...props })}</script>`;
assert.equal(parsePromotionQuote(html(offer), product, Date.now()).availability, 'in-stock');
assert.equal(parsePromotionQuote(html({ ...offer, availability: undefined }), product, Date.now()).availability, 'unknown');
assert.throws(() => parsePromotionQuote(html({ ...offer, priceCurrency: 'CAD' }), product, Date.now()));
assert.throws(() => parsePromotionQuote(html({ ...offer, itemCondition: 'https://schema.org/RefurbishedCondition' }), product, Date.now()));
assert.throws(() => parsePromotionQuote(html(offer, { url: 'https://www.amazon.com/dp/XXXXXXXXXX' }), product, Date.now()));
assert.throws(() => parsePromotionQuote(html([offer, offer]), product, Date.now()));
const bestBuy = { url: 'https://www.bestbuy.com/product/example/J7XSRH5CXG/sku/6505727', key: 'bestbuy.com/6505727', bestBuy: { code: 'J7XSRH5CXG', sku: '6505727' } };
const bestBuyCanonical = 'https://www.bestbuy.com/product/example/J7XSRH5CXG';
const bestBuyOffer = { ...offer, url: undefined, price: 169.99, sku: '6505727', seller: { name: 'Best Buy' }, itemCondition: 'https://schema.org/NewCondition' };
const marketplace = { ...bestBuyOffer, sku: '12771375', price: 129.99, seller: { name: 'Marketplace' } };
assert.equal(parsePromotionQuote(html([marketplace, bestBuyOffer], { url: bestBuyCanonical, sku: '6505727' }), bestBuy, Date.now()).price, 169.99);
assert.throws(() => parsePromotionQuote(html([marketplace], { url: bestBuyCanonical, sku: '6505727' }), bestBuy, Date.now()));
assert.throws(() => parsePromotionQuote(html([marketplace, bestBuyOffer], { url: bestBuyCanonical, sku: '1234567' }), bestBuy, Date.now()));
console.log('PASS: manual-only sources, owner quote gate, atomic SQLite budget, source scope, and exact USD quote conditions.');
