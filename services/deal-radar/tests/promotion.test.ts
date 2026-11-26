import assert from "node:assert/strict";
import { test } from "node:test";
import { chineseTitle } from "../src/lib/promotion-language";
import { priceFromTitle } from "../src/lib/promotion-pricing";
import { observeLead, observeQuote, priceHistoryLink, recordPrices, showObservedLow } from "../src/lib/promotion-history";
import type { Lead } from "../src/lib/promotion";
import { applyTarget, classifyWatch, FIRST_CAMPAIGN, merchantProduct, parseImport, promotionImageUrl, updateCampaignSources, updateQuote, type Quote } from "../src/lib/promotion";

test("Excel import deduplicates ASIN links and retains reference price without setting a target", () => {
  let id = 0;
  const rows = [
    ["商品与精确型号", "Amazon美国站", "Amazon公开报价($)", "公开报价日期"],
    ["Dock", "https://www.amazon.com/product/dp/B0CR6JND4M?tag=example", 39.89, "2026-11-20—22"],
    ["Same dock", "https://amazon.com/gp/product/b0cr6jnd4m", 41, "2026-11-22"],
    ["Invalid", "file:///local", 28, ""],
  ];
  const watches = parseImport(rows, () => String(++id));
  assert.equal(watches.length, 1);
  assert.equal(watches[0].reference, 39.89);
  assert.equal(watches[0].referenceDate, "2026-11-20—22");
  assert.equal(watches[0].target, null);
  assert.equal(watches[0].enabled, false);
  assert.equal(merchantProduct(watches[0].url)?.url, "https://www.amazon.com/dp/B0CR6JND4M");
  assert.equal(merchantProduct("https://www.amazon.com/s?k=dock"), null);
  assert.equal(merchantProduct("https://www.bestbuy.com/product/spec%2fother/J7XSRH5CXG/sku/6505727"), null);
});

test("only in-stock matching quotes hit the target and a failed check cannot show a current hit", () => {
  const url = "https://www.amazon.com/dp/B0CR6JND4M";
  const watch = { id: "dock", title: "Dock", url, target: 40, enabled: true };
  const quote: Quote = { name: "Dock", price: 39, url, checkedAt: 1, availability: "in-stock" };
  const hit = updateQuote(watch, quote);
  assert.equal(classifyWatch(hit), "已到价");
  assert.equal(updateQuote(hit, { ...quote, checkedAt: 2 }).hitAt, 1);
  assert.equal(classifyWatch({ ...hit, error: "timeout" }), "待核实");
  assert.equal(classifyWatch(updateQuote(hit, { ...quote, availability: "unknown" })), "库存待确认");
  assert.equal(classifyWatch(applyTarget(hit, 38)), "未到价");
  assert.equal(classifyWatch(applyTarget(hit, 42)), "待复核");
});


test("separates a posted sale price, baseline, and discount with explicit evidence", () => {
  const jacket = priceFromTitle("Gap Factory Hooded Puffer Jacket $20.65 + Free S&H on $50+",
    "Gap Factory has it for $26.99 - 10% off in cart - 15% with promo code = $20.65. Shipping is free.");
  assert.equal(jacket.current, 20.65);
  assert.equal(jacket.original, 26.99);
  assert.equal(jacket.discount, 23.5);
  assert.equal(jacket.kind, "conditional");
  assert.equal(jacket.basis, "before-promo");
  const bestBuy = priceFromTitle("Save $87.98 on the Nintendo bundle — only $499.99 after savings");
  assert.equal(bestBuy.current, 499.99);
  assert.equal(bestBuy.original, 587.97);
  assert.equal(bestBuy.discount, 15);
  assert.equal(priceFromTitle("New SSD now $89.99 (was $119.99)").basis, "listed");
});

test("does not turn a saving, an MSRP, monthly charge, or conflicting body into a current price", () => {
  assert.equal(priceFromTitle("Save $75 on a bundle").current, undefined);
  assert.equal(priceFromTitle("TV MSRP $1,899").current, undefined);
  assert.equal(priceFromTitle("TV $19.99/mo").current, undefined);
  assert.equal(priceFromTitle("TV $599 + $50 gift card").current, undefined);
  const otherVariant = priceFromTitle("Electric Razor (White) $75 + Free S&H", "The black variant is on sale for $60, was $110.");
  assert.equal(otherVariant.current, 75);
  assert.equal(otherVariant.original, undefined);
  assert.equal(priceFromTitle("Oura Ring 5, now as low as $299").current, 299);
  assert.equal(priceFromTitle("黑五护肤低至7折").upTo, true);
  assert.equal(priceFromTitle("黑五护肤低至7折").discount, 30);
});

test("product labels retain brand and model while translating useful product words", () => {
  assert.match(chineseTitle("Gap Factory Men's Relaxed Hooded Puffer Jacket (Black or Navy) $20.65 + Free S&H"), /Gap Factory.*男款.*连帽棉服/);
  assert.match(chineseTitle("Nike Men's MC Trainer 3 Workout Shoes $36"), /Nike.*MC Trainer 3.*训练鞋/);
  assert.equal(chineseTitle("罗技无线鼠标 $24.99"), "罗技无线鼠标");
});


test("promotion photos stay scoped to a source image host and strip unrelated parameters", () => {
  const image = "https://static.slickdealscdn.com/attachment/1/2/300x300/90.thumb";
  assert.equal(promotionImageUrl("slickdeals", image + "?campaign=hidden#fragment"), image);
  assert.equal(promotionImageUrl("bestbuy", image), undefined);
  assert.equal(promotionImageUrl("slickdeals", "https://static.slickdealscdn.com.invalid/attachment/1/2/300x300/90.thumb"), undefined);
  assert.equal(promotionImageUrl("slickdeals", "https://static.slickdealscdn.com/attachment/avatar/1/2/50x50/avatar.static"), undefined);
  assert.equal(promotionImageUrl("slickdeals", "data:image/png;base64,AAAA"), undefined);
});

test("upgrades the old default sources while respecting custom campaigns", () => {
  const old = { ...FIRST_CAMPAIGN, sourceVersion: undefined, sources: ["slickdeals", "dealmoon", "bestbuy", "costco"] as const };
  const previous = { ...old, sources: [...old.sources] };
  const newer = updateCampaignSources(previous);
  assert.deepEqual(newer.sources, FIRST_CAMPAIGN.sources);
  assert.equal(newer.snapshots, previous.snapshots);
  assert.equal(updateCampaignSources(newer), newer);
  const custom = { ...previous, sources: ["slickdeals"] as const };
  assert.deepEqual(updateCampaignSources({ ...custom, sources: [...custom.sources] }).sources, ["slickdeals"]);
  assert.deepEqual(updateCampaignSources({ ...previous, id: "custom" }).sources, previous.sources);
});

test("historical lows need multiple Pacific dates and the exact item and offer scope", () => {
  const first = Date.parse("2026-11-27T20:00:00Z");
  const sameDay = Date.parse("2026-11-28T04:00:00Z");
  const second = Date.parse("2026-11-28T20:00:00Z");
  const deal: Lead = { source: "costco", title: "Example item", url: "https://www.costco.com/p/-/some-item/12345", offer: { current: 100, scope: "online" } };
  const start = observeLead(deal, first)!;
  const later = observeLead({ ...deal, offer: { current: 95, scope: "online" } }, sameDay)!;
  const oneDay = recordPrices(undefined, [start, later]);
  assert.equal(showObservedLow(oneDay, start.key), undefined);
  const next = observeLead({ ...deal, offer: { current: 105, scope: "online" } }, second)!;
  const history = recordPrices(oneDay, [next]);
  assert.deepEqual(showObservedLow(history, start.key), { price: 95, lowAt: sameDay, firstAt: first, lastAt: second });
  const warehouse = observeLead({ ...deal, offer: { current: 70, scope: "warehouse" } }, second)!;
  assert.notEqual(warehouse.key, start.key);
  assert.equal(observeLead({ ...deal, validFrom: "2026-11-29" }, second), null);
  assert.equal(observeLead({ ...deal, validUntil: "2026-11-27" }, second), null);
  assert.equal(observeLead({ ...deal, offer: { current: 70, kind: "conditional" } }, second), null);
  assert.equal(observeLead({ ...deal, offer: { current: 70, note: "平台第三方卖家" } }, second), null);
  assert.equal(observeLead({ ...deal, offer: { current: 70, kind: "from" } }, second), null);
});

test("price history uses exact product links and eligible verified quotes", () => {
  const url = "https://www.amazon.com/dp/B0D123ABCD";
  assert.match(priceHistoryLink(url)!.href, /keepa\.com.*B0D123ABCD/);
  assert.equal(priceHistoryLink("https://store.steampowered.com/app/1174180/Red_Dead_Redemption_2/")!.href, "https://steamdb.info/app/1174180/");
  assert.equal(priceHistoryLink("https://store.steampowered.com/bundle/1174180/"), null);
  assert.equal(priceHistoryLink("https://store.steampowered.com.other.example/app/1174180/"), null);
  const quote = { name: "Sample", price: 90, checkedAt: Date.UTC(2026, 10, 27), url, availability: "in-stock" as const };
  assert.ok(observeQuote(quote));
  assert.equal(observeQuote({ ...quote, availability: "out-of-stock" }), null);
  assert.equal(observeQuote({ ...quote, method: "manual" }), null);
});
