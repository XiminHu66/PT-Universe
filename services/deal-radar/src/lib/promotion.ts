export const PROMOTION_SOURCES = {
  slickdeals: { name: "Slickdeals", url: "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1" },
  dealmoon: { name: "北美省钱快报", url: "https://www.dealmoon.com/" },
  bestbuy: { name: "Best Buy 活动页", url: "https://www.bestbuy.com/black-friday" },
  costco: { name: "Costco 活动页", url: "https://www.costco.com/o/-/black-friday" },
} as const;

export type PromotionSource = keyof typeof PROMOTION_SOURCES;

export const PROMOTION_CATEGORIES = {
  hardware: ["电脑 / NAS / 存储", /mini\s?pc|minisforum|beelink|gmktec|nas\b|synology|terra[mn]aster|nvme|[hs]sd\b|hdd\b|硬盘|主机|desktop|laptop|macbook|电脑|显卡|rtx\s?\d|ryzen|内存/i],
  gaming: ["游戏 / 掌机", /steam|switch|playstation|xbox|gaming|nintendo|游戏|掌机|quest\s?\d|xreal/i],
  reading: ["墨水屏 / 书 / 漫画", /kindle|kobo|boox|e-?ink|漫画|墨水屏|manga|graphic novel|box set|paperback|scribe|remarkable/i],
  desk: ["桌面 / 音频", /monitor|headphones?|earbuds?|airpods|keyboard|mouse|thunderbolt|usb.c|显示器|耳机|外设|键盘|鼠标|音响/i],
  home: ["家居 / 日用", /vacuum|litter|robot|home|kitchen|furniture|air fryer|coffee|cameras?|家具|扫地|洗地|厨|收纳|清洁|电饭|咖啡/i],
  other: ["其他", /.*/],
} satisfies Record<string, readonly [string, RegExp]>;

export type PromotionCategory = keyof typeof PROMOTION_CATEGORIES;
export type Lead = { title: string; url: string; source: PromotionSource; detail?: string; publishedAt?: number };
export type Quote = { name: string; price: number; availability: "in-stock" | "out-of-stock" | "unknown"; checkedAt: number; url: string; method?: "manual" };
export type SourceSnapshot = { checkedAt: number; leads: Lead[] };
export type Watch = {
  id: string; title: string; url: string; target: number | null; enabled: boolean;
  quote?: Quote; reference?: number; referenceDate?: string; error?: string; hitAt?: number;
};
export type Campaign = {
  id: string; name: string; start: string; end: string; keywords: string;
  sources: PromotionSource[]; snapshots: Partial<Record<PromotionSource, SourceSnapshot>>; watches: Watch[];
};

export function categoryOf(title: string): PromotionCategory {
  return (Object.keys(PROMOTION_CATEGORIES) as PromotionCategory[]).find(key => PROMOTION_CATEGORIES[key][1].test(title)) ?? "other";
}

export const FIRST_CAMPAIGN: Campaign = {
  id: "black-friday-2026", name: "2026 黑五 · Cyber Monday", start: "2026-11-27", end: "2026-11-30",
  keywords: "", sources: ["slickdeals", "dealmoon", "bestbuy", "costco"], snapshots: {}, watches: [],
};

export const MAX_ACTIVE_WATCHES = 10;

type MerchantProduct = { url: string; key: string; asin?: string; bestBuy?: { code?: string; sku?: string } };

export function merchantProduct(raw: string): MerchantProduct | null {
  const url = safeHttps(raw);
  if (!url || /%(2e|2f|5c|25)/i.test(url.pathname)) return null;
  const host = url.hostname.replace(/^www\./, "");
  let id: string | undefined;
  if (host === "amazon.com") {
    id = url.pathname.match(/\/(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase();
    return id ? { url: `https://www.amazon.com/dp/${id}`, key: `${host}/${id}`, asin: id } : null;
  }
  if (host === "bestbuy.com") {
    const listing = url.pathname.match(/^\/product\/[^/]+\/(J[A-Z0-9]{9})(?:\/sku\/(\d+))?\/?$/i);
    const code = listing?.[1]?.toUpperCase();
    const sku = listing?.[2] ?? url.pathname.match(/^\/site\/[^/]+\/(\d+)\.p\/?$/i)?.[1];
    return code || sku ? {
      url: `https://www.bestbuy.com${url.pathname.replace(/\/$/, "")}`,
      key: `${host}/${sku ?? code}`,
      bestBuy: { code, sku },
    } : null;
  }
  if (host === "costco.com") id = url.pathname.match(/^\/p\/[^?#]+\/(\d+)\/?$/i)?.[1]
    ?? url.pathname.match(/\.product\.(\d+)\.html$/i)?.[1];
  if (host === "newegg.com") id = url.pathname.match(/^\/(?:[^/]+\/)?p\/(N[A-Z0-9]+)\/?$/i)?.[1];
  if (host === "walmart.com") id = url.pathname.match(/^\/ip\/(?:[^/]+\/)?(\d+)\/?$/i)?.[1];
  if (host === "target.com") id = url.pathname.match(/^\/p\/(?:[^/]+\/)?-\/A-(\d+)\/?$/i)?.[1];
  return id ? { url: `https://www.${host}${url.pathname.replace(/\/$/, "")}`, key: `${host}/${id.toUpperCase()}` } : null;
}

export function safeHttps(raw: string): URL | null {
  if (typeof raw !== "string" || raw.length > 1200) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function priceValue(value: unknown): number | null {
  const raw = typeof value === "string" ? value.trim().replace(/^\$/, "").replaceAll(",", "") : value;
  if (typeof raw !== "number" && (typeof raw !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(raw))) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 && price < 1_000_000 ? Math.round(price * 100) / 100 : null;
}

export function updateQuote(watch: Watch, quote: Quote): Watch {
  const hit = watch.target !== null && quote.availability === "in-stock" && quote.price <= watch.target;
  return { ...watch, quote, error: undefined, hitAt: hit ? watch.hitAt ?? quote.checkedAt : undefined };
}

export function applyTarget(watch: Watch, target: number | null): Watch {
  if (watch.target === target) return watch;
  return { ...watch, target, hitAt: undefined };
}

export function classifyWatch(watch: Watch) {
  if (watch.error) return "待核实";
  if (!watch.quote) return "待核价";
  if (watch.quote.availability === "out-of-stock") return "缺货";
  if (watch.quote.availability === "unknown") return "库存待确认";
  if (watch.target === null) return "未设目标价";
  return watch.hitAt ? "已到价" : watch.quote.price <= watch.target ? "待复核" : "未到价";
}

export function parseImport(rows: unknown[][], id: () => string): Watch[] {
  const output: Watch[] = [];
  const seen = new Set<string>();
  const header = rows.findIndex(row => row.some(cell => /^(商品与精确型号|商品|title|name)$/i.test(String(cell ?? "").trim())));
  if (header < 0) throw Error("找不到商品名称列");
  const column = (pattern: RegExp) => rows[header].findIndex(cell => pattern.test(String(cell ?? "").trim()));
  const titleColumn = column(/^(商品与精确型号|商品|title|name)$/i);
  const urlColumn = column(/^(Amazon美国站|商品链接|链接|url|link)$/i);
  const targetColumn = column(/^(目标价|target|target_price)$/i);
  const referenceColumn = column(/^(Amazon公开报价\(\$\)|历史价|reference)$/i);
  const dateColumn = column(/^(公开报价日期|历史价日期|reference_date)$/i);
  if (urlColumn < 0) throw Error("找不到商品链接列");
  for (const row of rows.slice(header + 1, header + 301)) {
    const title = String(row[titleColumn] ?? "").trim().slice(0, 220);
    const url = safeHttps(String(row[urlColumn] ?? "").trim())?.href;
    const key = url && (merchantProduct(url)?.key ?? url);
    if (!title || !url || !key || seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: id(), title, url, target: priceValue(row[targetColumn]), enabled: false,
      reference: priceValue(row[referenceColumn]) ?? undefined,
      referenceDate: String(row[dateColumn] ?? "").trim().slice(0, 50) || undefined,
    });
  }
  if (!output.length) throw Error("文件里没有可导入的商品链接");
  return output;
}
