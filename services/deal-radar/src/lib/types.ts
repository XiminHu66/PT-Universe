export const CATEGORIES = [
  "免费白嫖",
  "限免",
  "低价优惠",
  "会员订阅",
  "游戏",
  "其他",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const OFFER_LABELS = {
  "free-game": "免费领本体",
  "login-pack": "登录游戏领礼包",
  "game-promotion": "免费游戏活动 · 领取方式见官方",
  coupon: "需优惠码",
  "clip-coupon": "需勾选优惠券",
} as const;
export type OfferKind = keyof typeof OFFER_LABELS;

export type ParsedItem = {
  url: string;
  title: string;
  summary: string;
  publishedAt: number | null;
  expiresAt: number | null;
  offerKind?: OfferKind;
};

export type SourceQuality = {
  consecutiveFailures?: number;
  countDrop?: boolean;
  structureAnomaly?: boolean;
  warning?: string | null;
};

export type SourceStatus = {
  id: string;
  name: string;
  activeCount: number;
  lastOk: boolean | null;
  lastError: string | null;
  lastFetched: number | null;
  lastInserted: number | null;
  lastFinalUrl: string | null;
  quality?: SourceQuality;
};

export type DealDTO = {
  id: number;
  url: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  category: Category;
  sourceId: string;
  sourceName: string;
  publishedAt: number | null;
  expiresAt: number | null;
  publishedLabel: string | null;
  expiresLabel: string | null;
  expiresSoon: boolean;
  isNew: boolean;
  firstSeenAt?: number;
  offerKind?: OfferKind;
};

export type FailureDTO = {
  sourceId: string;
  sourceName: string;
  error: string;
};

export type FreshnessDTO = {
  lastRoundAgeMs: number | null;
  stale: boolean;
  severe: boolean;
};

export type BoardState = {
  generatedAt: number;
  lastUpdatedAt: number | null;
  lastUpdatedLabel: string | null;
  nextRefreshAt: number | null;
  nextRefreshLabel: string | null;
  sourceHealth: { ok: number; total: number };
  activeCount: number;
  newCount: number;
  refreshInProgress: boolean;
  roundStatus: "success" | "partial" | "failed" | null;
  failures: FailureDTO[];
  sources: SourceStatus[];
  deals: DealDTO[];
  /** Optional so callers building a partial board in tests stay compatible. */
  freshness?: FreshnessDTO;
  anomalies?: string[];
};
