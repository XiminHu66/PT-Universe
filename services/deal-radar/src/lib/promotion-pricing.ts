export type DealPrice = {
  current?: number;
  original?: number;
  discount?: number;
  savings?: number;
  kind?: "exact" | "from" | "conditional";
  upTo?: boolean;
  basis?: "listed" | "before-promo";
  scope?: "warehouse" | "online" | "both";
  note?: string;
};

const amount = String.raw`\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d,]|\.\d)`;
const number = (raw?: string) => raw ? Number(raw.replaceAll(",", "")) : undefined;
const match = (text: string, pattern: string) => number(text.match(new RegExp(pattern, "i"))?.[1]);
const off = /(?:up to\s+)?(\d{1,2}(?:\.\d+)?|100)\s*%\s*(?:off|discount)|(?:立减|减)\s*(\d{1,2}(?:\.\d+)?|100)\s*%/i;

export function dealPrice(values: DealPrice): DealPrice {
  const valid = (n?: number) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : undefined;
  const current = valid(values.current);
  const original = valid(values.original);
  const savings = valid(values.savings);
  const discount = valid(values.discount);
  const pair = current !== undefined && original !== undefined && original > current;
  return {
    ...values, current, original: pair ? original : undefined, savings,
    upTo: pair ? undefined : values.upTo,
    discount: pair ? Math.round(1000 * (1 - current / original)) / 10 : discount && discount <= 100 ? discount : undefined,
    basis: pair ? values.basis : undefined,
  };
}

export function priceFromTitle(title: string, offerText = ""): DealPrice {
  const pricePart = title.split(/\+?\s*free\s+(?:s\s*&\s*h|ship(?:ping)?)|免运|满\s*\$/i)[0];
  const amounts = [...pricePart.matchAll(new RegExp(amount, "ig"))].map(item => number(item[1])!);
  const coupon = /\b(?:coupon|promo code|code\s*[:*]|apply code|in cart)\b|券后|用券|折扣码/i;
  const subscribe = /\b(?:s\s*&\s*s|subscribe\s*&\s*save)\b|订阅/i;
  const account = /\b(?:prime members?|select accounts?|members? only|with membership)\b|会员专享|限账号/i;
  const pricing = offerText.split(/\bshipping is\b|\bfree shipping\b|\bproduct description\b/i)[0].slice(0, 900);
  const text = `${title} ${pricing}`;
  const note = [subscribe.test(text) && "需订阅购", account.test(text) && "会员或指定账户", coupon.test(text) && "可能需券码或购物车折扣",
    /open.box|refurbished|翻新|开箱/i.test(title) && "翻新或开箱商品"].filter(Boolean).join(" · ") || undefined;
  if (/gift card|statement credit|返现|返礼品卡/i.test(title)) return { note: "涉及礼品卡或返现，查看原页" };

  const startsAt = /(?:from|starting at|as low as|low as)\s*\$|低至\s*\$|\$\s*[\d,.]+\s*(?:& (?:more|up)|and up|起)/i.test(pricePart);
  const conditional = !!note;
  const kind = startsAt ? "from" : conditional ? "conditional" : "exact";
  const saveOnly = /(?:save|up to|off|减|省)\s*\$|\$\s*[\d,.]+\s*(?:off|savings?|返)/i.test(pricePart);
  const was = match(pricePart, String.raw`(?:\bwas|\bregular(?:ly| price)?|\breg\.?|\bmsrp|\blist price|原价)\s*[:：]?\s*` + amount);
  const explicitNow = match(pricePart, String.raw`(?:\bonly|\bnow|\bfor|现价|到手价|券后)\s*[:：]?\s*` + amount);
  const change = pricePart.match(new RegExp(amount + String.raw`\s*(?:→|->|降至|now\s+)` + amount, "i"));
  let current = explicitNow ?? (change ? number(change[2]) : (amounts.length === 1 && !saveOnly && was === undefined ? amounts[0] : was && amounts.length === 2 ? amounts.find(value => value !== was) : undefined));
  const plusSave = match(pricePart, String.raw`(?:\bsave)\s+` + amount);
  const afterSave = match(pricePart, String.raw`\bafter\s+` + amount + String.raw`\s+(?:off|savings?)\b`);
  const original = was ?? number(change?.[1]);
  if (/\b(?:installments?|monthly|per month|per mo)\b|\/mo\b|月付|每月/i.test(title)) {
    return { note: "分期或月费，查看原页" };
  }
  const statedPercent = title.match(off);
  const discount = number(statedPercent?.[1] ?? statedPercent?.[2]);
  const chineseRate = title.match(/(低至|最低)?\s*([1-9](?:\.\d+)?)\s*折(?!扣)/);
  const statedRate = chineseRate ? Math.round((100 - Number(chineseRate[2]) * 10) * 10) / 10 : discount;
  const upTo = !!chineseRate?.[1] || /up to|最高/i.test(statedPercent?.[0] ?? "");
  if (startsAt) {
    current = match(pricePart, String.raw`(?:from|starting at|(?:as )?low as|低至)\s*` + amount) ?? current;
    return dealPrice({ current, kind, note });
  }

  // Feed bodies may contain multiple products and shipping thresholds. Accept
  // a coupon stack only when its exact final total agrees with the headline.
  const stack = pricing.match(new RegExp(amount + String.raw`[\s*]*[-–−][\s\S]{1,270}?(?:=|brings? (?:it|the total) to)\s*\**\s*` + amount, "i"));
  const base = number(stack?.[1]);
  const total = number(stack?.[2]);
  if (current !== undefined && base !== undefined && total !== undefined && Math.abs(current - total) <= 0.06 && base > total && /coupon|off|checkout|折扣|券/i.test(stack?.[0] ?? "")) {
    return dealPrice({ current: total, original: base, basis: "before-promo", kind: "conditional", note });
  }

  // Comparison between the title and a nearby exact price tolerates rounding
  // to cents, but a stale or conflicting body cannot override the source title.
  const nearby = match(pricing, String.raw`(?:\b(?:for|price|sale for)\s*[:：]?\s*\**\s*)` + amount);
  if (current !== undefined && nearby !== undefined && Math.abs(current - nearby) <= 0.06) current = nearby;
  const quotedOriginal = match(pricing, String.raw`(?:\bwas|\blist price|\bregular price|\bmsrp|原价)\s*[:：]?\s*\**\s*` + amount);
  const savings = afterSave ?? plusSave;
  const compare = original ?? (nearby === current && current !== undefined ? quotedOriginal : undefined);
  return dealPrice({
    current, original: compare ?? (current !== undefined && savings !== undefined ? current + savings : undefined),
    savings, discount: statedRate, upTo, kind, note, basis: compare ? "listed" : savings ? "before-promo" : undefined,
  });
}
