(() => {
  // apps/_decision/models.mjs
  var fresh = (at, hours = 36, now = Date.now()) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= now + 3e5 && now - Date.parse(at) <= hours * 36e5;
  var dateIn = (at = Date.now(), zone = "America/Los_Angeles") => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  function planEvents(events2, { date, city, freeOnly, start = 10, hours = 4, query = "" }) {
    return events2.filter((e) => e.start?.slice(0, 10) === date && (!city || e.city === city) && (!freeOnly || e.free) && !e.stale && (!query || [e.title, e.category, e.description].join(" ").toLowerCase().includes(query.toLowerCase()))).filter((e) => {
      if (e.start.length < 16) return true;
      const mins = Number(e.start.slice(11, 13)) * 60 + Number(e.start.slice(14, 16));
      return mins >= start * 60 && mins + 150 <= (start + hours) * 60;
    }).sort((a, b) => Number(b.free) - Number(a.free) || a.start.localeCompare(b.start));
  }

  // apps/_decision/core.js
  var root = new URL("../../", document.currentScript.src);
  var appURL = (path) => new URL("apps/" + path, root).href;
  var $ = (s, el = document) => el.querySelector(s);
  var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var url = (s) => {
    try {
      const u = new URL(s);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "#";
    } catch {
      return "#";
    }
  };
  var link = (s, label) => `<a href="${esc(url(s))}" target="_blank" rel="noopener noreferrer">${esc(label)} \u2197</a>`;
  var stamp = (s) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("zh-CN", { timeZone: "America/Los_Angeles", hour12: false }) + " PT" : "\u672A\u63D0\u4F9B";
  var id = () => crypto.randomUUID();
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
  function save(key, value) {
    try {
      localStorage.setItem("ptu.decision." + key, JSON.stringify(value));
      dispatchEvent(new CustomEvent("decision-change", { detail: { key } }));
      return true;
    } catch {
      toast("\u4FDD\u5B58\u5931\u8D25\uFF1A\u672C\u673A\u5B58\u50A8\u5DF2\u6EE1\u6216\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5907\u4EFD");
      return false;
    }
  }
  var field = (name, label, type = "text", value = "", extra = "") => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  var select = (name, label, choices, value = "") => `<label>${esc(label)}<select name="${name}">${choices.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  var data = (form) => Object.fromEntries(new FormData(form));
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
  async function json(path) {
    const r = await fetch(new URL(path, root), { cache: "no-store", signal: AbortSignal.timeout(18e3) });
    if (!r.ok) throw new Error("\u8BFB\u53D6\u5931\u8D25 HTTP " + r.status);
    return r.json();
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
  function ask(title, evidence, question = "\u8BF7\u57FA\u4E8E\u8BC1\u636E\u5E2E\u6211\u5224\u65AD\u4E0B\u4E00\u6B65\uFF0C\u6307\u51FA\u7F3A\u5931\u4FE1\u606F\uFF0C\u5E76\u533A\u5206\u4E8B\u5B9E\u4E0E\u63A8\u65AD\u3002") {
    const packet = { id: id(), title, evidence, question, at: (/* @__PURE__ */ new Date()).toISOString() };
    if (!save("handoff", packet)) return;
    const dest = appURL("ask-gpt/?handoff=" + packet.id);
    if (new URLSearchParams(location.search).get("embedded") === "nexus") window.open(dest, "_blank", "noopener");
    else location.href = dest;
  }
  function backupBar(host2, keys, validate) {
    const bar = document.createElement("div");
    bar.className = "d-actions d-backup";
    bar.innerHTML = '<button data-export>\u5BFC\u51FA\u8BB0\u5F55</button><label class="d-button">\u5BFC\u5165\u5907\u4EFD<input type="file" accept=".json" hidden data-import></label><small>\u672C\u673A\u4FDD\u5B58 \xB7 \u53EF\u7528 PT \u52A0\u5BC6\u540C\u6B65</small>';
    host2.append(bar);
    $("[data-export]", bar).onclick = () => download("pt-" + keys[0] + "-" + dateIn() + ".json", { version: 1, scope: keys.join(","), records: Object.fromEntries(keys.map((k) => [k, read(k)])) });
    $("[data-import]", bar).onchange = async (e) => {
      try {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 2e6) throw Error("\u5907\u4EFD\u8D85\u8FC7 2 MB");
        const d = JSON.parse(await f.text());
        if (d.version !== 1 || d.scope !== keys.join(",") || !d.records) throw Error("\u8BF7\u9009\u62E9\u6B64\u6A21\u5757\u5BFC\u51FA\u7684\u5907\u4EFD");
        for (const k of keys) {
          if (JSON.stringify(d.records[k]).length > 18e5 || !safeRecordIds(d.records[k]) || !Array.isArray(d.records[k]) || d.records[k].length > 3e3 || !validate(k, d.records[k])) throw Error("\u5907\u4EFD\u5B57\u6BB5\u65E0\u6548");
        }
        if (!confirm("\u5BFC\u5165\u4F1A\u66FF\u6362\u6B64\u6A21\u5757\u7684\u672C\u673A\u8BB0\u5F55\u3002\u5DF2\u5BFC\u51FA\u5F53\u524D\u8BB0\u5F55\u540E\u518D\u7EE7\u7EED\u3002")) return;
        for (const k of keys) if (!save(k, d.records[k])) return;
        location.reload();
      } catch (err) {
        toast(err.message);
      } finally {
        e.target.value = "";
      }
    };
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
  function safeRecordIds(v) {
    if (v && typeof v === "object") {
      if ("id" in v && (typeof v.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(v.id))) return false;
      return Object.values(v).every(safeRecordIds);
    }
    return true;
  }

  // apps/_decision/life.js
  var host = document.querySelector('[data-decision="weekend"], [data-decision="meal"]');
  var mode = host?.dataset.decision;
  var cityChoices = [["", "\u5168\u90E8\u5730\u533A"], ...["Kirkland", "Bellevue", "Redmond", "Lynnwood", "Everett", "Kent", "Seattle"].map((x) => [x, x])];
  var events = { events: [] };
  var options = [];
  var batch = 0;
  var meals = [
    { name: "\u756A\u8304\u9E21\u86CB\u996D\uFF0B\u6E05\u7092\u897F\u5170\u82B1", minutes: 25, equipment: ["\u9505"], tags: "\u9E21\u86CB \u5927\u7C73 \u897F\u5170\u82B1 \u756A\u8304", ingredients: [["\u5927\u7C73", 150, "g"], ["\u9E21\u86CB", 3, "\u4E2A"], ["\u756A\u8304", 2, "\u4E2A"], ["\u897F\u5170\u82B1", 300, "g"]], steps: ["\u5927\u7C73\u716E\u996D\uFF1B\u540C\u65F6\u6E05\u6D17\u5E76\u5207\u597D\u756A\u8304\u548C\u897F\u5170\u82B1\u3002", "\u7092\u719F\u9E21\u86CB\u76DB\u51FA\uFF0C\u7092\u8F6F\u756A\u8304\u540E\u653E\u56DE\u9E21\u86CB\uFF0C\u6309\u53E3\u5473\u8C03\u5473\u3002", "\u897F\u5170\u82B1\u712F\u6C34\u540E\u6E05\u7092\uFF0C\u548C\u7C73\u996D\u4E00\u8D77\u5206\u88C5\u3002"] },
    { name: "\u8C46\u8150\u8611\u83C7\u6C64\u9762", minutes: 20, equipment: ["\u9505"], tags: "\u8C46\u8150 \u5927\u8C46 \u9762\u6761 \u5C0F\u9EA6 \u8611\u83C7 \u9752\u83DC", ingredients: [["\u9762\u6761", 180, "g"], ["\u8C46\u8150", 250, "g"], ["\u8611\u83C7", 150, "g"], ["\u9752\u83DC", 200, "g"]], steps: ["\u5207\u597D\u8C46\u8150\u3001\u8611\u83C7\u548C\u9752\u83DC\uFF0C\u70E7\u4E00\u9505\u6C34\u3002", "\u4E0B\u8611\u83C7\u3001\u8C46\u8150\u716E\u5F00\uFF0C\u518D\u52A0\u5165\u9762\u6761\u6309\u5305\u88C5\u65F6\u95F4\u716E\u719F\u3002", "\u6700\u540E\u52A0\u5165\u9752\u83DC\u716E\u719F\uFF0C\u6309\u53E3\u5473\u8C03\u5473\uFF1B\u4E24\u4EBA\u5206\u98DF\u3002"] },
    { name: "\u7A7A\u6C14\u70B8\u9505\u9E21\u817F\uFF0B\u571F\u8C46\uFF0B\u9752\u83DC", minutes: 40, equipment: ["\u7A7A\u6C14\u70B8\u9505", "\u9505"], tags: "\u9E21\u8089 \u571F\u8C46 \u9752\u83DC", ingredients: [["\u53BB\u9AA8\u9E21\u817F\u8089", 350, "g"], ["\u571F\u8C46", 400, "g"], ["\u9752\u83DC", 250, "g"]], steps: ["\u9E21\u817F\u548C\u571F\u8C46\u5206\u522B\u5207\u6210\u5408\u9002\u5927\u5C0F\uFF0C\u6309\u53E3\u5473\u8C03\u5473\u3002", "\u6309\u8BBE\u5907\u8BF4\u660E\u5206\u6279\u6216\u5206\u533A\u70F9\u996A\uFF0C\u907F\u514D\u751F\u8089\u6C41\u63A5\u89E6\u5DF2\u719F\u98DF\u7269\uFF1B\u786E\u8BA4\u9E21\u8089\u719F\u900F\u3002", "\u7528\u9505\u716E\u719F\u9752\u83DC\uFF0C\u914D\u9E21\u817F\u548C\u571F\u8C46\u4E00\u8D77\u4E0A\u684C\u3002"] },
    { name: "\u867E\u4EC1\u852C\u83DC\u7092\u996D", minutes: 20, equipment: ["\u9505"], tags: "\u867E \u7532\u58F3\u7C7B \u7C73\u996D \u80E1\u841D\u535C \u8C4C\u8C46 \u9E21\u86CB", ingredients: [["\u5DF2\u716E\u719F\u7C73\u996D", 350, "g"], ["\u867E\u4EC1", 200, "g"], ["\u9E21\u86CB", 2, "\u4E2A"], ["\u80E1\u841D\u535C\u548C\u8C4C\u8C46", 200, "g"]], steps: ["\u51C6\u5907\u7C73\u996D\u548C\u5207\u597D\u7684\u852C\u83DC\uFF0C\u7092\u719F\u9E21\u86CB\u76DB\u51FA\u3002", "\u5C06\u867E\u4EC1\u548C\u852C\u83DC\u7092\u719F\uFF0C\u518D\u52A0\u5165\u7C73\u996D\u5145\u5206\u7092\u70ED\u3002", "\u653E\u56DE\u9E21\u86CB\uFF0C\u8C03\u5473\u540E\u4E24\u4EBA\u5206\u98DF\u3002"] },
    { name: "\u9999\u83C7\u9752\u83DC\u8C46\u8150\u996D", minutes: 30, equipment: ["\u9505"], tags: "\u9999\u83C7 \u9752\u83DC \u8C46\u8150 \u5927\u8C46 \u5927\u7C73", ingredients: [["\u5927\u7C73", 150, "g"], ["\u8C46\u8150", 300, "g"], ["\u9999\u83C7", 150, "g"], ["\u9752\u83DC", 250, "g"]], steps: ["\u5148\u716E\u996D\uFF0C\u5207\u597D\u8C46\u8150\u3001\u9999\u83C7\u548C\u9752\u83DC\u3002", "\u8C46\u8150\u714E\u81F3\u8868\u9762\u4E0A\u8272\uFF0C\u52A0\u5165\u9999\u83C7\u4E0E\u5C11\u91CF\u6C34\u70E7\u719F\u3002", "\u9752\u83DC\u53E6\u884C\u7092\u719F\uFF1B\u4E0E\u8C46\u8150\u3001\u7C73\u996D\u4E00\u8D77\u5206\u88C5\u3002"] },
    { name: "\u91D1\u67AA\u9C7C\u9EC4\u74DC\u996D\u7897", minutes: 15, equipment: ["\u5FAE\u6CE2\u7089"], tags: "\u91D1\u67AA\u9C7C \u9C7C \u9EC4\u74DC \u7C73\u996D \u7389\u7C73", ingredients: [["\u53EF\u76F4\u63A5\u52A0\u70ED\u7C73\u996D", 350, "g"], ["\u5373\u98DF\u91D1\u67AA\u9C7C\u7F50\u5934", 2, "\u7F50"], ["\u9EC4\u74DC", 1, "\u6839"], ["\u5373\u98DF\u7389\u7C73\u7C92", 100, "g"]], steps: ["\u6309\u5305\u88C5\u8BF4\u660E\u5145\u5206\u52A0\u70ED\u7C73\u996D\u3002", "\u9EC4\u74DC\u6E05\u6D17\u5207\u4E01\uFF0C\u91D1\u67AA\u9C7C\u4E0E\u7389\u7C73\u6CA5\u6C34\u3002", "\u5C06\u98DF\u6750\u5206\u6210\u4E24\u7897\uFF0C\u6309\u53E3\u5473\u5C11\u91CF\u8C03\u5473\u3002"] }
  ];
  var saved = () => {
    const value = read(mode === "meal" ? "meal-plans" : "weekend-plans");
    return Array.isArray(value) ? value.filter((p) => p && typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string") : [];
  };
  function mealPreferences(value) {
    const p = value && typeof value === "object" ? value : {};
    return { minutes: ["20", "30", "45"].includes(String(p.minutes)) ? String(p.minutes) : "30", people: ["1", "2", "3", "4"].includes(String(p.people)) ? String(p.people) : "2", equipment: ["all", "pot", "microwave"].includes(p.equipment) ? p.equipment : "all", exclude: typeof p.exclude === "string" ? p.exclude : "", pantry: typeof p.pantry === "string" ? p.pantry : "" };
  }
  var mealGenerations = 0;
  function mealStatus(message) {
    const el = $("#meal-status", host);
    if (el) el.textContent = message;
  }
  var places = () => raw("savedPlaces").filter((p) => p && typeof p.name === "string");
  function render() {
    if (mode === "meal") renderMeal();
    else renderWeekend();
  }
  function history2() {
    return `<details><summary>\u5DF2\u9009\u5B89\u6392 \xB7 ${saved().length}</summary>${saved().slice().reverse().slice(0, 12).map((p) => `<div class="d-inset"><b>${esc(p.title)}</b><small> \xB7 ${stamp(p.at)}</small><p>${esc(p.summary)}</p><div class="d-actions"><button data-plan-copy="${p.id}">\u590D\u5236\u5B89\u6392</button><button data-plan-remove="${p.id}">\u79FB\u9664</button></div></div>`).join("") || '<p class="d-muted">\u5C1A\u672A\u9009\u62E9\u5B89\u6392\u3002</p>'}</details>`;
  }
  function bindHistory() {
    host.querySelectorAll("[data-plan-copy]").forEach((b) => b.onclick = () => copy(saved().find((p) => p.id === b.dataset.planCopy).text));
    host.querySelectorAll("[data-plan-remove]").forEach((b) => b.onclick = () => {
      save(mode === "meal" ? "meal-plans" : "weekend-plans", saved().filter((p) => p.id !== b.dataset.planRemove));
      render();
    });
    backupBar($("#life-backup", host), [mode === "meal" ? "meal-plans" : "weekend-plans"], (_, v) => v.every((p) => typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string" && typeof p.summary === "string"));
  }
  function renderMeal(message = "") {
    const pref = mealPreferences(read("meal-preferences", {}));
    host.innerHTML = `<div class="d-panel"><div class="d-kicker">Dinner, decided</div><h2>\u4ECA\u665A\u83DC\u5355 \xB7 \u9009\u4E00\u4E2A\u5C31\u5F00\u59CB\u505A</h2><p class="d-muted">\u6309\u53EF\u7528\u65F6\u95F4\u3001\u5668\u6750\u548C\u4E0D\u5403\u7684\u98DF\u6750\uFF0C\u7ED9\u51FA\u6700\u591A\u4E09\u4E2A\u5B8C\u6574\u7EC4\u5408\u3002\u4EFD\u91CF\u548C\u65F6\u95F4\u662F\u5BB6\u5EAD\u70F9\u996A\u4F30\u8BA1\uFF0C\u53EF\u81EA\u884C\u8C03\u6574\u3002</p><form id="meal-plan-form" class="d-form">${select("minutes", "\u53EF\u7528\u65F6\u95F4", [["20", "20 \u5206\u949F"], ["30", "30 \u5206\u949F"], ["45", "45 \u5206\u949F"]], pref.minutes || "30")}${select("people", "\u7528\u9910\u4EBA\u6570", [["1", "1 \u4EBA"], ["2", "2 \u4EBA"], ["3", "3 \u4EBA"], ["4", "4 \u4EBA"]], pref.people || "2")}${select("equipment", "\u5668\u6750", [["all", "\u9505\uFF0B\u5FAE\u6CE2\u7089\uFF0B\u7A7A\u6C14\u70B8\u9505"], ["pot", "\u53EA\u6709\u9505"], ["microwave", "\u53EA\u6709\u5FAE\u6CE2\u7089"]], pref.equipment || "all")}${field("exclude", "\u4E0D\u5403\u7684\u98DF\u6750\uFF08\u9017\u53F7\u5206\u9694\uFF09", "text", pref.exclude || "", 'maxlength="200"')}${field("pantry", "\u4F18\u5148\u7528\u6389\uFF08\u98DF\u6750\u5173\u952E\u8BCD\uFF0C\u9017\u53F7\u5206\u9694\uFF09", "text", pref.pantry || "", 'maxlength="200"')}<div class="d-actions"><button type="submit" class="d-primary">\u751F\u6210\u4ECA\u665A\u83DC\u5355</button></div></form><p id="meal-status" class="d-note" role="status" aria-live="polite"></p><div id="meal-options"></div>${history2()}<div id="life-backup"></div></div>`;
    $("#meal-plan-form", host).onsubmit = (e) => {
      e.preventDefault();
      const p = mealPreferences(data(e.target));
      const stored = save("meal-preferences", p);
      generateMeals(p);
      mealGenerations++;
      mealStatus(`\u5DF2\u751F\u6210\u7B2C ${mealGenerations} \u6B21 \xB7 ${options.length} \u4E2A\u7B26\u5408\u6761\u4EF6\u7684\u83DC\u5355 \xB7 ${p.people} \u4EBA\u4EFD${stored ? "" : " \xB7 \u504F\u597D\u672A\u80FD\u4FDD\u5B58\u5230\u672C\u673A"}`);
    };
    bindHistory();
    generateMeals(pref);
    mealStatus(message || `\u5DF2\u6309\u5F53\u524D\u6761\u4EF6\u51C6\u5907 ${options.length} \u4E2A\u83DC\u5355\uFF1B\u8C03\u6574\u6761\u4EF6\u540E\u70B9\u51FB\u201C\u751F\u6210\u4ECA\u665A\u83DC\u5355\u201D\u3002`);
  }
  function generateMeals(p) {
    const ex = p.exclude.split(/[,，、]/).map((x) => x.trim()).filter(Boolean), pan = p.pantry.split(/[,，、]/).map((x) => x.trim()).filter(Boolean), equipment = p.equipment === "pot" ? ["\u9505"] : p.equipment === "microwave" ? ["\u5FAE\u6CE2\u7089"] : ["\u9505", "\u5FAE\u6CE2\u7089", "\u7A7A\u6C14\u70B8\u9505"];
    const matches = meals.filter((m) => m.minutes <= Number(p.minutes) && m.equipment.every((x) => equipment.includes(x)) && !ex.some((x) => m.tags.includes(x) || m.name.includes(x))).sort((a, b) => pan.filter((x) => b.tags.includes(x)).length - pan.filter((x) => a.tags.includes(x)).length);
    const last = saved().at(-1)?.title;
    options = matches.sort((a, b) => Number(a.name === last) - Number(b.name === last)).slice(0, 3).map((m) => ({ ...m, people: Number(p.people), ingredients: m.ingredients.map(([n, q, u]) => [n, q * Number(p.people) / 2, u]) }));
    $("#meal-options", host).innerHTML = options.length ? `<div class="d-grid">${options.map((m, i) => `<article class="d-inset"><span class="d-pill">\u7EA6 ${m.minutes} \u5206\u949F \xB7 ${m.people} \u4EBA</span><h3>${esc(m.name)}</h3><p class="d-muted">${m.equipment.join("\uFF0B")}${pan.some((x) => m.tags.includes(x)) ? " \xB7 \u7528\u5230\u4F18\u5148\u98DF\u6750" : ""}</p><details open><summary>\u91C7\u8D2D\uFF0F\u5907\u6599\u6E05\u5355</summary>${m.ingredients.map(([n, q, u]) => `<label class="d-check"><input type="checkbox">${n} ${q}${u}</label>`).join("")}</details><ol>${m.steps.map((s) => `<li>${esc(s.replace("\u4E24\u4EBA", m.people + " \u4EBA"))}</li>`).join("")}</ol><div class="d-actions"><button class="d-primary" data-meal-pick="${i}">\u4ECA\u665A\u5C31\u5403\u8FD9\u4E2A</button><button data-meal-copy="${i}">\u590D\u5236\u6E05\u5355</button></div></article>`).join("")}</div>` : '<div class="d-empty">\u73B0\u6709\u83DC\u5355\u6CA1\u6709\u6EE1\u8DB3\u6240\u6709\u6761\u4EF6\u7684\u7EC4\u5408\u3002\u8BF7\u653E\u5BBD\u65F6\u95F4\u6216\u5668\u6750\u6761\u4EF6\uFF1B\u4E0D\u4F1A\u5FFD\u7565\u4F60\u6392\u9664\u7684\u98DF\u6750\u3002</div>';
    host.querySelectorAll("[data-meal-pick]").forEach((b) => b.onclick = () => {
      const m = options[Number(b.dataset.mealPick)], plan = { id: id(), title: m.name, summary: `${m.people} \u4EBA \xB7 ${m.minutes} \u5206\u949F`, at: (/* @__PURE__ */ new Date()).toISOString(), text: mealText(m) };
      if (save("meal-plans", [...saved(), plan].slice(-100))) {
        renderMeal("\u5DF2\u4FDD\u5B58\uFF1A" + m.name + "\u3002\u53EF\u5728\u201C\u5DF2\u9009\u5B89\u6392\u201D\u67E5\u770B\u3002");
        toast("\u5DF2\u4FDD\u5B58\u4ECA\u665A\u83DC\u5355");
      } else mealStatus("\u4FDD\u5B58\u5931\u8D25\uFF1A\u672C\u673A\u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5148\u590D\u5236\u6E05\u5355\u3002");
    });
    host.querySelectorAll("[data-meal-copy]").forEach((b) => b.onclick = () => copy(mealText(options[Number(b.dataset.mealCopy)])));
  }
  function mealText(m) {
    return `${m.name}
${m.people} \u4EBA \xB7 \u9884\u8BA1 ${m.minutes} \u5206\u949F
\u5907\u6599\uFF1A
${m.ingredients.map(([n, q, u]) => `${n} ${q}${u}`).join("\n")}
\u6B65\u9AA4\uFF1A
${m.steps.map((s, i) => `${i + 1}. ${s.replace("\u4E24\u4EBA", m.people + " \u4EBA")}`).join("\n")}`;
  }
  function renderWeekend() {
    const pref = read("weekend-preferences", {});
    host.innerHTML = `<section class="d-panel"><div class="d-kicker">A half day, ready to choose</div><h2>\u534A\u65E5\u5B89\u6392 \xB7 \u6D3B\u52A8\uFF0B\u5403\u996D</h2><p class="d-muted">\u4ECE\u771F\u5B9E\u6D3B\u52A8\u5FEB\u7167\u9009\u6700\u591A\u4E09\u4E2A\u65B9\u6848\uFF0C\u4FDD\u7559\u6765\u6E90\u4E0E\u5730\u70B9\u3002\u65F6\u95F4\u8868\u662F\u5EFA\u8BAE\uFF1B\u4EA4\u901A\u3001\u8425\u4E1A\u3001\u7968\u52A1\u9700\u5728\u51FA\u53D1\u524D\u6838\u5BF9\u3002</p><form id="weekend-plan-form" class="d-form">${field("date", "\u54EA\u5929\u51FA\u53D1", "date", pref.date >= dateIn() ? pref.date : dateIn(), "required")}${select("city", "\u5730\u533A", cityChoices, pref.city || "")}${select("start", "\u6D3B\u52A8\u6700\u65E9\u5F00\u59CB", [["9", "09:00"], ["10", "10:00"], ["12", "12:00"], ["14", "14:00"]], pref.start || "10")}${select("hours", "\u53EF\u7528\u65F6\u957F", [["3", "3 \u5C0F\u65F6"], ["4", "4 \u5C0F\u65F6"], ["6", "6 \u5C0F\u65F6"]], pref.hours || "4")}${select("free", "\u8D39\u7528", [["any", "\u4E0D\u9650"], ["yes", "\u53EA\u770B\u5DF2\u786E\u8BA4\u514D\u8D39"]], pref.free || "any")}${field("query", "\u5174\u8DA3\u5173\u952E\u8BCD\uFF08\u53EF\u7A7A\uFF09", "text", pref.query || "", 'maxlength="80"')}${select("restaurant", "\u7528\u9910\u9009\u62E9", [["", "\u5728\u6D3B\u52A8\u9644\u8FD1\u627E\u9910\u5385"], ...places().map((p) => [p.id, p.name + " \xB7 " + (p.address || "\u5730\u533A\u672A\u586B")])], pref.restaurant || "")}<div class="d-actions d-wide"><button class="d-primary">\u751F\u6210\u534A\u65E5\u65B9\u6848</button><button id="weekend-refresh" type="button">\u21BB \u8BFB\u53D6\u6D3B\u52A8\u5FEB\u7167</button>${link(appURL("meal-orbit/"), "\u4ECA\u665A\u5728\u5BB6\u505A\u996D")}</div></form><p class="d-muted">\u6D3B\u52A8\u5FEB\u7167 ${stamp(events.updatedAt)} \xB7 ${fresh(events.updatedAt) ? "\u5DF2\u52A0\u8F7D" : "\u6570\u636E\u672A\u8F7D\u5165\u6216\u8FC7\u671F\uFF1B\u8BF7\u6838\u5BF9\u6765\u6E90"}</p><div id="weekend-options"></div>${history2()}<div id="life-backup"></div></section>`;
    $("#weekend-plan-form", host).onsubmit = (e) => {
      e.preventDefault();
      const p = data(e.target);
      save("weekend-preferences", p);
      generateWeekend(p);
    };
    $("#weekend-refresh", host).onclick = load;
    bindHistory();
    if (events.events.length) generateWeekend(data($("#weekend-plan-form", host)));
  }
  var time = (n) => `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
  function generateWeekend(p) {
    const pool = planEvents(events.events, { date: p.date, city: p.city, start: Number(p.start), hours: Number(p.hours), query: p.query, freeOnly: p.free === "yes" }).filter((e) => !e.checkedAt || fresh(e.checkedAt));
    const restaurant = places().find((x) => x.id === p.restaurant);
    options = pool.slice(batch, batch + 3);
    if (!options.length && pool.length) {
      batch = 0;
      options = pool.slice(0, 3);
    }
    const plans = options.map((e) => {
      const start = e.start.length >= 16 ? Number(e.start.slice(11, 13)) * 60 + Number(e.start.slice(14, 16)) : Number(p.start) * 60;
      let duration = 60;
      if (e.end?.slice(0, 10) === e.start.slice(0, 10) && e.end.length >= 16) {
        duration = Math.max(60, Math.min(90, Number(e.end.slice(11, 13)) * 60 + Number(e.end.slice(14, 16)) - start));
      }
      const finish = start + duration;
      const food = restaurant?.name || e.city + " " + e.venue + " \u9644\u8FD1\u9910\u5385";
      const route = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent("Juanita, Kirkland WA") + "&destination=" + encodeURIComponent(food) + "&waypoints=" + encodeURIComponent(e.venue + ", " + e.city);
      return { e, start, finish, food, route, restaurant, p };
    });
    $("#weekend-options", host).innerHTML = plans.length ? `<p class="d-muted">\u627E\u5230 ${pool.length} \u4E2A\u5019\u9009 \xB7 \u884C\u7A0B\u5185\u9884\u7559 30 \u5206\u949F\u8F6C\u573A\uFF0C\u4E0D\u4EE3\u8868\u5B9E\u65F6\u8F66\u7A0B\u3002\u5E26\u56FA\u5B9A\u65F6\u6BB5\u6D3B\u52A8\u53EF\u80FD\u53EA\u5B89\u6392\u90E8\u5206\u53C2\u89C2\uFF0C\u9884\u7EA6\u9879\u76EE\u8BF7\u4EE5\u539F\u6587\u4E3A\u51C6\u3002</p><div class="d-grid">${plans.map((x, i) => `<article class="d-inset"><span class="d-pill">${esc(x.e.city)} \xB7 ${esc(x.e.cost)}</span><h3>${esc(x.e.title)}</h3><p class="d-muted">${esc(x.e.description?.slice(0, 220) || "\u8BE6\u60C5\u89C1\u6D3B\u52A8\u539F\u6587")}</p><div class="d-step"><b>${time(x.start)}</b><div><strong>\u53C2\u52A0\u6D3B\u52A8</strong><p>${esc(x.e.venue)}</p><small>${x.e.start.length < 16 ? "\u539F\u6587\u672A\u7ED9\u51FA\u65F6\u95F4\uFF0C\u4EE5\u4E0A\u4E3A\u5EFA\u8BAE\u5B89\u6392" : "\u6765\u6E90\u5F00\u59CB\u65F6\u95F4 " + esc(x.e.start.slice(11, 16))} \xB7 ${link(x.e.url, "\u6838\u5BF9\u6D3B\u52A8")}</small></div></div><div class="d-step"><b>${time(x.finish + 30)}</b><div><strong>${esc(x.restaurant?.name || "\u9644\u8FD1\u5403\u996D")}</strong><p>${x.restaurant ? "\u4F7F\u7528\u4F60\u6536\u85CF\u7684\u9910\u5385\uFF1B\u8BF7\u6838\u5BF9\u662F\u5426\u987A\u8DEF\u3001\u662F\u5426\u8425\u4E1A\u3002" : "\u9009\u62E9\u6D3B\u52A8\u9644\u8FD1\u9910\u5385\uFF0C\u907F\u514D\u518D\u8DE8\u533A\u3002"}</p>${link("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(x.food), "\u67E5\u770B\u9910\u5385")}</div></div><div class="d-actions"><button class="d-primary" data-weekend-pick="${i}">\u9009\u8FD9\u4E2A\u65B9\u6848</button>${link(x.route, "\u8DEF\u7EBF\u4E0E\u5B9E\u9645\u8F66\u7A0B")}<button data-weekend-ask="${i}">\u95EE GPT \u2197</button></div></article>`).join("")}</div>${pool.length > 3 ? '<button id="weekend-more">\u6362\u4E00\u7EC4\u65B9\u6848</button>' : ""}` : '<div class="d-empty">\u5F53\u524D\u5FEB\u7167\u6CA1\u6709\u6EE1\u8DB3\u8FD9\u4E9B\u6761\u4EF6\u7684\u6D3B\u52A8\u3002\u53EF\u66F4\u6362\u65E5\u671F\u3001\u5730\u533A\u6216\u5173\u952E\u8BCD\uFF1B\u4E0D\u4F1A\u7528\u65E7\u6D3B\u52A8\u586B\u5145\u884C\u7A0B\u3002</div>';
    host.querySelectorAll("[data-weekend-pick]").forEach((b) => b.onclick = () => {
      const x = plans[Number(b.dataset.weekendPick)], text = weekendText(x), plan = { id: id(), title: x.e.title, summary: p.date + " \xB7 " + x.e.city, at: (/* @__PURE__ */ new Date()).toISOString(), text };
      save("weekend-plans", [...saved(), plan].slice(-100));
      toast("\u65B9\u6848\u5DF2\u4FDD\u5B58\uFF0C\u53EF\u5728\u4E0B\u65B9\u590D\u5236\u5B89\u6392");
      renderWeekend();
    });
    host.querySelectorAll("[data-weekend-ask]").forEach((b) => b.onclick = () => ask("\u5468\u672B\u534A\u65E5\u5B89\u6392", plans[Number(b.dataset.weekendAsk)], "\u8BF7\u68C0\u67E5\u884C\u7A0B\u65F6\u95F4\u548C\u4EA4\u901A\u662F\u5426\u5408\u7406\uFF0C\u6838\u5BF9\u6D3B\u52A8\u548C\u9910\u5385\u8425\u4E1A\u4FE1\u606F\uFF0C\u518D\u7ED9\u51FA\u53EF\u6267\u884C\u5B89\u6392\u3002"));
    $("#weekend-more", host)?.addEventListener("click", () => {
      batch = (batch + 3) % pool.length;
      generateWeekend(p);
    });
  }
  function weekendText(x) {
    return `${x.p.date} \xB7 ${x.e.city}
${time(x.start)} ${x.e.title}
${x.e.venue}
\u6D3B\u52A8\u539F\u6587\uFF1A${x.e.url}
${time(x.finish + 30)} \u7528\u9910\uFF1A${x.food}
\u5EFA\u8BAE\u884C\u7A0B\uFF0C\u51FA\u53D1\u524D\u6838\u5BF9\u6D3B\u52A8\u65F6\u6BB5\u3001\u7968\u52A1\u3001\u8425\u4E1A\u548C\u5B9E\u9645\u8F66\u7A0B\u3002
\u8DEF\u7EBF\uFF1A${x.route}`;
  }
  async function load() {
    try {
      events = await json("apps/eastside-weekend/data/events.json");
      renderWeekend();
    } catch (e) {
      toast(e.message);
      renderWeekend();
    }
  }
  if (host) {
    render();
    if (mode === "weekend") load();
  }
  addEventListener("workspace-records", (e) => {
    if (mode === "weekend" && ["savedPlaces", "sync"].includes(e.detail.key)) {
      const select2 = host.querySelector("[name=restaurant]");
      if (!select2) return;
      const value = select2.value;
      select2.replaceChildren(new Option("\u6D3B\u52A8\u9644\u8FD1\u7528\u9910", ""), ...places().map((p) => new Option(p.name, p.id || p.name)));
      if ([...select2.options].some((o) => o.value === value)) select2.value = value;
    }
  });

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
  function send(frame, type, data2 = {}) {
    frame.contentWindow?.postMessage({ channel: "pt-workspace", type, ...data2 }, location.origin);
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
