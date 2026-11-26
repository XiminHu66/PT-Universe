import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTarget, classifyWatch, merchantProduct, parseImport, updateQuote, type Quote } from "../src/lib/promotion";

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
