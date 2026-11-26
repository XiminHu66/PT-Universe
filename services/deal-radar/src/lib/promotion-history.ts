import { merchantProduct, priceValue, safeHttps, type Lead, type Quote } from "./promotion";

const datePacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const MAX_PRICE_RECORDS = 600;

type Observation = { key: string; price: number; at: number };
export type ObservedLow = { price: number; lowAt: number; firstAt: number; lastAt: number };
export type PriceHistory = Record<string, ObservedLow>;

function steamProduct(raw: string) {
  const url = safeHttps(raw);
  return url?.hostname === "store.steampowered.com" ? url.pathname.match(/^\/(app|sub|bundle)\/(\d{1,12})(?:\/[^/]+)?\/?$/i) : null;
}

export function priceHistoryLink(url: string) {
  const product = merchantProduct(url);
  if (product?.asin) return { name: "Keepa 价格历史", href: `https://keepa.com/#!product/1-${product.asin}` };
  const steam = steamProduct(url);
  return steam?.[1] === "app" ? { name: "SteamDB 价格历史", href: `https://steamdb.info/app/${steam[2]}/` } : null;
}

export function observeLead(lead: Lead, checkedAt: number): Observation | null {
  const offer = lead.offer;
  const price = priceValue(offer?.current);
  if (price === null || offer?.kind === "from" || offer?.kind === "conditional" || offer?.note ||
    !Number.isFinite(checkedAt) || checkedAt <= 0) return null;
  const date = datePacific.format(checkedAt);
  if (lead.validFrom && date < lead.validFrom || lead.validUntil && date > lead.validUntil) return null;
  if (lead.source === "steam") {
    const match = steamProduct(lead.url);
    return match ? { key: `feed:steam/${match[1]}/${match[2]}`, price, at: checkedAt } : null;
  }
  if (!["costco", "walmart", "newegg", "bestbuy"].includes(lead.source)) return null;
  const product = merchantProduct(lead.url);
  return product ? { key: `feed:${lead.source}:${product.key}:${offer?.scope ?? "unspecified"}`, price, at: checkedAt } : null;
}

export function quoteHistoryKey(url: string) {
  const product = merchantProduct(url);
  return product ? `quote:${product.key}` : null;
}

export function observeQuote(quote: Quote): Observation | null {
  const key = quoteHistoryKey(quote.url);
  const price = priceValue(quote.price);
  return key && price !== null && quote.availability === "in-stock" && !quote.method &&
    Number.isFinite(quote.checkedAt) && quote.checkedAt > 0 ? { key, price, at: quote.checkedAt } : null;
}

export function recordPrices(previous: PriceHistory | undefined, observations: (Observation | null)[]): PriceHistory | undefined {
  const valid = observations.filter((item): item is Observation => item !== null);
  if (!valid.length) return previous;
  const history = { ...previous };
  for (const { key, price, at } of valid) {
    const entry = history[key];
    if (!entry) {
      history[key] = { price, lowAt: at, firstAt: at, lastAt: at };
    } else {
      const lower = price < entry.price || price === entry.price && at < entry.lowAt;
      history[key] = {
        price: lower ? price : entry.price,
        lowAt: lower ? at : entry.lowAt,
        firstAt: Math.min(at, entry.firstAt),
        lastAt: Math.max(at, entry.lastAt),
      };
    }
  }
  const rows = Object.entries(history);
  if (rows.length <= MAX_PRICE_RECORDS) return history;
  return Object.fromEntries(rows.sort((a, b) => b[1].lastAt - a[1].lastAt).slice(0, MAX_PRICE_RECORDS));
}

export function showObservedLow(history: PriceHistory | undefined, key: string | null | undefined): ObservedLow | undefined {
  const row = key && history?.[key];
  if (row && Number.isFinite(row.lowAt) && Number.isFinite(row.firstAt) && Number.isFinite(row.lastAt) &&
    datePacific.format(row.firstAt) !== datePacific.format(row.lastAt)) return row;
}
