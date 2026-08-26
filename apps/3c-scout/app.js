const state = {
  data: { items: [], sources: [], generated_at: null },
  stream: "new",
  category: "全部",
  language: "all",
  query: "",
  sort: "score",
};

const ui = {
  grid: document.querySelector("#productGrid"),
  template: document.querySelector("#productTemplate"),
  tabs: [...document.querySelectorAll(".stream-tab")],
  categories: document.querySelector("#categoryStrip"),
  search: document.querySelector("#searchInput"),
  sort: document.querySelector("#sortSelect"),
  language: document.querySelector("#languageToggle"),
  empty: document.querySelector("#emptyState"),
  count: document.querySelector("#resultsCount"),
  total: document.querySelector("#totalCount"),
  sourceCount: document.querySelector("#sourceCount"),
  dealPeak: document.querySelector("#dealPeak"),
  freshness: document.querySelector("#freshness"),
  streamNote: document.querySelector("#streamNote"),
  sourceList: document.querySelector("#sourceList"),
  theme: document.querySelector("#themeToggle"),
};

const categoryOrder = ["全部", "3C 数码", "音频", "桌面", "游戏", "厨房", "生活", "Maker", "其他"];

function formatRelativeDate(value) {
  if (!value) return "日期未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期未知";
  const hours = Math.max(0, (Date.now() - date.getTime()) / 36e5);
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${Math.floor(hours)} 小时前`;
  if (hours < 48) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function normalizeText(value) {
  return String(value || "").toLocaleLowerCase();
}

function matches(item) {
  if (item.stream !== state.stream) return false;
  if (state.category !== "全部" && item.category !== state.category) return false;
  if (state.language !== "all" && item.language !== state.language) return false;
  if (state.query) {
    const haystack = normalizeText([item.title, item.summary, item.source, item.category, ...(item.tags || [])].join(" "));
    if (!haystack.includes(normalizeText(state.query))) return false;
  }
  return true;
}

function sortedItems() {
  const items = state.data.items.filter(matches);
  const dateValue = (item) => new Date(item.published_at || 0).getTime() || 0;
  const priceValue = (item) => Number(item.price_value) || Number.POSITIVE_INFINITY;
  return items.sort((a, b) => {
    if (state.sort === "newest") return dateValue(b) - dateValue(a);
    if (state.sort === "discount") return (b.discount_percent || 0) - (a.discount_percent || 0) || dateValue(b) - dateValue(a);
    if (state.sort === "price-low") return priceValue(a) - priceValue(b) || dateValue(b) - dateValue(a);
    const languagePriority = (item) => item.language === "zh" ? 1 : 0;
    return languagePriority(b) - languagePriority(a) || (b.relevance_score || 0) - (a.relevance_score || 0) || dateValue(b) - dateValue(a);
  });
}

function setText(root, selector, value) {
  root.querySelector(selector).textContent = value || "";
}

function addDetailRow(dl, label, value) {
  if (!value) return;
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  dl.append(dt, dd);
}

function renderCard(item) {
  const card = ui.template.content.firstElementChild.cloneNode(true);
  const image = card.querySelector(".product-image");
  const primary = card.querySelector(".primary-link");
  const source = card.querySelector(".source-link");

  setText(card, ".category-badge", item.category || "其他");
  setText(card, ".source-name", `${item.language === "zh" ? "中文" : "EN"} · ${item.source}`);
  setText(card, "time", formatRelativeDate(item.published_at));
  setText(card, ".product-title", item.title);
  setText(card, ".summary", item.summary || "打开来源查看完整商品信息。");
  setText(card, ".current-price", item.price || "");
  setText(card, ".original-price", item.original_price || "");
  setText(card, ".discount-badge", item.discount_percent ? `-${item.discount_percent}%` : "");

  if (item.image_url) {
    image.src = item.image_url;
    image.alt = item.title;
    image.addEventListener("error", () => { image.hidden = true; });
  } else {
    image.hidden = true;
  }

  const dl = document.createElement("dl");
  addDetailRow(dl, "推荐理由", item.reason);
  addDetailRow(dl, "分类", item.category);
  addDetailRow(dl, "标签", (item.tags || []).join(" · "));
  addDetailRow(dl, "发布时间", item.published_at ? new Date(item.published_at).toLocaleString("zh-CN") : "未知");
  addDetailRow(dl, "价格提示", item.price_note || "价格和库存可能随时变化，请以商品页为准");
  card.querySelector(".detail-content").append(dl);

  primary.href = item.product_url || item.source_url;
  const hasPurchaseLink = item.link_type === "purchase" || (item.product_url && item.product_url !== item.source_url);
  primary.firstChild.textContent = hasPurchaseLink ? "直接购买 " : "查看原文 ";
  source.href = item.source_url;
  if (!hasPurchaseLink) source.hidden = true;

  return card;
}

function renderCategories() {
  const scope = state.data.items.filter((item) => item.stream === state.stream);
  const counts = scope.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  counts["全部"] = scope.length;
  const available = categoryOrder.filter((category) => category === "全部" || counts[category]);
  if (!available.includes(state.category)) state.category = "全部";
  ui.categories.replaceChildren(...available.map((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip${state.category === category ? " active" : ""}`;
    button.textContent = category;
    const count = document.createElement("span");
    count.textContent = counts[category] || 0;
    button.append(count);
    button.addEventListener("click", () => { state.category = category; render(); });
    return button;
  }));
}

function renderSources() {
  const elements = (state.data.sources || []).map((source) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const status = document.createElement("span");
    row.className = "source-item";
    name.textContent = source.name;
    status.className = `source-state${source.ok ? "" : " failed"}`;
    status.textContent = source.ok ? `${source.item_count || 0} 条` : "本次跳过";
    row.append(name, status);
    return row;
  });
  ui.sourceList.replaceChildren(...elements);
}

function updateMetrics() {
  const successfulSources = (state.data.sources || []).filter((source) => source.ok);
  const peak = Math.max(0, ...state.data.items.map((item) => item.discount_percent || 0));
  ui.total.textContent = state.data.items.length;
  ui.sourceCount.textContent = successfulSources.length;
  ui.dealPeak.textContent = peak ? `${peak}%` : "—";
  if (state.data.generated_at) {
    const ageHours = (Date.now() - new Date(state.data.generated_at).getTime()) / 36e5;
    ui.freshness.innerHTML = `<i></i>${ageHours > 30 ? "数据等待更新" : "数据已更新"} · ${formatRelativeDate(state.data.generated_at)}`;
    ui.freshness.classList.toggle("is-stale", ageHours > 30);
  }
}

function render() {
  renderCategories();
  const items = sortedItems();
  ui.grid.replaceChildren(...items.map(renderCard));
  ui.count.textContent = items.length;
  ui.grid.hidden = items.length === 0;
  ui.empty.hidden = items.length > 0;
  ui.tabs.forEach((tab) => {
    const active = tab.dataset.stream === state.stream;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const notes = {
    new: "中文内容优先；更偏向刚发布、刚上市和设计新鲜的商品",
    deals: "中文内容与直接购买链接优先，再综合兴趣、折扣和发布时间排序",
    discover: "中文内容优先；从众筹、独立硬件与设计实验中寻找潜力产品",
  };
  ui.streamNote.textContent = notes[state.stream];
}

function bindEvents() {
  ui.tabs.forEach((tab) => tab.addEventListener("click", () => {
    state.stream = tab.dataset.stream;
    state.category = "全部";
    render();
  }));
  ui.search.addEventListener("input", (event) => { state.query = event.target.value.trim(); render(); });
  ui.sort.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  ui.language.addEventListener("click", () => {
    const next = { all: "zh", zh: "en", en: "all" }[state.language];
    state.language = next;
    ui.language.textContent = { all: "中 / EN", zh: "仅中文", en: "EN only" }[next];
    ui.language.classList.toggle("active", next !== "all");
    render();
  });
  document.querySelector("#resetFilters").addEventListener("click", () => {
    state.category = "全部"; state.query = ""; state.language = "all";
    ui.search.value = ""; ui.language.textContent = "中 / EN"; ui.language.classList.remove("active");
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== ui.search) { event.preventDefault(); ui.search.focus(); }
  });
  ui.theme.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("3c-scout-theme", dark ? "dark" : "light");
  });
}

async function init() {
  const savedTheme = localStorage.getItem("3c-scout-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  bindEvents();
  try {
    const response = await fetch(`data/products.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    if (!Array.isArray(state.data.items)) throw new Error("Invalid data format");
  } catch (error) {
    console.error("Could not load product feed", error);
    ui.freshness.innerHTML = "<i></i>商品数据暂时不可用";
    ui.freshness.classList.add("is-stale");
  }
  updateMetrics();
  renderSources();
  render();
}

init();
