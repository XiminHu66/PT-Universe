import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/deal-promotion.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { attachSlickdealsImages, dealPromotionRoute, parsePromotionQuote, parsePromotionSource } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
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
const sample = '<rss><channel><item><title><![CDATA[SSD deal]]></title><link>https://slickdeals.net/f/123456-example?tracking=1</link></item><item><title>External</title><link>https://example.com/f</link></item></channel></rss>';
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async (url, init) => {
  network++;
  assert.equal(new URL(url).hostname, 'slickdeals.net');
  assert.equal(init.redirect, 'manual');
  return url === 'https://slickdeals.net/' ? new Response('blocked', { status: 403 }) : new Response(sample);
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
  assert.equal(feed.leads[0].url, 'https://slickdeals.net/f/123456-example');
  assert.equal(feed.leads[0].imageUrl, undefined);
  assert.equal(network, 6);
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
const costco = '<main><div data-testid="Grid"><a href="/p/-/sample/12345">1 TB SSD</a><img data-testid="media-asset" src="https://gdx-assets.costco.com/adobe/assets/ssd.avif" srcset="https://gdx-assets.costco.com/adobe/assets/ssd.avif?width=320 320w, https://gdx-assets.costco.com/adobe/assets/ssd.avif?width=640 640w"><div>Warehouse &amp; Online</div><div data-testid="Text_prices_and_percentages_prices">$119.99</div><div data-testid="Text_prices_and_percentages_append_text">After $30 OFF</div><div>Valid 11/27/26 - 11/30/26</div></div><div data-testid="Grid"><a href="/p/-/different/54321">Headphones</a><span data-testid="Text_prices_and_percentages_prepend_text">Save</span><span data-testid="Text_prices_and_percentages_prices">$75</span></div></main>';
const official = parsePromotionSource(costco, 'costco');
assert.equal(official[0].offer.current, 119.99);
assert.equal(official[0].offer.original, 149.99);
assert.equal(official[0].offer.discount, 20);
assert.equal(official[0].offer.scope, 'both');
assert.equal(official[0].validFrom, '2026-11-27');
assert.equal(official[0].validUntil, '2026-11-30');
assert.equal(official[1].offer.savings, 75);
assert.equal(official[1].offer.current, undefined);
assert.equal(official[1].offer.original, undefined);
assert.equal(official[0].imageUrl, 'https://gdx-assets.costco.com/adobe/assets/ssd.avif?width=320');
assert.equal(official[1].imageUrl, undefined);

const slick = parsePromotionSource(sample, 'slickdeals');
const slickPhoto = 'https://static.slickdealscdn.com/attachment/1/2/300x300/90.thumb';
const otherPhoto = 'https://static.slickdealscdn.com/attachment/1/2/300x300/91.thumb';
const feedCards = `<a href="/f/1234567-ssd" class="dealCardImage"><img src="${otherPhoto}"></a><a class="dealCardImage dealCardGridV2__image" href="/f/123456-changed-slug"><img src="https://static.slickdealscdn.com.evil.example/a.png" srcset="${slickPhoto} 300w"></a>`;
assert.equal(attachSlickdealsImages(slick, feedCards)[0].imageUrl, slickPhoto);
assert.equal(attachSlickdealsImages(slick, feedCards.split('</a>')[0] + '</a>')[0].imageUrl, undefined);
const bestBuyPage = '<div data-testid="offer-card"><a data-testid="offer-card-image-link" href="/site/promo/ssd"><img src="https://pisces.bbystatic.com/image2/BestBuy_US/dam/ssd.png;format=webp"></a><a href="/site/promo/ssd" data-testid="offer-card-body-copy-link">SSD now $40</a></div>';
assert.equal(parsePromotionSource(bestBuyPage, 'bestbuy')[0].imageUrl, 'https://pisces.bbystatic.com/image2/BestBuy_US/dam/ssd.png;format=webp');
const cnPost = 'https://www.dealmoon.com/cn/ssd/12345.html';
const moon = `<script type="application/ld+json">${JSON.stringify({'@type':'CollectionPage',mainEntity:{itemListElement:[{item:{url:cnPost,name:'存储优惠'}}]}})}</script><a class="deal-personal-strack" href="${cnPost}"><img class="snapshot" src="https://imgcache.dealmoon.com/thumbimg.dealmoon.com/ssd.jpg"></a>`;
assert.equal(parsePromotionSource(moon, 'dealmoon')[0].imageUrl, 'https://imgcache.dealmoon.com/thumbimg.dealmoon.com/ssd.jpg');
console.log('PASS: manual-only sources, owner quote gate, atomic SQLite budget, source scope, and exact USD quote conditions.');
