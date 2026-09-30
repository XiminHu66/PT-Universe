(() => {
  // apps/_decision/core.js
  var root = new URL("../../", document.currentScript.src);
  var $ = (s, el = document) => el.querySelector(s);
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var stamp = (s) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("zh-CN", { timeZone: "America/Los_Angeles", hour12: false }) + " PT" : "\u672A\u63D0\u4F9B";
  var read = (key, f = []) => {
    try {
      return JSON.parse(localStorage.getItem("ptu.decision." + key)) ?? f;
    } catch {
      return f;
    }
  };
  var raw = (key, f = []) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? f;
    } catch {
      return f;
    }
  };
  function toast(t) {
    let e = $("#decision-toast");
    if (!e) {
      e = document.createElement("div");
      e.id = "decision-toast";
      e.setAttribute("role", "status");
      document.body.append(e);
    }
    e.textContent = t;
    clearTimeout(e.timer);
    e.timer = setTimeout(() => e.remove(), 4200);
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("\u5DF2\u590D\u5236");
    } catch {
      download("context.txt", text, "text/plain");
      toast("\u526A\u8D34\u677F\u4E0D\u53EF\u7528\uFF0C\u5DF2\u4E0B\u8F7D\u6587\u672C");
    }
  }
  function download(name, value, type = "application/json") {
    const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function setupPage() {
    let theme;
    try {
      theme = JSON.parse(localStorage.getItem("ptu.theme"));
    } catch {
    }
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    $("#decision-theme")?.addEventListener("click", () => {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t;
      localStorage.setItem("ptu.theme", JSON.stringify(t));
    });
    addEventListener("pt-sync-applied", () => toast("\u5DF2\u63A5\u6536\u4E91\u7AEF\u8BB0\u5F55\uFF0C\u5237\u65B0\u9875\u9762\u67E5\u770B\u66F4\u65B0"));
  }

  // apps/_decision/workspace.js
  setupPage();
  var investment = document.body.dataset.workspace === "investment";
  var params = new URLSearchParams(location.search);
  var routes = investment ? { market: "stock-alert", thesis: "thesis-lab" } : { weekend: "eastside-weekend", ...document.querySelector("#panel-dinner") ? {} : { dinner: "meal-orbit" }, restaurants: "meal-orbit", recipes: "meal-orbit", favorites: "meal-orbit", wheel: "meal-orbit" };
  var buttons = [...document.querySelectorAll("[data-tab]")];
  var frames = /* @__PURE__ */ new Map();
  var tab = "";
  var symbol = params.get("symbol") || raw("ptu.workspace.symbol", "NVDA");
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol)) symbol = "NVDA";
  function send(frame, type, data = {}) {
    frame.contentWindow?.postMessage({ channel: "pt-workspace", type, ...data }, location.origin);
  }
  function setSymbol(value) {
    value = String(value).trim().toUpperCase();
    if (!/^[A-Z0-9.^-]{1,20}$/.test(value)) return;
    const changed = value !== symbol;
    symbol = value;
    localStorage.setItem("ptu.workspace.symbol", JSON.stringify(symbol));
    if (investment) document.querySelector("#ws-symbol").value = symbol;
    if (changed) for (const x of frames.values()) send(x.frame, "symbol", { symbol });
    address();
    summary();
  }
  function address() {
    const u = new URL(location.href);
    u.searchParams.set("tab", tab);
    if (investment) u.searchParams.set("symbol", symbol);
    history.replaceState(null, "", u);
  }
  function activate(next) {
    if (!buttons.some((b) => b.dataset.tab === next)) next = investment ? "review" : "weekend";
    tab = next;
    buttons.forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".ws-panel").forEach((p) => p.hidden = true);
    if (routes[tab]) {
      const slug = routes[tab];
      let x = frames.get(slug);
      if (!x) {
        const panel = document.createElement("section");
        panel.className = "ws-panel";
        panel.setAttribute("role", "tabpanel");
        const status = document.createElement("div");
        status.className = "ws-frame-status";
        status.textContent = "\u6B63\u5728\u8BFB\u53D6\u2026";
        const frame = document.createElement("iframe");
        frame.title = slug;
        frame.loading = "eager";
        frame.src = "../" + slug + "/?embedded=workspace" + (investment ? "&symbol=" + encodeURIComponent(symbol) : "");
        panel.append(status, frame);
        document.querySelector("#ws-frames").append(panel);
        x = { panel, frame, status };
        frames.set(slug, x);
        frame.addEventListener("load", () => {
          status.hidden = true;
          send(frame, "activate", { tab });
          if (investment) send(frame, "symbol", { symbol });
        });
      }
      x.panel.id = "panel-" + tab;
      x.panel.setAttribute("aria-labelledby", "tab-" + tab);
      x.panel.hidden = false;
      send(x.frame, "activate", { tab });
      if (investment) send(x.frame, "symbol", { symbol });
    } else document.querySelector("#panel-" + tab).hidden = false;
    if (tab === "plans") renderPlans();
    address();
    summary();
  }
  function summary() {
    document.querySelector("#ws-summary").textContent = investment ? "\u5F53\u524D\u6807\u7684 " + symbol + " \xB7 \u884C\u60C5\u4E0E\u8D22\u62A5\u5171\u7528\u9009\u62E9" : "\u5DF2\u9009 " + read("weekend-plans").length + " \u4E2A\u51FA\u884C\u5B89\u6392 \xB7 " + read("meal-plans").length + " \u4EFD\u83DC\u5355 \xB7 " + raw("savedPlaces").length + " \u5BB6\u6536\u85CF\u9910\u5385";
  }
  function renderPlans() {
    const el = document.querySelector("#ws-plans");
    if (!el) return;
    const plans = [...read("weekend-plans").map((p) => ({ ...p, kind: "\u51FA\u884C" })), ...read("meal-plans").map((p) => ({ ...p, kind: "\u83DC\u5355" }))].sort((a, b) => String(b.at).localeCompare(a.at));
    el.innerHTML = plans.map((p, i) => '<article class="d-panel"><small>' + p.kind + " \xB7 " + stamp(p.at) + "</small><h2>" + esc(p.title) + "</h2><p>" + esc(p.summary) + "</p><pre>" + esc(p.text) + '</pre><button data-copy="' + i + '">\u590D\u5236\u5B89\u6392</button></article>').join("") || '<div class="ws-empty">\u5728\u534A\u65E5\u5B89\u6392\u6216\u4ECA\u665A\u83DC\u5355\u4E2D\u9009\u4E00\u4E2A\u65B9\u6848\uFF0C\u4F1A\u96C6\u4E2D\u51FA\u73B0\u5728\u8FD9\u91CC\u3002</div>';
    el.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => copy(plans[Number(b.dataset.copy)].text));
  }
  buttons.forEach((b, i) => {
    b.onclick = () => activate(b.dataset.tab);
    b.onkeydown = (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const j = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        activate(buttons[j].dataset.tab);
        buttons[j].focus();
      }
    };
  });
  if (investment) {
    document.querySelector("#ws-symbol").value = symbol;
    document.querySelector("#ws-symbols").innerHTML = [.../* @__PURE__ */ new Set(["NVDA", "AAPL", "MSFT", "QQQ", "SPY", ...read("holdings").map((h) => h.symbol)])].map((s) => '<option value="' + esc(s) + '">').join("");
    document.querySelector("#ws-symbol-form").onsubmit = (e) => {
      e.preventDefault();
      setSymbol(document.querySelector("#ws-symbol").value);
      if (tab === "review") activate("market");
    };
  }
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.channel !== "pt-workspace") return;
    const x = [...frames.values()].find((x2) => x2.frame.contentWindow === e.source);
    if (!x) return;
    const d = e.data;
    if (d.type === "height" && Number.isFinite(d.height)) x.frame.style.height = Math.min(3e4, Math.max(500, d.height)) + "px";
    if (d.type === "ready") {
      send(x.frame, "activate", { tab });
      if (investment) send(x.frame, "symbol", { symbol });
    }
    if (d.type === "symbol" && investment && x.panel.hidden === false) setSymbol(d.symbol);
    if (d.type === "navigate" && buttons.some((b) => b.dataset.tab === d.tab)) {
      if (d.symbol) setSymbol(d.symbol);
      activate(d.tab);
    }
    if (d.type === "records") {
      dispatchEvent(new Event("decision-thesis-updated"));
      summary();
    }
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const u = new URL(a.href);
    if (u.origin !== location.origin) return;
    const slug = u.pathname.match(/\/apps\/([^/]+)/)?.[1], next = !investment && slug === "meal-orbit" ? "dinner" : Object.keys(routes).find((k) => routes[k] === slug);
    if (next) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (u.searchParams.get("symbol")) setSymbol(u.searchParams.get("symbol"));
      activate(next);
    }
  }, true);
  addEventListener("storage", (e) => {
    summary();
    if (tab === "plans") renderPlans();
    for (const x of frames.values()) send(x.frame, "records", { key: e.key });
  });
  addEventListener("decision-change", summary);
  addEventListener("pt-sync-applied", () => {
    summary();
    renderPlans();
    for (const x of frames.values()) send(x.frame, "records", { key: "sync" });
  });
  activate(params.get("tab") || (investment ? "review" : "weekend"));
  addEventListener("investment-select", (e) => {
    if (!investment) return;
    setSymbol(e.detail.symbol);
    activate(e.detail.tab || "review");
  });
  addEventListener("decision-change", (e) => {
    if (!investment) return;
    document.querySelector("#ws-symbols").innerHTML = [.../* @__PURE__ */ new Set([...read("holdings").map((h) => h.symbol), ...raw("stock_alert_watchlist_v1").map((h) => h.symbol)])].map((s) => '<option value="' + esc(s) + '">').join("");
    for (const x of frames.values()) send(x.frame, "records", { key: e.detail.key });
  });
  buttons.forEach((b) => b.disabled = false);
  document.body.dataset.workspaceReady = "true";
  document.querySelector("#workspace-boot")?.remove();
  dispatchEvent(new Event("workspace-ready"));
  if (parent !== window) parent.postMessage({ channel: "pt-nexus-tool", type: "ready" }, location.origin);
})();
