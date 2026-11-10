import { OFFER_LABELS, type Category, type DealDTO } from "./types";

export type DealSort = "recommended" | "newest" | "expiring";

export type DealFilters = {
  query: string;
  sourceId: string | "all";
  category: Category | "all" | "favorites";
  onlyNew: boolean;
  sort?: DealSort;
  /** 默认 true；只有明确传 false 才隐藏「其他」，避免影响既有调用。 */
  includeOther?: boolean;
  now?: number;
};

type Loose = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isRecentDeal(deal: DealDTO, now: number): boolean {
  return typeof deal.firstSeenAt === "number"
    ? deal.firstSeenAt > now - 24 * 60 * 60 * 1000 && deal.firstSeenAt <= now
    : deal.isNew === true;
}

export function matchDeals(
  deals: DealDTO[],
  filters: DealFilters,
  personal: { claimed: string[]; favorites: string[] },
): DealDTO[] {
  const looseFilters = filters as unknown as Loose;
  const loosePersonal = personal as unknown as Loose;
  const keywords = text(looseFilters.query).normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  const sourceId = text(looseFilters.sourceId) || "all";
  const category = text(looseFilters.category) || "all";
  const onlyNew = looseFilters.onlyNew === true;
  const now = finite(looseFilters.now, Date.now());
  // 省略字段时保持旧行为；正式页只在「全部」视图把「其他」排除。
  const includeOther = looseFilters.includeOther !== false;
  const favorites = stringSet(loosePersonal.favorites);
  const list = Array.isArray(deals) ? deals : [];

  return list.filter((item) => {
    const deal = item as unknown as Loose;
    if (keywords.length) {
      const condition = item.offerKind ? OFFER_LABELS[item.offerKind] : "";
      const aliases = item.offerKind === "login-pack" || deal.sourceId === "epic" ? "免费 游戏 Epic" : "";
      const searchable = [deal.title, deal.category, deal.sourceName, deal.sourceId, condition, aliases].map(text).join(" ").normalize("NFKC").toLowerCase();
      if (!keywords.every((keyword) => searchable.includes(keyword))) return false;
    }
    if (sourceId !== "all" && sourceId !== text(deal.sourceId)) return false;
    if (onlyNew && !isRecentDeal(item, now)) return false;
    const canonicalUrl = text(deal.canonicalUrl);
    if (!includeOther && text(deal.category) === "其他") return false;
    if (category === "favorites") return favorites.has(canonicalUrl);
    if (category !== "all" && category !== text(deal.category)) return false;
    return true;
  });
}

export function filterDeals(deals: DealDTO[], filters: DealFilters, personal: { claimed: string[]; favorites: string[] }): DealDTO[] {
  const claimed = stringSet(personal.claimed);
  const matched = matchDeals(deals, filters, personal).sort((a, b) => {
    const left = a as unknown as Loose;
    const right = b as unknown as Loose;
    const aClaimed = claimed.has(text(left.canonicalUrl)) ? 1 : 0;
    const bClaimed = claimed.has(text(right.canonicalUrl)) ? 1 : 0;
    if (aClaimed !== bClaimed) return aClaimed - bClaimed;
    if (filters.sort === "expiring") {
      const aExpiry = finite(left.expiresAt, Number.POSITIVE_INFINITY);
      const bExpiry = finite(right.expiresAt, Number.POSITIVE_INFINITY);
      if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    }
    const aTime = finite(left.publishedAt, 0);
    const bTime = finite(right.publishedAt, 0);
    return bTime - aTime;
  });
  if (filters.sort !== "recommended") return matched;

  const priority: DealDTO[] = [];
  const used: DealDTO[] = [];
  const groups = new Map<string, DealDTO[]>();
  for (const deal of matched) {
    if (claimed.has(deal.canonicalUrl)) used.push(deal);
    else if (deal.sourceId === "epic" || deal.expiresSoon) priority.push(deal);
    else {
      const group = groups.get(deal.sourceId) ?? [];
      group.push(deal);
      groups.set(deal.sourceId, group);
    }
  }
  priority.sort((a, b) => Number(b.offerKind === "free-game") - Number(a.offerKind === "free-game") || (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
  const mixed: DealDTO[] = [];
  for (let index = 0; mixed.length + priority.length + used.length < matched.length; index += 1) {
    for (const group of groups.values()) if (group[index]) mixed.push(group[index]);
  }
  return [...priority, ...mixed, ...used];
}
