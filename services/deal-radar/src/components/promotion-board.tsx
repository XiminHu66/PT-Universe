"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImageIcon } from "lucide-react";
import {
  applyTarget, categoryOf, classifyWatch, FIRST_CAMPAIGN, MAX_ACTIVE_WATCHES, merchantProduct,
  parseImport, priceValue, promotionImageUrl, PROMOTION_CATEGORIES, PROMOTION_SOURCES, safeHttps, updateCampaignSources, updateQuote,
  type Campaign, type Lead, type PromotionCategory, type PromotionSource, type Quote, type SourceSnapshot, type Watch,
} from "@/lib/promotion";
import { formatPacific } from "@/lib/time";
import { chineseTitle, productTitle } from "@/lib/promotion-language";
import { priceFromTitle } from "@/lib/promotion-pricing";
import { observeLead, observeQuote, priceHistoryLink, quoteHistoryKey, recordPrices, showObservedLow, type ObservedLow, type PriceHistory } from "@/lib/promotion-history";

const API = "https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-radar/promo/";
const STORE = "pt.deal-radar.promotions.v1";
const MAX_CAMPAIGNS = 24;
const MAX_WATCHES = 150;
const sources = Object.keys(PROMOTION_SOURCES) as PromotionSource[];
const datePacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const PAGE_SIZE = 24;
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const makeId = () => crypto.randomUUID();
const displayTime = (time: number) => formatPacific(time) ?? "";
const terms = (value: string) => value.toLowerCase().split(/[,，]/).map(term => term.trim()).filter(Boolean);

type Task = { key: string; label: string; source?: PromotionSource; status: "waiting" | "running" | "done" | "failed"; detail?: string; work: () => Promise<string> };
type Store = { active: string; campaigns: Campaign[]; history?: PriceHistory };
const initial: Store = { active: FIRST_CAMPAIGN.id, campaigns: [FIRST_CAMPAIGN] };
type OwnerConnection = { token: () => string | null; connect: () => void };
type Sort = "latest" | "discount" | "price";
type Translation = { translate: (text: string) => Promise<string>; destroy: () => void };
type TranslatorAPI = { create: (options: { sourceLanguage: "en"; targetLanguage: "zh" }) => Promise<Translation> };

function getTranslator() {
  return (globalThis as typeof globalThis & { Translator?: TranslatorAPI }).Translator;
}

function dates(lead: Lead) {
  return lead.validFrom && lead.validUntil
    ? `${lead.validFrom.replaceAll("-", "/")} – ${lead.validUntil.replaceAll("-", "/")}` : "";
}

function DealThumbnail({ lead }: { lead: Lead }) {
  const image = promotionImageUrl(lead.source, lead.imageUrl);
  const [failed, setFailed] = useState<string>();
  return <div className="promo-thumbnail" aria-hidden="true">
    {image && failed !== image
      // The source has already provided a sized thumbnail and the public Pages build has no image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={image} alt="" width={96} height={96} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(image)} />
      : <ImageIcon size={23} strokeWidth={1.5} />}
  </div>;
}

function HistoryLabels({ url, low }: { url: string; low?: ObservedLow }) {
  const external = priceHistoryLink(url);
  if (!low && !external) return null;
  return <p className="promo-price-history">
    {low && <span title={`记录起始 ${datePacific.format(low.firstAt)}`}>本机记录最低 <strong>{currency.format(low.price)}</strong> · {datePacific.format(low.lowAt)}</span>}
    {external && <External url={external.href}>{external.name} ↗</External>}
  </p>;
}

function PriceLabels({ lead }: { lead: Lead }) {
  const price = lead.offer ?? priceFromTitle(lead.title);
  const hasPrice = price.current !== undefined;
  const scope = { both: "仓库与线上活动", warehouse: "仓库活动", online: "线上活动" } as const;
  return <>
    <dl className="promo-card-prices">
      <div><dt>{price.kind === "from" ? "起售价" : price.kind === "conditional" ? "优惠后" : "活动价"}</dt>
        <dd className="promo-card-now" data-known={hasPrice}>{hasPrice ? currency.format(price.current!) : "未公布"}</dd></div>
      <div><dt>{price.basis === "before-promo" ? "优惠前" : "来源原价"}</dt><dd>{price.original ? <s>{currency.format(price.original)}</s> : "未提供"}</dd></div>
      <div><dt>折扣</dt><dd>{price.discount ? <strong className="promo-discount">{price.upTo ? "最高 " : ""}省 {price.discount}%</strong>
        : price.savings ? <strong className="promo-discount">省 {currency.format(price.savings)}</strong> : "缺少依据"}</dd></div>
    </dl>
    {(price.scope || price.note) && <p className="promo-offer-condition">
      {[price.scope && scope[price.scope], price.note].filter(Boolean).join(" · ")}
    </p>}
  </>;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return initial;
    const data = JSON.parse(raw) as Store;
    if (Array.isArray(data.campaigns) && data.campaigns.length && data.campaigns.every(c => c?.id && c?.name && Array.isArray(c.sources) && Array.isArray(c.watches) && c.snapshots)) {
      return { ...data, campaigns: data.campaigns.map(updateCampaignSources) };
    }
  } catch { /* A fresh state is usable if storage is disabled. */ }
  return initial;
}

async function request<T>(id: string, options?: { url: string; token: string }): Promise<T> {
  const response = await fetch(API + id, {
    method: "POST", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(22_000),
    ...(options ? { headers: { "content-type": "application/json", authorization: "Bearer " + options.token }, body: JSON.stringify({ url: options.url }) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Error(data?.error ?? `后台 HTTP ${response.status}`);
  return data as T;
}

function watchKey(watch: Watch) {
  return merchantProduct(watch.url)?.key ?? (watch.url || watch.title.toLowerCase());
}

function listingSearch(query: string) {
  return `../deal-lab/?q=${encodeURIComponent(query)}#products`;
}

function External({ url, children }: { url: string; children: React.ReactNode }) {
  return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function CampaignEditor({ campaign, onSave, onClose }: { campaign: Campaign; onSave: (next: Campaign) => void; onClose: () => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const start = String(data.get("start") ?? "");
    const end = String(data.get("end") ?? "");
    const checkedSources = sources.filter(source => data.has(source));
    if (!name || !start || !end || start > end || !checkedSources.length) {
      setError("填写活动名称、正确的起止日期，并至少选择一个来源。");
      return;
    }
    onSave({ ...campaign, name, start, end, keywords: String(data.get("keywords") ?? "").trim(), sources: checkedSources });
  }
  return <form className="promo-panel promo-form" onSubmit={submit}>
    <div className="promo-editor-fields">
      <label>活动名称<input name="name" required maxLength={80} defaultValue={campaign.name} /></label>
      <label>开始日期<input name="start" type="date" required defaultValue={campaign.start} /></label>
      <label>结束日期<input name="end" type="date" required defaultValue={campaign.end} /></label>
    </div>
    <label>优惠关键词，逗号分隔，任一命中<input name="keywords" maxLength={200} defaultValue={campaign.keywords} placeholder="例如：SSD，Mini PC，掌机" /></label>
    <fieldset><legend>刷新来源</legend><div className="promo-controls">
      {sources.map(source => <label key={source} className="promo-check"><input type="checkbox" name={source} defaultChecked={campaign.sources.includes(source)} />{PROMOTION_SOURCES[source].name}</label>)}
    </div></fieldset>
    <p className="promo-muted">Costco、Walmart 为黑五专题，其他渠道也可用于日常优惠。页面显示各来源当时发布的内容。</p>
    {error && <p role="alert">{error}</p>}
    <div className="promo-controls"><button className="promo-primary" type="submit">保存活动</button><button type="button" onClick={onClose}>取消</button></div>
  </form>;
}

function WatchEditor({ watch, onSave, onClose }: { watch: Watch | null; onSave: (value: Watch) => void; onClose: () => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const raw = String(data.get("url") ?? "").trim();
    const url = raw ? safeHttps(raw)?.href : "";
    const target = priceValue(data.get("target"));
    if (!title || url === undefined || (data.get("target") && target === null)) {
      setError("请填写名称、有效的 HTTPS 链接和大于 0 的目标价。");
      return;
    }
    const base = watch && url === watch.url ? watch : { id: watch?.id ?? makeId(), title, url, target: null, enabled: watch?.enabled ?? false };
    const edited = { ...applyTarget(base, target), title, url };
    const manualPrice = priceValue(data.get("manualPrice"));
    if (data.get("manualPrice") && (!url || manualPrice === null)) {
      setError("记录现价时请填写商品链接和大于 0 的价格。");
      return;
    }
    onSave(manualPrice && url ? updateQuote(edited, {
      name: title, price: manualPrice, url, method: "manual", checkedAt: Date.now(),
      availability: data.has("inStock") ? "in-stock" : "unknown",
    }) : edited);
  }
  return <form className="promo-form promo-edit-watch" onSubmit={submit}>
    <div className="promo-editor-fields">
      <label>商品名称或匹配词<input name="title" required maxLength={220} defaultValue={watch?.title} placeholder="型号，或 Mini PC, 64GB" /></label>
      <label>商品链接<input name="url" type="url" maxLength={1200} defaultValue={watch?.url} placeholder="留空时按关键词匹配优惠" /></label>
      <label>目标价（USD）<input name="target" type="number" min="0.01" max="999999.99" step="0.01" defaultValue={watch?.target ?? ""} /></label>
    </div>
    <details>
      <summary>记录我在商家页面看到的价格</summary>
      <div className="promo-controls promo-manual-price">
        <label>当前实付价（USD）<input name="manualPrice" type="number" min="0.01" max="999999.99" step="0.01" /></label>
        <label className="promo-check"><input type="checkbox" name="inStock" />我已确认有货</label>
      </div>
    </details>
    {error && <p role="alert">{error}</p>}
    <div className="promo-controls"><button className="promo-primary" type="submit">保存追踪</button><button type="button" onClick={onClose}>取消</button></div>
  </form>;
}

export function PromotionBoard({ owner }: { owner: OwnerConnection }) {
  const [state, setState] = useState<Store>(initial);
  const current = useRef(state);
  const running = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Omit<Task, "work">[]>([]);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [editor, setEditor] = useState<Campaign | null>(null);
  const [watchEditor, setWatchEditor] = useState<Watch | "new" | null>(null);
  const [watchError, setWatchError] = useState("");
  const [category, setCategory] = useState<PromotionCategory | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<PromotionSource | "all">("all");
  const [query, setQuery] = useState("");
  const [watchQuery, setWatchQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [sort, setSort] = useState<Sort>("latest");
  const [pricedOnly, setPricedOnly] = useState(false);
  const [comparedOnly, setComparedOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showProgress, setShowProgress] = useState(false);
  const [localized, setLocalized] = useState<Record<string, string>>({});
  const [translationStatus, setTranslationStatus] = useState("");
  const watchDialog = useRef<HTMLDialogElement>(null);
  const translating = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    current.current = readStore();
    setState(current.current);
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== STORE) return;
      current.current = readStore();
      setState(current.current);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function change(update: (value: Store) => Store) {
    const next = update(current.current);
    current.current = next;
    setState(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  function editCampaign(id: string, update: (c: Campaign) => Campaign) {
    change(value => ({ ...value, campaigns: value.campaigns.map(c => c.id === id ? update(c) : c) }));
  }

  function editWatch(campaignId: string, watchId: string, update: (watch: Watch) => Watch) {
    editCampaign(campaignId, value => ({ ...value, watches: value.watches.map(w => w.id === watchId ? update(w) : w) }));
  }

  const campaign = state.campaigns.find(c => c.id === state.active) ?? state.campaigns[0];
  const latest = campaign.sources.map(source => campaign.snapshots[source]?.checkedAt ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const selectedWatches = campaign.watches.filter(watch => watch.enabled && merchantProduct(watch.url));
  function displayTitle(lead: Lead) {
    return localized[lead.title] ?? chineseTitle(lead.title);
  }

  const allLeads = campaign.sources.flatMap(source => campaign.snapshots[source]?.leads ?? []);
  const campaignWords = terms(campaign.keywords);
  const queryWords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const cap = priceValue(maxPrice);
  const leadCategory = (lead: Lead) => categoryOf(`${lead.title} ${displayTitle(lead)}`, lead.source);
  const availableLeads = allLeads.filter(lead => {
    const text = `${displayTitle(lead)} ${lead.title} ${lead.detail ?? ""} ${PROMOTION_SOURCES[lead.source].name}`.toLowerCase();
    const offer = lead.offer ?? priceFromTitle(lead.title);
    const price = offer.current;
    return (sourceFilter === "all" || lead.source === sourceFilter) &&
      queryWords.every(word => text.includes(word)) &&
      (!campaignWords.length || campaignWords.some(word => text.includes(word))) &&
      (!pricedOnly || price !== undefined) && (cap === null || (price !== undefined && price <= cap)) &&
      (!comparedOnly || !!(offer.discount || offer.savings));
  });
  const categoryCounts = new Map<PromotionCategory, number>();
  for (const lead of availableLeads) {
    const key = leadCategory(lead);
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  }
  const groups = new Map<string, Lead[]>();
  for (const lead of availableLeads) {
    if (category !== "all" && leadCategory(lead) !== category) continue;
    const key = merchantProduct(lead.url)?.key ?? lead.title.toLowerCase().replace(/\s+/g, " ");
    const group = groups.get(key);
    if (group) group.push(lead);
    else groups.set(key, [lead]);
  }
  const today = datePacific.format(new Date());
  const order = [...groups.values()].sort(([a], [b]) => {
    const ap = a.offer ?? priceFromTitle(a.title);
    const bp = b.offer ?? priceFromTitle(b.title);
    if (sort === "price") return (ap.current ?? Infinity) - (bp.current ?? Infinity);
    if (sort === "discount") return (bp.discount ?? -1) - (ap.discount ?? -1);
    return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
  });
  const savedKeys = new Set(campaign.watches.map(watchKey));
  const filtersActive = !!query || !!maxPrice || pricedOnly || comparedOnly || sourceFilter !== "all" || category !== "all";
  const untranslated = allLeads.filter(lead => !/\p{Script=Han}/u.test(lead.title) && !localized[lead.title]);

  useEffect(() => {
    const dialog = watchDialog.current;
    if (watchEditor && dialog && !dialog.open) dialog.showModal();
    if (!watchEditor && dialog?.open) dialog.close();
  }, [watchEditor]);

  async function translateTitles() {
    const translatorAPI = getTranslator();
    if (!translatorAPI || translating.current || !untranslated.length) return;
    translating.current = true;
    setTranslationStatus("正在准备浏览器翻译…");
    let engine: Translation | undefined;
    try {
      engine = await translatorAPI.create({ sourceLanguage: "en", targetLanguage: "zh" });
      const updates: Record<string, string> = {};
      const unique = [...new Set(untranslated.map(lead => lead.title))].slice(0, 128);
      for (const title of unique) {
        const result = await engine.translate(productTitle(title)).catch(() => "");
        if (/\p{Script=Han}/u.test(result)) updates[title] = result.trim().slice(0, 220);
      }
      setLocalized(previous => ({ ...previous, ...updates }));
      setTranslationStatus(Object.keys(updates).length ? `已翻译 ${Object.keys(updates).length} 条标题` : "暂未读到翻译结果");
    } catch {
      setTranslationStatus("浏览器翻译暂不可用，已保留中文商品关键词和原文。");
    } finally {
      engine?.destroy();
      translating.current = false;
    }
  }

  function resetFilters() {
    setCategory("all"); setSourceFilter("all"); setQuery(""); setPricedOnly(false); setComparedOnly(false); setMaxPrice(""); setVisibleCount(PAGE_SIZE);
  }

  const watchResults = campaign.watches.filter(watch => (!onlySelected || watch.enabled) && watch.title.toLowerCase().includes(watchQuery.trim().toLowerCase()))
    .sort((a, b) => Number(classifyWatch(b) === "已到价") - Number(classifyWatch(a) === "已到价") || Number(b.enabled) - Number(a.enabled));
  const done = tasks.filter(task => task.status === "done" || task.status === "failed").length;
  const failed = tasks.filter(task => task.status === "failed").length;
  const hasFailedSources = tasks.some(task => task.status === "failed" && task.source);
  const hits = campaign.watches.filter(watch => classifyWatch(watch) === "已到价").length;

  async function refresh(kind: "all" | "watch" | "failed-sources", single?: Watch) {
    if (running.current) return;
    const pending: Task[] = [];
    const id = campaign.id;
    const failedSources = new Set(tasks.filter(task => task.source && task.status === "failed").map(task => task.source));
    const append = (key: string, label: string, work: Task["work"], source?: PromotionSource) =>
      pending.push({ key, label, source, status: "waiting", work });
    const selectedSources = kind === "all" ? campaign.sources :
      kind === "failed-sources" ? campaign.sources.filter(source => failedSources.has(source)) : [];
    for (const source of selectedSources) append(source, PROMOTION_SOURCES[source].name, async () => {
      const snapshot = await request<SourceSnapshot>(source);
      if (!Array.isArray(snapshot.leads) || !Number.isFinite(snapshot.checkedAt)) throw Error("后台返回的优惠格式无效");
      change(value => ({
        ...value,
        history: recordPrices(value.history, snapshot.leads.map(lead => observeLead(lead, snapshot.checkedAt))),
        campaigns: value.campaigns.map(c => {
          if (c.id !== id) return c;
          const previous = new Map(c.snapshots[source]?.leads.map(lead => [lead.url, lead.imageUrl]));
          const leads = snapshot.leads.map(lead => {
            const imageUrl = promotionImageUrl(source, lead.imageUrl) ?? promotionImageUrl(source, previous.get(lead.url));
            return { ...lead, imageUrl };
          });
          return { ...c, snapshots: { ...c.snapshots, [source]: { ...snapshot, leads } } };
        }),
      }));
      return `${snapshot.leads.length} 条优惠`;
    }, source);
    const watches = single ? [single] : kind === "all" ? selectedWatches : [];
    for (const watch of watches) append(watch.id, watch.title, async () => {
      try {
        const token = owner.token();
        if (!token) throw Error("请连接 PT 私有后台后核价");
        const { quote } = await request<{ quote: Quote }>("quote", { url: watch.url, token });
        if (!quote || priceValue(quote.price) === null || !Number.isFinite(quote.checkedAt)) throw Error("后台返回的报价格式无效");
        change(value => ({
          ...value,
          history: recordPrices(value.history, [observeQuote(quote)]),
          campaigns: value.campaigns.map(c => c.id !== id ? c : {
            ...c, watches: c.watches.map(w => w.id === watch.id ? updateQuote(w, quote) : w),
          }),
        }));
        return quote.availability === "in-stock" ? currency.format(quote.price) : quote.availability === "out-of-stock" ? "缺货" : "库存待确认";
      } catch (error) {
        editWatch(id, watch.id, currentWatch => ({ ...currentWatch, error: error instanceof Error ? error.message : "核价失败" }));
        throw error;
      }
    });
    if (!pending.length) return;
    running.current = true;
    setBusy(true);
    setShowProgress(true);
    setNotice("");
    setTasks(pending.map(({ key, label, source, status }) => ({ key, label, source, status })));
    function mark(key: string, status: Task["status"], detail?: string) {
      setTasks(previous => previous.map(item => item.key === key ? { ...item, status, detail } : item));
    }
    async function execute(task: Task) {
      mark(task.key, "running");
      try { mark(task.key, "done", await task.work()); }
      catch (error) { mark(task.key, "failed", error instanceof Error ? error.message : "请求失败"); }
    }
    try {
      let nextTask = 0;
      async function runQueue() {
        while (nextTask < pending.length) {
          await execute(pending[nextTask++]);
        }
      }
      await Promise.all([runQueue(), runQueue(), runQueue()]);
    } finally {
      running.current = false;
      setShowProgress(false);
      setBusy(false);
    }
  }

  function resetView() {
    setTasks([]); setNotice(""); setEditor(null); setWatchEditor(null);
    resetFilters(); setSort("latest"); setWatchQuery(""); setOnlySelected(false);
  }

  function saveCampaign(next: Campaign) {
    change(value => ({
      ...value,
      active: next.id,
      campaigns: value.campaigns.some(c => c.id === next.id) ? value.campaigns.map(c => c.id === next.id ? next : c) : [...value.campaigns, next],
    }));
    resetView();
  }

  function saveWatch(watch: Watch) {
    const existing = campaign.watches.some(entry => entry.id === watch.id);
    const duplicate = campaign.watches.some(entry => entry.id !== watch.id && watchKey(entry) === watchKey(watch));
    if (duplicate || (!existing && campaign.watches.length >= MAX_WATCHES)) {
      setWatchError(duplicate ? "这个商品已在清单内。" : `最多保存 ${MAX_WATCHES} 件商品。`);
      return;
    }
    const next = { ...watch, enabled: watch.enabled && !!merchantProduct(watch.url) };
    editCampaign(campaign.id, c => ({ ...c, watches: c.watches.some(w => w.id === watch.id) ? c.watches.map(w => w.id === watch.id ? next : w) : [...c.watches, next] }));
    setWatchEditor(null);
    setWatchError("");
    setNotice(existing ? "已更新追踪。" : "已加入我的追踪。");
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith(".xlsx")) {
      setNotice("选择 2 MB 以内的 .xlsx 文件。");
      return;
    }
    const id = campaign.id;
    try {
      const { default: readExcel } = await import("read-excel-file");
      const imported = parseImport(await readExcel(file), makeId);
      let added = 0;
      editCampaign(id, value => {
        const keys = new Set(value.watches.map(watchKey));
        const unique = imported.filter(watch => !keys.has(watchKey(watch))).slice(0, MAX_WATCHES - value.watches.length);
        added = unique.length;
        return { ...value, watches: [...value.watches, ...unique] };
      });
      setNotice(`已导入 ${added} 件。勾选要核价的商品并设置目标价。`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "导入失败"); }
  }

  function addLead(lead: Lead) {
    setWatchEditor({ id: makeId(), title: displayTitle(lead), originalTitle: productTitle(lead.title), url: lead.url, target: null, enabled: false });
  }

  function connectOwner() {
    try { owner.connect(); } catch (error) { setNotice(error instanceof Error ? error.message : "连接失败"); }
  }

  return <main className="promo-board">
    <header className="promo-heading">
      <div><h1>{campaign.name === "2026 黑五 · Cyber Monday" ? FIRST_CAMPAIGN.name : campaign.name}</h1><p>{campaign.start} 至 {campaign.end} · 美国站 / 美元 {latest ? `· 最近读取 ${displayTime(latest)}` : ""}</p></div>
      <button className="promo-primary" type="button" disabled={!ready || busy || !!editor || !!watchEditor} onClick={() => void refresh("all")}>{busy ? "正在刷新…" : "手动刷新"}</button>
    </header>
    <div className="promo-controls promo-campaign-controls">
      <label>活动 <select value={campaign.id} disabled={!ready || busy} onChange={event => { const active = event.target.value; change(value => ({ ...value, active })); resetView(); }}>
        {state.campaigns.map(c => <option key={c.id} value={c.id}>{c.name === "2026 黑五 · Cyber Monday" ? FIRST_CAMPAIGN.name : c.name}</option>)}
      </select></label>
      <button type="button" disabled={!ready || busy} onClick={() => { setWatchEditor(null); setEditor(campaign); }}>活动设置</button>
      <button type="button" disabled={!ready || busy || state.campaigns.length >= MAX_CAMPAIGNS} onClick={() => {
        setWatchEditor(null);
        setEditor({ ...campaign, id: makeId(), name: "", start: "", end: "", snapshots: {}, watches: [] });
      }}>复制为新活动</button>
    </div>
    <nav className="promo-jump" aria-label="大促页面导航"><a href="#promo-leads-heading" onClick={event => { event.preventDefault(); document.getElementById("promo-leads-heading")?.scrollIntoView(); }}>逛优惠</a><a href="#promo-watch-section" onClick={event => { event.preventDefault(); document.getElementById("promo-watch-section")?.scrollIntoView(); }}>我的追踪 · {campaign.watches.length}</a></nav>
    {editor && <CampaignEditor key={editor.id} campaign={editor} onSave={saveCampaign} onClose={() => setEditor(null)} />}
    {storageError && <p role="alert" className="promo-panel">浏览器存储不可写，本页改动刷新后可能丢失。</p>}
    {notice && <p role="status" className="promo-panel">{notice}</p>}
    {tasks.length > 0 && <section className="promo-panel promo-progress" data-result={!busy && failed ? "partial" : undefined} aria-label="刷新进度">
      <div className="promo-section-heading"><h2>刷新进度</h2><div className="promo-controls"><strong role="status">{busy ? "进行中" : failed ? "完成，有失败项" : "刷新完成"} · {done}/{tasks.length}{failed ? ` · ${failed} 项失败` : ""}</strong>{!busy && hasFailedSources && <button type="button" onClick={() => void refresh("failed-sources")}>只重试失败来源</button>}{!busy && <button type="button" aria-expanded={showProgress} onClick={() => setShowProgress(!showProgress)}>{showProgress ? "收起详情" : "查看来源详情"}</button>}</div></div>
      {(busy || showProgress) && <><progress max={tasks.length} value={done} aria-label="已完成来源和商品数" />
      <ul className="promo-progress-list">
        {tasks.map(task => <li key={task.key}><span>{task.label}</span><span data-result={task.status}>
          {task.status === "waiting" ? "等待" : task.status === "running" ? "读取中…" : task.status === "done" ? task.detail : `失败 · ${task.detail}`}
          {task.source && task.status === "failed" && <> · <External url={PROMOTION_SOURCES[task.source].url}>打开原站 ↗</External></>}
        </span></li>)}
      </ul>
      {!busy && failed > 0 && <p className="promo-muted">失败的来源和商品保留上次成功报价及日期。</p>}</>}
    </section>}

    <section className="promo-panel" aria-labelledby="promo-leads-heading">
      <div className="promo-section-heading">
        <h2 id="promo-leads-heading">分类优惠 <span>{groups.size} 条</span></h2>
        <div className="promo-controls">
          {getTranslator() && untranslated.length > 0 && <button type="button" onClick={() => void translateTitles()}>翻译剩余标题</button>}
          <External url={listingSearch(query)}>查更多商家 ↗</External>
        </div>
      </div>
      {translationStatus && <p role="status" className="promo-muted">{translationStatus}</p>}
      <div className="promo-controls promo-filters">
        <input aria-label="搜索优惠" placeholder="搜中文、型号或商家" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} />
        <select aria-label="优惠来源" value={sourceFilter} onChange={event => { setSourceFilter(event.target.value as PromotionSource | "all"); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">全部来源</option>
          {campaign.sources.map(source => <option key={source} value={source}>{PROMOTION_SOURCES[source].name}</option>)}
        </select>
        <select aria-label="优惠排序" value={sort} onChange={event => { setSort(event.target.value as Sort); setVisibleCount(PAGE_SIZE); }}>
          <option value="latest">最新发布</option><option value="discount">折扣从高到低</option><option value="price">价格从低到高</option>
        </select>
        <input type="number" min="0.01" step="0.01" inputMode="decimal" aria-label="最高价（美元）" placeholder="最高价 $" value={maxPrice}
          onChange={event => { setMaxPrice(event.target.value); setVisibleCount(PAGE_SIZE); }} />
        <label className="promo-check"><input type="checkbox" checked={pricedOnly} onChange={event => { setPricedOnly(event.target.checked); setVisibleCount(PAGE_SIZE); }} />只看有报价</label>
        <label className="promo-check"><input type="checkbox" checked={comparedOnly} onChange={event => { setComparedOnly(event.target.checked); setVisibleCount(PAGE_SIZE); }} />只看有折扣依据</label>
        {filtersActive && <button type="button" onClick={resetFilters}>清除筛选</button>}
      </div>
      <div className="promo-controls promo-categories" aria-label="优惠分类">
        {(["all", ...Object.keys(PROMOTION_CATEGORIES)] as (PromotionCategory | "all")[]).map(key => (
          <button key={key} type="button" aria-pressed={category === key} onClick={() => { setCategory(key); setVisibleCount(PAGE_SIZE); }}>
            {key === "all" ? "全部" : PROMOTION_CATEGORIES[key][0]} <small>{key === "all" ? availableLeads.length : categoryCounts.get(key) ?? 0}</small>
          </button>
        ))}
      </div>
      <div className="promo-lead-guide">
        <p className="promo-muted">报价为美元。来源原价用于算折扣。本机记录最低从两天的手动刷新数据开始显示。</p>
        <details className="promo-original"><summary>来源与更新时间</summary>
          <ul>{campaign.sources.map(source => <li key={source}>
            <External url={PROMOTION_SOURCES[source].url}>{PROMOTION_SOURCES[source].name} ↗</External>
            <span> · {campaign.snapshots[source] ? displayTime(campaign.snapshots[source]!.checkedAt) : "暂无成功记录"}</span>
          </li>)}</ul>
        </details>
      </div>
      {!groups.size && <p className="promo-muted">{latest ? "没有符合筛选条件的优惠。" : "点「手动刷新」获取当前优惠。"}</p>}
      <div className="promo-leads">{order.slice(0, visibleCount).map(group => {
        const lead = group[0];
        const title = displayTitle(lead);
        const key = merchantProduct(lead.url)?.key ?? lead.url;
        const saved = savedKeys.has(key);
        const dateRange = dates(lead);
        const upcoming = lead.validFrom && lead.validFrom > today;
        const expired = lead.validUntil && lead.validUntil < today;
        return <article key={lead.url} className="promo-lead">
          <div className="promo-lead-meta"><span className="promo-chip">{PROMOTION_CATEGORIES[leadCategory(lead)][0]}</span><span className="promo-muted">
            {upcoming ? "即将开始" : expired ? "已结束" : lead.publishedAt ? displayTime(lead.publishedAt) : ""}
          </span></div>
          <div className="promo-lead-product">
            <DealThumbnail lead={group.find(item => promotionImageUrl(item.source, item.imageUrl)) ?? lead} />
            <h3><External url={lead.url}>{title}</External></h3>
          </div>
          <PriceLabels lead={lead} />
          <HistoryLabels url={lead.url} low={showObservedLow(state.history,
            observeLead(lead, campaign.snapshots[lead.source]?.checkedAt ?? 0)?.key)} />
          {dateRange && <p className="promo-muted promo-valid">活动期 {dateRange}</p>}
          {lead.detail && <p className="promo-muted">{lead.detail}</p>}
          {title !== lead.title && <details className="promo-original"><summary>查看原文标题</summary><p lang={/\p{Script=Han}/u.test(lead.title) ? "zh-CN" : "en"}>{lead.title}</p></details>}
          <div className="promo-controls promo-card-actions">
            <External url={lead.url}>查看{merchantProduct(lead.url) ? "商品" : "优惠"} ↗</External>
            {group.map(item => <External key={item.url} url={item.url}>{PROMOTION_SOURCES[item.source].name}</External>)}
            <button type="button" disabled={busy || !!editor || saved} onClick={() => addLead(lead)}>{saved ? "已追踪" : "加入追踪"}</button>
          </div>
        </article>;
      })}</div>
      {visibleCount < order.length && <button className="promo-more" type="button" onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}>显示更多（余 {order.length - visibleCount} 条）</button>}
    </section>
    <section className="promo-panel" id="promo-watch-section" aria-labelledby="promo-watch-heading">
      <div className="promo-section-heading"><div><h2 id="promo-watch-heading">我的追踪 <span>{campaign.watches.length}</span></h2><p className="promo-muted">已到价 {hits} · 已勾选核价 {selectedWatches.length}/{MAX_ACTIVE_WATCHES} · 清单存于此浏览器</p></div>
        <div className="promo-controls">
          {!owner.token() && <button type="button" disabled={busy} onClick={connectOwner}>连接私有后台</button>}
          <button type="button" disabled={busy || !!editor} onClick={() => fileInput.current?.click()}>导入 Excel</button>
          <input hidden ref={fileInput} type="file" accept=".xlsx" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importFile(file); }} />
          <button className="promo-primary" type="button" disabled={busy || !!editor} onClick={() => setWatchEditor("new")}>添加追踪</button>
        </div>
      </div>

      {campaign.watches.length > 0 && <div className="promo-controls promo-watch-filter">
        <input aria-label="搜索追踪清单" placeholder="搜索清单" value={watchQuery} onChange={event => setWatchQuery(event.target.value)} />
        <label className="promo-check"><input type="checkbox" checked={onlySelected} onChange={event => setOnlySelected(event.target.checked)} />仅已勾选</label>
      </div>}
      {!campaign.watches.length && !watchEditor && <p className="promo-muted">粘贴商品链接核价，或输入用逗号分隔的关键词来匹配优惠。</p>}
      {campaign.watches.length > 0 && !watchResults.length && <p className="promo-muted">没有匹配的追踪商品。</p>}
      <div className="promo-watch-list">{watchResults.map(watch => {
        const product = merchantProduct(watch.url);
        const status = classifyWatch(watch);
        const words = terms(watch.title);
        const matches = product ? allLeads.filter(lead => merchantProduct(lead.url)?.key === product.key) :
          watch.url ? allLeads.filter(lead => lead.url === watch.url) : words.length ? allLeads.filter(lead => words.every(word => lead.title.toLowerCase().includes(word))) : [];
        return <article className="promo-watch" key={watch.id}>
          <div>
            <div className="promo-watch-name">{watch.url && safeHttps(watch.url) ? <External url={watch.url}>{watch.title}</External> : <strong>{watch.title}</strong>}</div>
            {watch.quote && <p className="promo-muted">{watch.quote.name} · {watch.quote.method === "manual" ? "手动记录" : "商家报价"} · {displayTime(watch.quote.checkedAt)}</p>}
            {watch.reference != null && <p className="promo-muted">导入参考价 {currency.format(watch.reference)} {watch.referenceDate ?? ""}</p>}
            {watch.error && <p className="promo-warning">{watch.error}</p>}
            <HistoryLabels url={watch.url} low={showObservedLow(state.history, quoteHistoryKey(watch.url))} />
            {matches.length > 0 && <details><summary>匹配优惠 {matches.length}</summary><ul>{matches.slice(0, 8).map(lead => <li key={lead.url}><External url={lead.url}>{lead.title}</External></li>)}</ul></details>}
          </div>
          <div className="promo-price"><strong>{watch.quote ? currency.format(watch.quote.price) : "—"}</strong><span>目标 {watch.target ? currency.format(watch.target) : "未设"}</span></div>
          <span className="promo-chip" data-hit={status === "已到价"}>{product || watch.quote ? status : "线索匹配"}</span>
          <div className="promo-controls promo-watch-actions">
            {product && <label className="promo-check"><input type="checkbox" aria-label={`随刷新核价 ${watch.title}`} checked={watch.enabled} disabled={busy || (!watch.enabled && selectedWatches.length >= MAX_ACTIVE_WATCHES)} onChange={event => {
              const enabled = event.target.checked;
              editWatch(campaign.id, watch.id, w => ({ ...w, enabled }));
            }} />随刷新核价</label>}
            {product && <button type="button" disabled={busy || !!editor || !!watchEditor} onClick={() => void refresh("watch", watch)}>核价</button>}
            <External url={listingSearch(watch.originalTitle ?? watch.title)}>比价</External>
            <button type="button" disabled={busy || !!editor} onClick={() => setWatchEditor(watch)}>编辑</button>
            <button type="button" disabled={busy || !!editor} onClick={() => {
              editCampaign(campaign.id, c => ({ ...c, watches: c.watches.filter(w => w.id !== watch.id) }));
              if (watchEditor && watchEditor !== "new" && watchEditor.id === watch.id) setWatchEditor(null);
            }}>移除</button>
          </div>
        </article>;
      })}</div>
    </section>

    <dialog className="promo-watch-dialog" ref={watchDialog} onCancel={() => { setWatchEditor(null); setWatchError(""); }} aria-labelledby="promo-watch-dialog-title">
      {watchEditor && <>
        <h2 id="promo-watch-dialog-title">{watchEditor === "new" ? "添加追踪" : "编辑追踪"}</h2>
        {watchError && <p role="alert" className="promo-warning">{watchError}</p>}
        <WatchEditor key={watchEditor === "new" ? "new" : watchEditor.id} watch={watchEditor === "new" ? null : watchEditor} onSave={saveWatch} onClose={() => { setWatchEditor(null); setWatchError(""); }} />
      </>}
    </dialog>
  </main>;
}
