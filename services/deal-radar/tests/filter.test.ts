import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterDeals, type DealFilters } from "../src/lib/filter-deals";
import type { DealDTO } from "../src/lib/types";

function deal(partial: Partial<DealDTO> & Pick<DealDTO, "canonicalUrl" | "title" | "category" | "sourceId">): DealDTO {
  return {
    id: 1,
    url: partial.canonicalUrl,
    summary: "",
    sourceName: partial.sourceId,
    publishedAt: 10,
    expiresAt: null,
    publishedLabel: null,
    expiresLabel: null,
    expiresSoon: false,
    isNew: false,
    ...partial,
  };
}

describe("visible deals", () => {
  const deals = [
    deal({
      id: 1,
      canonicalUrl: "https://example.com/a",
      title: "SYNTHETIC 免费游戏",
      category: "游戏",
      sourceId: "epic",
      isNew: true,
      publishedAt: 30,
    }),
    deal({
      id: 2,
      canonicalUrl: "https://example.com/b",
      title: "SYNTHETIC 会员",
      category: "会员订阅",
      sourceId: "iplaysoft",
      isNew: false,
      publishedAt: 20,
    }),
    deal({
      id: 3,
      canonicalUrl: "https://example.com/c",
      title: "SYNTHETIC 旧免费",
      category: "免费白嫖",
      sourceId: "linuxdo",
      isNew: false,
      publishedAt: 40,
    }),
  ];

  it("filters SYNTHETIC rows by search, source, category, and new-this-round", () => {
    const personal = { claimed: ["https://example.com/c"], favorites: ["https://example.com/b"] };
    assert.deepEqual(
      filterDeals(deals, { query: "免费", sourceId: "all", category: "all", onlyNew: false }, personal).map(
        (item) => item.canonicalUrl,
      ),
      ["https://example.com/a", "https://example.com/c"],
    );
    assert.deepEqual(
      filterDeals(deals, { query: "", sourceId: "epic", category: "all", onlyNew: false }, personal).map(
        (item) => item.title,
      ),
      ["SYNTHETIC 免费游戏"],
    );
    assert.deepEqual(
      filterDeals(deals, { query: "", sourceId: "all", category: "游戏", onlyNew: true }, personal).map(
        (item) => item.canonicalUrl,
      ),
      ["https://example.com/a"],
    );
    assert.deepEqual(
      filterDeals(deals, { query: "", sourceId: "all", category: "favorites", onlyNew: false }, personal).map(
        (item) => item.canonicalUrl,
      ),
      ["https://example.com/b"],
    );
  });

  it("sorts SYNTHETIC rows with an expiry before undated ones", () => {
    const soon = deal({
      id: 4,
      canonicalUrl: "https://example.com/d",
      title: "SYNTHETIC 临期",
      category: "限免",
      sourceId: "epic",
      publishedAt: 5,
      expiresAt: 100,
    });
    const ordered = filterDeals(
      [...deals, soon],
      { query: "", sourceId: "all", category: "all", onlyNew: false, sort: "expiring" },
      { claimed: [], favorites: [] },
    ).map((item) => item.canonicalUrl);
    assert.equal(ordered[0], "https://example.com/d");
  });

  it("recommends verified games first, mixes sources, and searches words across fields", () => {
    const source = "slickdeals";
    const rows = [
      deal({ canonicalUrl: "https://example.com/s1", title: "Legion 7a with Ryzen", category: "低价优惠", sourceId: source, publishedAt: 100, offerKind: "coupon", firstSeenAt: 99_000_000 }),
      deal({ canonicalUrl: "https://example.com/s2", title: "A second discount", category: "低价优惠", sourceId: source, publishedAt: 90, firstSeenAt: 1 }),
      ...deals,
    ];
    const filters: DealFilters = { query: "", sourceId: "all", category: "all", onlyNew: false, sort: "recommended", now: 100_000_000 };
    const personal = { claimed: [], favorites: [] };
    assert.deepEqual(filterDeals(rows, filters, personal).map((item) => item.sourceId), ["epic", source, "linuxdo", "iplaysoft", source]);
    assert.deepEqual(filterDeals(rows, { ...filters, query: "ryzen LEGION 优惠码", onlyNew: true }, personal).map((item) => item.canonicalUrl), ["https://example.com/s1"]);
    assert.deepEqual(filterDeals(rows, { ...filters, sourceId: source, onlyNew: true }, personal).map((item) => item.canonicalUrl), ["https://example.com/s1"]);
  });

  it("sinks claimed SYNTHETIC rows under unclaimed ones", () => {
    const ordered = filterDeals(
      deals,
      { query: "", sourceId: "all", category: "all", onlyNew: false },
      { claimed: ["https://example.com/c"], favorites: [] },
    ).map((item) => item.canonicalUrl);
    assert.deepEqual(ordered, [
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
  });

  it("hides other-category leads only when includeOther is false", () => {
    const other = deal({
      id: 9,
      canonicalUrl: "https://example.com/other",
      title: "SYNTHETIC 闲聊",
      category: "其他",
      sourceId: "nodeseek",
      publishedAt: 50,
    });
    const rows = [...deals, other];
    const filters: DealFilters = { query: "", sourceId: "all", category: "all", onlyNew: false };
    const personal = { claimed: [], favorites: [] };
    assert.deepEqual(
      filterDeals(rows, { ...filters, includeOther: false }, personal).map((item) => item.canonicalUrl),
      ["https://example.com/c", "https://example.com/a", "https://example.com/b"],
    );
    assert.deepEqual(
      filterDeals(rows, { ...filters, includeOther: true }, personal).map((item) => item.canonicalUrl),
      ["https://example.com/other", "https://example.com/c", "https://example.com/a", "https://example.com/b"],
    );
    assert.deepEqual(
      filterDeals(rows, filters, personal).map((item) => item.canonicalUrl),
      ["https://example.com/other", "https://example.com/c", "https://example.com/a", "https://example.com/b"],
    );
  });
});
