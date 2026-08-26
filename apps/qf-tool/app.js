const fallback = {
  updatedAt: "2026-08-25T15:00:00-07:00",
  marketMode: "顶部震荡 · 等待更好赔率",
  quotes: [
    { symbol: "NVDA", price: 181.24, change: 1.7, target: 225 },
    { symbol: "AMD", price: 169.7, change: -0.8, target: 215 },
    { symbol: "AVGO", price: 356.42, change: .9, target: 410 },
    { symbol: "SMH", price: 372.18, change: .4, target: 430 },
    { symbol: "QQQ", price: 618.33, change: .2, target: 690 }
  ],
  deals: [
    { title: "Sony WH-1000XM5 无线降噪耳机", price: "$248", originalPrice: "$399", discount: 38, source: "示例 Deal", url: "https://www.amazon.com/", note: "低于常见促销价；适合已有设备替换，不建议重复购入。" },
    { title: "Anker 100W 桌面充电器", price: "$39.99", originalPrice: "$69.99", discount: 43, source: "示例 Deal", url: "https://www.amazon.com/", note: "桌面走线和多设备充电场景匹配度高。" },
    { title: "M5Stack Cardputer Kit", price: "$27.90", originalPrice: "$34.90", discount: 20, source: "示例新品", url: "https://shop.m5stack.com/", note: "偏极客玩具；可用于便携终端和自动化控制。" }
  ],
  opportunities: [
    { title: "本地优先的信用卡权益提醒器", source: "社区重复需求", score: 87, signal: "用户不愿授权邮箱或银行账户，但会手动维护卡片。", angle: "浏览器本地规则库＋年费/权益到期提醒。", url: "https://news.ycombinator.com/" },
    { title: "小型投资组合决策日志", source: "投资工具缺口", score: 81, signal: "组合工具很多，但很少追踪当时的买入理由与失效条件。", angle: "将目标价、安全边际与事后复盘绑定。", url: "https://github.com/topics/personal-finance" },
    { title: "低维护中文 Deal 精选流", source: "内容聚合机会", score: 78, signal: "英文 Deal 信息密集，中文用户需要过滤与解释。", angle: "自动聚合＋历史价过滤＋Affiliate Link。", url: "https://slickdeals.net/" }
  ],
  macro: { fedFunds: 4.33, treasury10y: 4.18, inflation: 2.7 }
};

let dashboard = fallback;
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (id, d = 0) => Number($(id)?.value) || d;
const escapeHtml = (text = "") => String(text).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-btn,.tab").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  $(button.dataset.tab).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}));

const theme = localStorage.getItem("qf-theme") || "dark";
document.documentElement.classList.toggle("dark", theme === "dark");
$("theme").textContent = theme === "dark" ? "☀" : "☾";
$("theme").addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("qf-theme", isDark ? "dark" : "light");
  $("theme").textContent = isDark ? "☀" : "☾";
});

function renderData(data) {
  dashboard = data;
  $("marketMode").textContent = data.marketMode || fallback.marketMode;
  $("quoteCount").textContent = data.quotes.length;
  $("dealCount").textContent = data.deals.length;
  $("oppCount").textContent = data.opportunities.length;
  const updated = new Date(data.updatedAt);
  $("updated").textContent = Number.isNaN(updated.getTime()) ? "等待更新" : updated.toLocaleString("zh-CN", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const rows = data.quotes.map((q) => {
    const margin = ((q.target / q.price) - 1) * 100;
    return `<div class="row"><b>${escapeHtml(q.symbol)}</b><span>${money(q.price)}</span><span class="${q.change >= 0 ? "positive" : "negative"}">${q.change >= 0 ? "+" : ""}${q.change.toFixed(1)}%</span><span class="pill">空间 ${margin.toFixed(0)}%</span></div>`;
  }).join("");
  $("quoteList").innerHTML = rows;
  $("watchList").innerHTML = data.quotes.map((q) => `<div class="row"><b>${escapeHtml(q.symbol)}</b><span>当前 ${money(q.price)}</span><span>目标 ${money(q.target)}</span><span class="pill">安全空间 ${(((q.target / q.price) - 1) * 100).toFixed(1)}%</span></div>`).join("");
  $("macro").innerHTML = `<div><span>Fed Funds</span><b>${data.macro.fedFunds.toFixed(2)}%</b></div><div><span>10Y Treasury</span><b>${data.macro.treasury10y.toFixed(2)}%</b></div><div><span>Inflation</span><b>${data.macro.inflation.toFixed(1)}%</b></div><p>每天 08:00 PT 自动刷新公开数据</p>`;
  $("dealGrid").innerHTML = data.deals.map((d) => `<article class="deal"><span class="discount">-${Number(d.discount) || 0}%</span><small>${escapeHtml(d.source)}</small><h3>${escapeHtml(d.title)}</h3><div class="price"><b>${escapeHtml(d.price)}</b><del>${escapeHtml(d.originalPrice)}</del></div><p>${escapeHtml(d.note)}</p><a href="${escapeHtml(d.url)}" target="_blank" rel="noreferrer">查看商品 ↗</a></article>`).join("");
  $("opportunities").innerHTML = data.opportunities.map((o, i) => `<article class="opportunity"><span class="rank">0${i + 1}</span><div><small>${escapeHtml(o.source)}</small><h3>${escapeHtml(o.title)}</h3><p><b>需求信号：</b>${escapeHtml(o.signal)}</p><p><b>切入方式：</b>${escapeHtml(o.angle)}</p><a href="${escapeHtml(o.url)}" target="_blank" rel="noreferrer">查看来源 ↗</a></div><span class="score">${Number(o.score) || 0}</span></article>`).join("");
}

async function refresh() {
  $("refresh").disabled = true;
  try {
    const response = await fetch(`./data/dashboard.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    renderData(await response.json());
  } catch { renderData(fallback); }
  finally { $("refresh").disabled = false; }
}
$("refresh").addEventListener("click", refresh);

function calculate() {
  const current = Math.max(num("currentPrice", 1), .01);
  const target = num("targetPrice");
  const months = Math.max(num("months", 12), 1);
  const upside = (target / current - 1) * 100;
  const annualized = (Math.pow(target / current, 12 / months) - 1) * 100;
  $("upside").textContent = `${upside.toFixed(1)}%`;
  $("annualized").textContent = `${annualized.toFixed(1)}%`;
  $("profit").textContent = money(num("capital") * (target / current - 1));
  $("verdict").textContent = annualized >= 30 ? "达到买点标准" : annualized >= 18 ? "观察 / 分批" : annualized >= 8 ? "赔率一般" : "安全边际不足";
  const payment = num("dcaMonthly");
  const count = Math.max(num("dcaMonths"), 1);
  const rate = num("expectedReturn") / 100 / 12;
  const value = rate ? payment * ((Math.pow(1 + rate, count) - 1) / rate) : payment * count;
  $("dcaInvested").textContent = money(payment * count);
  $("dcaValue").textContent = money(value);
  $("dcaBar").style.width = `${Math.min(count / 12 * 100, 100)}%`;
  $("dcaLabel").textContent = `${count} 个月计划`;
}
["currentPrice", "targetPrice", "months", "capital", "dcaMonthly", "dcaMonths", "expectedReturn"].forEach((id) => $(id).addEventListener("input", calculate));

function getLocal(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
function setLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function renderWishes() {
  const wishes = getLocal("qf-wishlist");
  $("wishList").innerHTML = wishes.length ? wishes.map((w) => `<div class="local-item"><span>${escapeHtml(w.name)}</span><b>目标 ${escapeHtml(w.targetPrice)}</b><button data-wish="${w.id}" aria-label="删除">×</button></div>`).join("") : `<p class="empty">还没有愿望单。先加入一个你愿意等待好价的商品。</p>`;
  document.querySelectorAll("[data-wish]").forEach((button) => button.addEventListener("click", () => { setLocal("qf-wishlist", wishes.filter((w) => String(w.id) !== button.dataset.wish)); renderWishes(); }));
}
$("addWish").addEventListener("click", () => {
  const name = $("wishName").value.trim(); if (!name) return;
  const wishes = getLocal("qf-wishlist"); wishes.push({ id: Date.now(), name, targetPrice: $("wishTarget").value.trim() || "未设定" });
  setLocal("qf-wishlist", wishes); $("wishName").value = ""; $("wishTarget").value = ""; renderWishes();
});

function renderJournal() {
  const entries = getLocal("qf-journal");
  $("journalList").innerHTML = entries.length ? entries.map((e) => `<article class="journal-card"><header><span>${escapeHtml(e.action)}</span><b>${escapeHtml(e.asset)}</b><small>${escapeHtml(e.createdAt)}</small><button data-entry="${e.id}" aria-label="删除">×</button></header><p>${escapeHtml(e.thesis)}</p><footer><span>目标 ${escapeHtml(e.target || "未设定")}</span><span>失效条件 ${escapeHtml(e.stop || "未设定")}</span></footer></article>`).join("") : `<div class="panel empty"><b>还没有决策记录</b><p>下一次准备交易时，先写下理由再下单。</p></div>`;
  document.querySelectorAll("[data-entry]").forEach((button) => button.addEventListener("click", () => { setLocal("qf-journal", entries.filter((e) => String(e.id) !== button.dataset.entry)); renderJournal(); }));
}
$("saveJournal").addEventListener("click", () => {
  const asset = $("asset").value.trim(); const thesis = $("thesis").value.trim(); if (!asset || !thesis) return;
  const entries = getLocal("qf-journal"); entries.unshift({ id: Date.now(), asset: asset.toUpperCase(), action: $("action").value.trim() || "观察", thesis, target: $("jTarget").value.trim(), stop: $("jStop").value.trim(), createdAt: new Date().toLocaleDateString("zh-CN") });
  setLocal("qf-journal", entries); $("asset").value = ""; $("thesis").value = ""; $("jTarget").value = ""; $("jStop").value = ""; renderJournal();
});

calculate(); renderWishes(); renderJournal(); refresh();
