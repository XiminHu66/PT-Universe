"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterDeals, isRecentDeal, matchDeals, type DealSort } from "@/lib/filter-deals";
import { normalizeBoardState, normalizeCachedPublicBoard, normalizePublicBoard } from "@/lib/board-view";
import { PUBLIC_READ_INTERVAL_MS, STALE_AFTER_MS } from "@/lib/config";
import { formatPacific } from "@/lib/time";
import { CATEGORIES, OFFER_LABELS, type BoardState, type Category, type DealDTO, type SourceStatus } from "@/lib/types";
import "./deal-board.css";

// 运行标识保持不变：本机收藏和已领依赖这个键与 { claimed, favorites } 形状。
const API_BASE = process.env.NEXT_PUBLIC_DEAL_RADAR_BASE_PATH ?? "";
const STORAGE_KEY = "daily-deals-personal-v1";

type Personal = { claimed: string[]; favorites: string[] };
type Alert = { text: string; role: "status" | "alert"; testId: string };
type PublicFeed = { url: string; homeUrl: string; managementUrl: string; embedded: boolean };

const emptyPersonal: Personal = { claimed: [], favorites: [] };
// 「查看全部线索」单独存，避免改动收藏键或 { claimed, favorites } 形状。
const SHOW_ALL_KEY = "daily-deals-show-all-v1";
const PUBLIC_BOARD_KEY = "daily-deals-public-board-v1";
const MAX_CACHED_BOARD_CHARS = 512_000;

function rememberPublicBoard(board: BoardState) {
  if (board.roundStatus === "failed") return;
  try {
    const raw = JSON.stringify(board);
    if (raw.length <= MAX_CACHED_BOARD_CHARS) sessionStorage.setItem(PUBLIC_BOARD_KEY, raw);
  } catch {
    // Restricted or full browser storage does not block the live board.
  }
}

function lastPublicBoard(current: BoardState, initial: BoardState): BoardState {
  const retained = normalizeCachedPublicBoard(current);
  if (retained) return retained;
  try {
    const raw = sessionStorage.getItem(PUBLIC_BOARD_KEY);
    if (raw && raw.length <= MAX_CACHED_BOARD_CHARS) return normalizeCachedPublicBoard(JSON.parse(raw)) ?? initial;
  } catch {
    // An unavailable or invalid snapshot is treated as an empty cache.
  }
  return initial;
}

function loadPersonal(): Personal {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPersonal;
    const parsed = JSON.parse(raw) as Partial<Personal>;
    return {
      claimed: Array.isArray(parsed.claimed) ? parsed.claimed.filter((item) => typeof item === "string") : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((item) => typeof item === "string") : [],
    };
  } catch {
    return emptyPersonal;
  }
}

function loadShowAll(): boolean {
  try {
    return localStorage.getItem(SHOW_ALL_KEY) === "1";
  } catch {
    return false;
  }
}

function readError(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const value = (data as { error?: unknown }).error;
  return typeof value === "string" ? value : null;
}

function formatSourceQuality(source: SourceStatus): string {
  const quality = source.quality;
  if (!quality) return "";
  if (quality.warning) return `；质量提醒：${quality.warning}`;
  if (quality.consecutiveFailures && quality.consecutiveFailures >= 3) return `；连续失败 ${quality.consecutiveFailures} 轮`;
  if (quality.structureAnomaly) return "；解析结构异常";
  if (quality.countDrop) return "；解析条数骤降";
  return "";
}

function formatSourceOutcome(source: SourceStatus): string {
  const quality = formatSourceQuality(source);
  if (source.lastOk == null) return `尚未抓取${quality}`;
  if (source.lastOk) return `成功 ${source.lastFetched ?? 0} 条，新增 ${source.lastInserted ?? 0} 条${quality}`;
  return `失败（${source.lastError ?? "原因未记录"}），下一轮重试${quality}`;
}

function formatFailure(failure: { sourceName: string; error: string }): string {
  return `${failure.sourceName}（${failure.error}）`;
}

/** 正式首页：服务端给初始快照，客户端挂载后展开，保留真实数据和本机状态。 */
export function DealBoard({ initial, publicFeed }: { initial: BoardState; publicFeed?: PublicFeed }) {
  const [board, setBoard] = useState<BoardState>(() => normalizeBoardState(initial) ?? initial);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState<string | "all">("all");
  const [category, setCategory] = useState<Category | "all" | "favorites">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  // 默认隐藏「其他」；展示偏好单独存，不写入本机收藏状态。
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [sort, setSort] = useState<DealSort>("recommended");
  const [personal, setPersonal] = useState<Personal>(emptyPersonal);
  const [personalReady, setPersonalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [pollError, setPollError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setBoard(normalizeBoardState(initial) ?? initial);
  }, [initial]);

  useEffect(() => {
    setShowAllLeads(loadShowAll());
    setPersonal(loadPersonal());
    setPersonalReady(true);
    // 另一个标签页改动本机状态后，重新读取，避免旧内存覆盖新值。
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== SHOW_ALL_KEY) return;
      if (event.key === null || event.key === SHOW_ALL_KEY) setShowAllLeads(loadShowAll());
      if (event.key !== SHOW_ALL_KEY) {
        setPersonal(loadPersonal());
        setPersonalReady(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (publicFeed) return;
    if (initial.lastUpdatedAt && !initial.refreshInProgress) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || attempts >= 15) return;
      attempts += 1;
      try {
        const response = await fetch(`${API_BASE}/api/deals/`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setPollError(true);
        } else {
          const data: unknown = await response.json().catch(() => null);
          const safe = normalizeBoardState(data);
          if (!safe) {
            if (!cancelled) setPollError(true);
          } else if (!cancelled) {
            setBoard(safe);
            setPollError(false);
            if (safe.lastUpdatedAt && !safe.refreshInProgress) return;
          }
        }
      } catch {
        if (!cancelled) setPollError(true);
      }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial, publicFeed]);

  useEffect(() => {
    if (!publicFeed) return;
    const controller = new AbortController();
    const nexus = publicFeed.embedded ? window.parent : null;
    let lastRequested = -Infinity;
    let pending = false;
    const tick = async () => {
      if (document.hidden || pending || Date.now() - lastRequested < PUBLIC_READ_INTERVAL_MS || (nexus && nexus.document.body.dataset.nexusView !== "deal-radar")) return;
      lastRequested = Date.now();
      pending = true;
      try {
        const data = await readPublicBoard(publicFeed.url, controller.signal);
        if (!controller.signal.aborted) {
          rememberPublicBoard(data);
          setBoard(data);
          setPollError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setBoard((current) => lastPublicBoard(current, initial));
          setPollError(true);
        }
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(tick, PUBLIC_READ_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    nexus?.addEventListener("nexus-view-change", tick);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      nexus?.removeEventListener("nexus-view-change", tick);
    };
  }, [initial, publicFeed]);

  function savePersonal(next: Personal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(null);
      setPersonal(next);
    } catch {
      // 隐私模式或配额满时，状态和存储必须显式说明不一致，而不是静默成功。
      setStorageError("收藏和已领没能写入这台浏览器（可能是隐私模式或存储已满），本次改动只在当前页面有效。");
    }
  }

  function saveShowAll(next: boolean) {
    setShowAllLeads(next);
    try {
      localStorage.setItem(SHOW_ALL_KEY, next ? "1" : "0");
    } catch {
      // 展示偏好写入失败只影响下次打开；当前页面仍按用户选择展示。
    }
  }

  function toggle(list: "claimed" | "favorites", canonicalUrl: string) {
    const latest = loadPersonal();
    const current = new Set(latest[list]);
    if (current.has(canonicalUrl)) current.delete(canonicalUrl);
    else current.add(canonicalUrl);
    savePersonal({ ...latest, [list]: [...current] });
  }

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    try {
      if (publicFeed) {
        const data = await readPublicBoard(publicFeed.url);
        rememberPublicBoard(data);
        setBoard(data);
        setPollError(false);
        return;
      }
      const response = await fetch(`${API_BASE}/api/refresh/`, { method: "POST", cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(readError(data) || "刷新没有完成");
        return;
      }
      const safe = normalizeBoardState(data);
      if (!safe) {
        setMessage("刷新结果格式异常，已保留当前列表。");
        return;
      }
      setBoard({ ...safe, refreshInProgress: false });
      setPollError(false);
    } catch {
      if (publicFeed) {
        setBoard((current) => lastPublicBoard(current, initial));
        setPollError(true);
      } else setMessage("网络异常，刷新没有完成");
    } finally {
      setRefreshing(false);
    }
  }

  function resetFilters() {
    setSourceId("all");
    setCategory("all");
    setQuery("");
    setOnlyNew(false);
    saveShowAll(false);
    setSort("recommended");
  }

  const claimedSet = new Set(personal.claimed);
  const favoriteSet = new Set(personal.favorites);
  // 「其他」只在默认的「全部」视图隐藏；显式选分类或收藏时仍按用户选择展示。
  const hideOther = !showAllLeads && category === "all";
  const now = Date.now();
  const filters = { query, sourceId, category, onlyNew, sort, now };
  const matching = category === "favorites" && !personalReady ? [] : filterDeals(board.deals, filters, personal);
  const visible = hideOther ? matching.filter((item) => item.category !== "其他") : matching;
  const hiddenOtherCount = matching.length - visible.length;
  const waitingForFirst = !board.lastUpdatedAt && (board.refreshInProgress || refreshing || Boolean(publicFeed && !pollError));
  const busy = refreshing || board.refreshInProgress;

  const updatedLabel = formatPacific(board.lastUpdatedAt);
  const nextLabel = formatPacific(board.nextRefreshAt);
  const statusItems = [
    { label: "更新", value: updatedLabel ? `${updatedLabel} 美西时间` : "尚未更新", testId: "status-update" },
    { label: "来源", value: `${board.sourceHealth.ok}/${board.sourceHealth.total}`, testId: "status-sources" },
    { label: "已收录", value: String(board.activeCount), testId: "status-active" },
    { label: "本轮新增", value: String(board.newCount), testId: "status-new" },
    { label: "下次更新", value: nextLabel ? `${nextLabel} 美西时间` : "尚未排期", testId: "status-next" },
  ];

  const alerts: Alert[] = [];
  if (pollError) alerts.push({ text: board.lastUpdatedAt ? "数据暂时不可用，显示的是上次成功读取的内容；恢复后会自动更新。" : "暂时无法读取优惠，稍后会自动重试。", role: "status", testId: "poll-error" });
  if (publicFeed && board.lastUpdatedAt && now - board.lastUpdatedAt > STALE_AFTER_MS) alerts.push({ text: "最近一轮抓取已超过 2.5 小时，优惠可能已变动，请以原文为准。", role: "status", testId: "stale-board" });
  if (storageError) alerts.push({ text: storageError, role: "alert", testId: "storage-error" });
  if (message) alerts.push({ text: message, role: "alert", testId: "refresh-message" });
  if (board.anomalies?.length) alerts.push({ text: `数据提示：${board.anomalies.join("；")}`, role: "status", testId: "anomalies" });
  if (board.failures.length) alerts.push({ text: `未能抓取，下一轮重试：${board.failures.map(formatFailure).join("、")}`, role: "status", testId: "failures" });

  const candidates = matchDeals(board.deals, { ...filters, sourceId: "all", category: "all" }, personal);
  const categoryCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  let allCategoryCount = 0;
  let allSourceCount = 0;
  for (const deal of candidates) {
    const isFavorite = personalReady && favoriteSet.has(deal.canonicalUrl);
    if (sourceId === "all" || sourceId === deal.sourceId) {
      categoryCounts.set(deal.category, (categoryCounts.get(deal.category) ?? 0) + 1);
      if (isFavorite) categoryCounts.set("favorites", (categoryCounts.get("favorites") ?? 0) + 1);
      if (showAllLeads || deal.category !== "其他") allCategoryCount += 1;
    }
    if (category === deal.category || (category === "favorites" && isFavorite) || (category === "all" && (!hideOther || deal.category !== "其他"))) {
      sourceCounts.set(deal.sourceId, (sourceCounts.get(deal.sourceId) ?? 0) + 1);
      allSourceCount += 1;
    }
  }

  const emptyMessage =
    category === "favorites" && !personalReady
      ? "正在读取这台浏览器里的收藏。"
      : pollError && board.deals.length === 0
        ? "数据暂时不可用，还无法读取条目；恢复后会自动更新，这里不会填入示例优惠。"
        : board.deals.length === 0
          ? board.lastUpdatedAt
            ? "这一轮没有已收录的条目。失败的来源会在下一轮重试，这里不会填入示例优惠。"
            : "服务端还没有完成抓取。空列表是真实状态，不会填入示例优惠。"
          : hiddenOtherCount > 0 && visible.length === 0
            ? "当前条件下只剩已隐藏的「其他」线索；打开「含其他线索」即可查看。"
            : "没有符合当前筛选的条目。";

  if (!mounted) return <div className="perk-board" data-testid="board-root"><div className="radar-loading" role="status" data-testid="loading">正在打开…</div></div>;

  const selectedSource = board.sources.find((source) => source.id === sourceId);
  const activeChips = [
    query.trim() ? { id: "query", label: query.trim(), clear: () => setQuery("") } : null,
    selectedSource ? { id: "source", label: selectedSource.name, clear: () => setSourceId("all") } : null,
    category !== "all" ? { id: "category", label: category === "favorites" ? "我的收藏" : category, clear: () => setCategory("all") } : null,
    onlyNew ? { id: "new", label: "过去 24 小时新增", clear: () => setOnlyNew(false) } : null,
    showAllLeads ? { id: "all", label: "含其他线索", clear: () => saveShowAll(false) } : null,
    sort !== "recommended" ? { id: "sort", label: sort === "expiring" ? "即将到期" : "最新发布", clear: () => setSort("recommended") } : null,
  ].filter((chip) => chip !== null);

  const embedded = publicFeed?.embedded;
  const refreshButton = <Button className="radar-refresh" data-testid="refresh" onClick={refresh} disabled={busy} aria-busy={busy}>
    <RefreshCw aria-hidden="true" />{busy ? "刷新中" : publicFeed ? "读取最新" : "立即刷新"}
  </Button>;

  return (
    <div className="perk-board" data-testid="board-root" data-embedded={embedded ? "nexus" : undefined}>
      {!embedded && <header className="radar-header" data-testid="header">
        <div className="radar-shell radar-header-inner">
          <a className="radar-brand" href={publicFeed?.homeUrl ?? `${API_BASE}/`} data-testid="brand">
            <span className="radar-mark"><Radar aria-hidden="true" /></span>
            <span><small>PT UNIVERSE / DEAL RADAR</small><strong>全球优惠雷达</strong></span>
          </a>
          {refreshButton}
        </div>
      </header>}

      <main className="radar-shell radar-main" data-testid="content">
        {alerts.length > 0 && <div className="radar-alerts" data-testid="alerts" aria-live="polite">
          {alerts.map((alert) => <p key={alert.testId} role={alert.role} data-testid={alert.testId}>{alert.text}</p>)}
        </div>}

        <section className="radar-controls" aria-label="搜索与筛选">
          <div className="radar-control-head">
            <form className="radar-search" role="search" onSubmit={(event) => event.preventDefault()}>
              <Search aria-hidden="true" />
              <label className="sr-only" htmlFor="deal-search">搜索优惠</label>
              <Input id="deal-search" type="search" data-testid="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索优惠、软件或游戏…" />
            </form>
            <select className="radar-sort" data-testid="sort" aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as DealSort)}>
              <option value="recommended">推荐优先</option>
              <option value="newest">最新发布</option>
              <option value="expiring">即将到期</option>
            </select>
            {embedded && refreshButton}
          </div>
          <div className="radar-filter" role="group" aria-label="来源筛选">
            <span className="radar-filter-label" aria-hidden="true">来源</span>
            <div className="radar-rail radar-sources">
              <Pill pressed={sourceId === "all"} testId="source-chip" onClick={() => setSourceId("all")}>全部来源<span>{allSourceCount}</span></Pill>
              {board.sources.map((source) => (
                <Pill key={source.id} pressed={sourceId === source.id} testId="source-chip" onClick={() => setSourceId(source.id)}>{source.name}<span>{sourceCounts.get(source.id) ?? 0}</span></Pill>
              ))}
            </div>
          </div>
          <div className="radar-filter" role="group" aria-label="分类筛选">
            <span className="radar-filter-label" aria-hidden="true">分类</span>
            <div className="radar-rail radar-categories">
              <Pill pressed={category === "all"} testId="category-chip" onClick={() => setCategory("all")}>全部优惠<span>{allCategoryCount}</span></Pill>
              {CATEGORIES.map((item) => (
                <Pill key={item} pressed={category === item} testId="category-chip" onClick={() => setCategory(item)}>{item}<span>{categoryCounts.get(item) ?? 0}</span></Pill>
              ))}
              <Pill pressed={category === "favorites"} testId="category-chip" onClick={() => setCategory(category === "favorites" ? "all" : "favorites")}><Bookmark aria-hidden="true" />我的收藏<span>{categoryCounts.get("favorites") ?? 0}</span></Pill>
            </div>
          </div>
        </section>

        <div className="radar-results" data-testid="results-heading">
          <div className="radar-result-title">
            <h1>优惠线索</h1>
            <span className="radar-count" role="status" data-testid="visible-count">{visible.length} 条</span>
          </div>
          <div className="radar-options">
            <label className="radar-option"><input type="checkbox" data-testid="only-new" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} />过去 24 小时新增</label>
            <label className="radar-option"><input type="checkbox" data-testid="show-all" checked={showAllLeads} onChange={(event) => saveShowAll(event.target.checked)} />含其他线索{hiddenOtherCount > 0 && <span data-testid="hidden-note"> +{hiddenOtherCount}</span>}</label>
          </div>
        </div>

        {activeChips.length > 0 && <div className="radar-active" aria-label="已选条件">
          <span>已选</span>
          {activeChips.map((chip) => <button key={chip.id} type="button" className="radar-active-chip" aria-label={`清除条件：${chip.label}`} onClick={chip.clear}><span>{chip.label}</span><X aria-hidden="true" /></button>)}
          <button type="button" className="radar-clear" data-testid="reset" onClick={resetFilters}>全部清除</button>
        </div>}

        <details className="radar-status" data-testid="source-results">
          <summary>
            <span className="radar-status-dot" data-status={board.roundStatus ?? "pending"} aria-hidden="true" />
            <span>来源 {board.sourceHealth.ok}/{board.sourceHealth.total}</span>
            <span className="radar-status-time">{updatedLabel ? `${updatedLabel} 美西更新` : "等待更新"}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <dl className="radar-status-grid" data-testid="stats">
            {statusItems.map((item) => <StatusItem key={item.label} label={item.label} value={item.value} testId={item.testId} />)}
          </dl>
          <ul>{board.sources.map((source) => <li key={source.id}>{source.name}：{formatSourceOutcome(source)}</li>)}</ul>
        </details>

        {waitingForFirst && <p className="radar-loading" role="status">{publicFeed ? "正在读取优惠…" : "正在进行首次抓取…"}</p>}

        <section className="radar-grid" aria-label="优惠列表" data-testid="cards">
          {visible.map((deal) => <DealCard
            key={deal.canonicalUrl}
            deal={deal}
            recent={isRecentDeal(deal, now)}
            claimed={personalReady && claimedSet.has(deal.canonicalUrl)}
            favorite={personalReady && favoriteSet.has(deal.canonicalUrl)}
            onClaim={() => toggle("claimed", deal.canonicalUrl)}
            onFavorite={() => toggle("favorites", deal.canonicalUrl)}
          />)}
        </section>

        {visible.length === 0 && !(publicFeed && waitingForFirst) && <div className="radar-empty" data-testid="empty-state">
          <Search aria-hidden="true" />
          <h2>没有可显示的条目</h2>
          <p>{emptyMessage}</p>
          {activeChips.length > 0 && <Button variant="outline" onClick={resetFilters}>清除筛选</Button>}
        </div>}

        <footer className="radar-footer" data-testid="footer">
          <ShieldCheck aria-hidden="true" />
          <p>每两小时更新，线索最多保留 7 天。Epic 活动来自官方商店，其他线索的实时价格、地区与资格以原文为准。</p>
          {publicFeed && <a className="radar-admin" href={publicFeed.managementUrl} target="_blank" rel="noopener noreferrer">私有抓取管理 <ArrowUpRight aria-hidden="true" /></a>}
        </footer>
      </main>
    </div>
  );
}

async function readPublicBoard(url: string, signal?: AbortSignal): Promise<BoardState> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 15000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    const board = response.ok ? normalizePublicBoard(await response.json()) : null;
    if (!board) throw Error("公开优惠暂时不可用");
    return board;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function StatusItem({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div data-testid={testId}><dt>{label}</dt><dd>{value}</dd></div>;
}

function Pill({ pressed, onClick, children, testId }: { pressed: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return <button type="button" className="radar-pill" aria-pressed={pressed} data-testid={testId} onClick={onClick}>{children}</button>;
}

function DealCard({ deal, recent, claimed, favorite, onClaim, onFavorite }: { deal: DealDTO; recent: boolean; claimed: boolean; favorite: boolean; onClaim: () => void; onFavorite: () => void }) {
  const published = formatPacific(deal.publishedAt);
  const expiry = formatPacific(deal.expiresAt);
  const hasDetails = deal.summary || published;
  return (
    <article className="radar-card" data-claimed={claimed} data-new={recent} data-testid="deal-card" aria-label={deal.title}>
      <div className="radar-card-top">
        <span className="radar-card-source" data-testid="deal-source" data-official={deal.sourceId === "epic"}>{deal.sourceName}</span>
        {recent && <span className="radar-new" data-testid="deal-new">新增</span>}
        <button type="button" className="radar-bookmark" data-testid="favorite" aria-label={`收藏：${deal.title}`} title={favorite ? "取消收藏" : "收藏"} aria-pressed={favorite} onClick={onFavorite}><Bookmark aria-hidden="true" /></button>
      </div>

      <h2 data-testid="deal-title" title={deal.title}>{deal.title}</h2>

      <div className="radar-card-meta">
        <span data-testid="deal-category">{deal.category}</span>
        {deal.offerKind && <span className="radar-condition" data-testid="deal-condition">{OFFER_LABELS[deal.offerKind]}</span>}
        {expiry ? <span className="radar-expiry" data-soon={deal.expiresSoon} data-testid="deal-expiry"><Clock3 aria-hidden="true" />{deal.expiresSoon ? "临期" : "到期"} {expiry} 美西</span> : <span>截止未确认</span>}
        {claimed && <span className="radar-claimed" data-testid="deal-claimed">已领</span>}
      </div>

      {hasDetails && <details className="radar-card-details" data-testid="deal-original">
        <summary>{deal.summary ? "原文摘要" : "发布时间"}<ChevronDown aria-hidden="true" /></summary>
        <div className="radar-detail-body" data-testid="deal-meta">
          {published && <p className="radar-published">来源发布时间 {published} 美西时间</p>}
          {deal.sourceId === "slickdeals" && <p className="radar-published">卡片价格来自订阅源，资格与实际到手价以结算页为准。</p>}
          {deal.summary && <p data-testid="deal-summary">{deal.summary}</p>}
        </div>
      </details>}

      <div className="radar-card-actions">
        <a href={deal.url} target="_blank" rel="noopener noreferrer" data-testid="open-original">打开原文<ArrowUpRight aria-hidden="true" /></a>
        <button type="button" className="radar-claim" data-testid="claim" aria-pressed={claimed} onClick={onClaim}><Check aria-hidden="true" />{claimed ? "撤销已领" : "标记已领"}</button>
      </div>
    </article>
  );
}
