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

  // apps/_decision/collector.js
  var API = "https://pt-universe-api.summer07-nanjolno.workers.dev";
  var registering = null;
  async function account(create = false) {
    let a = read("collector-account", null);
    if (a) return a;
    if (!create) return null;
    if (registering) return registering;
    registering = (async () => {
      a = { id: crypto.randomUUID(), token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("") };
      const r = await fetch(API + "/api/sync/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a), signal: AbortSignal.timeout(2e4) });
      if (!r.ok) throw Error("\u540E\u53F0\u8D26\u53F7\u521B\u5EFA\u5931\u8D25 HTTP " + r.status);
      if (!save("collector-account", a)) throw Error("\u65E0\u6CD5\u4FDD\u5B58\u540E\u53F0\u8FDE\u63A5");
      return a;
    })();
    try {
      return await registering;
    } finally {
      registering = null;
    }
  }

  // apps/_decision/meal-planner.mjs
  var families = {
    "\u756A\u8304": ["\u897F\u7EA2\u67FF", "\u897F\u7D05\u67FF", "\u8543\u8304", "tomato"],
    "\u571F\u8C46": ["\u9A6C\u94C3\u85AF", "\u99AC\u9234\u85AF", "\u6D0B\u828B", "potato"],
    "\u9E21\u86CB": ["\u86CB", "\u96DE\u86CB", "\u9E21\u5B50", "egg", "eggs"],
    "\u9E21\u8089": ["\u9E21", "\u96DE", "\u9E21\u817F", "\u9E21\u817F\u8089", "\u9E21\u80F8", "\u9E21\u80F8\u8089", "\u96DE\u8089", "\u9E21\u7FC5", "\u9E21\u4E01", "\u9E21\u4E1D", "\u6574\u9E21", "\u4E09\u9EC4\u9E21", "chicken"],
    "\u725B\u8089": ["\u725B\u8089\u7247", "\u725B\u8089\u8584\u7247", "\u80A5\u725B", "\u725B\u8169", "\u725B\u8171", "\u725B\u67F3", "\u725B\u91CC\u810A", "beef"],
    "\u732A\u8089": ["\u732A\u8089\u7247", "\u732A\u8089\u672B", "\u8089\u672B", "\u8C6C\u8089", "\u4E94\u82B1\u8089", "\u732A\u91CC\u810A", "\u732A\u7626\u8089", "\u91CC\u810A\u8089", "\u6392\u9AA8", "pork"],
    "\u4E09\u6587\u9C7C": ["\u4E09\u6587\u9B5A", "\u9C91\u9C7C", "\u9BAD\u9B5A", "salmon"],
    "\u91D1\u67AA\u9C7C": ["\u91D1\u69CD\u9B5A", "\u541E\u62FF\u9C7C", "\u5373\u98DF\u91D1\u67AA\u9C7C", "\u91D1\u67AA\u9C7C\u7F50\u5934", "tuna"],
    "\u867E": ["\u867E\u4EC1", "\u8766", "\u8766\u4EC1", "\u5927\u867E", "\u867E\u76AE", "\u867E\u7C73", "\u6D77\u867E", "shrimp"],
    "\u897F\u5170\u82B1": ["\u897F\u862D\u82B1", "\u9752\u82B1\u83DC", "\u7EFF\u82B1\u6930\u83DC", "broccoli"],
    "\u9752\u6912": ["\u751C\u6912", "\u5F69\u6912", "bell pepper"],
    "\u6D0B\u8471": ["\u6D0B\u8525", "onion"],
    "\u9752\u83DC": ["\u5C0F\u767D\u83DC", "\u4E0A\u6D77\u9752", "\u6CB9\u83DC", "\u83E0\u83DC", "bok choy"],
    "\u767D\u83DC": ["\u5927\u767D\u83DC", "\u5A03\u5A03\u83DC", "chinese cabbage"],
    "\u80E1\u841D\u535C": ["\u80E1\u863F\u8514", "\u7EA2\u841D\u535C", "carrot"],
    "\u8C46\u8150": ["tofu"],
    "\u8611\u83C7": ["\u767D\u8611\u83C7", "\u53E3\u8611", "mushroom"],
    "\u9999\u83C7": ["shiitake"],
    "\u8304\u5B50": ["eggplant"],
    "\u9EC4\u74DC": ["\u9EC3\u74DC", "\u5C0F\u9EC4\u74DC", "cucumber"],
    "\u7389\u7C73": ["\u7389\u7C73\u7C92", "\u5373\u98DF\u7389\u7C73\u7C92", "\u7C9F\u7C73", "corn"],
    "\u8C4C\u8C46": ["\u9752\u8C46", "peas"],
    "\u7C73\u996D": ["\u719F\u7C73\u996D", "\u5DF2\u716E\u719F\u7C73\u996D", "\u53EF\u76F4\u63A5\u52A0\u70ED\u7C73\u996D", "\u7C73\u98EF", "\u5927\u7C73", "\u7C73", "rice"],
    "\u9762\u6761": ["\u9762\u689D", "\u9762", "\u6302\u9762", "\u9EB5\u689D", "noodles"],
    "\u71D5\u9EA6": ["\u71D5\u9EA6\u7247", "\u71D5\u9EA5", "\u71D5\u9EA5\u7247", "oats"],
    "\u725B\u5976": ["milk"],
    "\u9999\u8549": ["banana"],
    "\u98DF\u7528\u6CB9": ["\u6CB9", "\u6A44\u6984\u6CB9", "\u83DC\u7C7D\u6CB9"],
    "\u76D0": ["\u9E7D", "salt"],
    "\u8089\u7C7B": ["\u8089", "\u8364\u83DC", "\u8477\u83DC"],
    "\u9C7C\u7C7B": ["\u9C7C", "\u9B5A", "fish"],
    "\u6D77\u9C9C": ["\u6D77\u9BAE", "seafood"],
    "\u83CC\u83C7": ["\u83C7", "\u8611\u83C7\u7C7B", "\u83CC\u7C7B", "\u83C7\u7C7B"],
    "\u8C46\u7C7B": ["\u8C46", "\u5927\u8C46", "\u8C46\u5236\u54C1", "\u8C46\u88FD\u54C1"],
    "\u4E73\u5236\u54C1": ["\u5976", "\u4E73", "\u5976\u5236\u54C1", "\u4E73\u88FD\u54C1"],
    "\u5C0F\u9EA6": ["\u5C0F\u9EA5", "\u9EB8\u8D28", "\u9EA9\u8CEA", "wheat"],
    "\u7532\u58F3\u7C7B": ["\u7532\u6BBC\u985E"],
    "\u8FA3\u6912": ["\u8FA3", "\u8FA3\u7684", "chili", "\u5C0F\u7C73\u8FA3", "\u5C0F\u7C73\u6912", "\u5241\u6912", "\u5E72\u8FA3\u6912", "\u8FA3\u6912\u7C89", "\u8FA3\u6912\u6CB9", "\u90EB\u53BF\u8C46\u74E3\u9171"],
    "\u9999\u83DC": ["\u82AB\u837D"],
    "\u8471": ["\u8471\u82B1", "\u8525"],
    "\u849C": ["\u5927\u849C", "\u849C\u5934"],
    "\u59DC": ["\u751F\u59DC", "\u8591"],
    "\u575A\u679C": ["\u5805\u679C", "nuts"],
    "\u82B1\u751F": ["peanut"],
    "\u829D\u9EBB": ["sesame"]
  };
  var normalize = (x) => String(x ?? "").normalize("NFKC").trim().toLowerCase();
  var aliases = new Map(Object.entries(families).flatMap(([key, list]) => [key, ...list].map((x) => [normalize(x), key])));
  var groups = { \u9E21\u8089: ["\u8089\u7C7B"], \u725B\u8089: ["\u8089\u7C7B"], \u732A\u8089: ["\u8089\u7C7B"], \u4E09\u6587\u9C7C: ["\u9C7C\u7C7B", "\u6D77\u9C9C"], \u91D1\u67AA\u9C7C: ["\u9C7C\u7C7B", "\u6D77\u9C9C"], \u867E: ["\u6D77\u9C9C", "\u7532\u58F3\u7C7B"], \u8C46\u8150: ["\u8C46\u7C7B"], \u8C4C\u8C46: ["\u8C46\u7C7B"], \u725B\u5976: ["\u4E73\u5236\u54C1"], \u9762\u6761: ["\u5C0F\u9EA6"], \u8611\u83C7: ["\u83CC\u83C7"], \u9999\u83C7: ["\u83CC\u83C7"] };
  function parseIngredients(value) {
    let text = normalize(value);
    for (const [alias, key] of aliases) if (alias.includes(" ")) text = text.replaceAll(alias, key);
    return [...new Set(text.split(/[,，、;；\n\t +/|]+|以及|还有|和|与|及/).map((x) => x.replace(/^(?:我有|有|不吃|不要|忌口)\s*/, "").replace(/\d+(?:\.\d+)?\s*(?:克|千克|公斤|g|kg|个|根|颗|袋|斤)$/, "").trim()).filter(Boolean).map((x) => aliases.get(x) || x))];
  }
  var categoryNames = { meat_dish: "\u8364\u83DC", vegetable_dish: "\u7D20\u83DC", aquatic: "\u6C34\u4EA7", staple: "\u4E3B\u98DF", soup: "\u6C64", breakfast: "\u65E9\u9910", dessert: "\u751C\u70B9", drink: "\u996E\u54C1", "semi-finished": "\u534A\u6210\u54C1", condiment: "\u9171\u6599" };
  var dinnerCategories = /* @__PURE__ */ new Set(["meat_dish", "vegetable_dish", "aquatic", "staple", "soup", "breakfast"]);
  function section(md, heading) {
    const parts = md.split(/^##\s+/m);
    return (parts.slice(1).find((x) => heading.test(x.split("\n")[0])) || "").split("\n").slice(1).join("\n").trim();
  }
  function number(text) {
    if (/^[\d.]+$/.test(text)) return Number(text);
    const digits = { \u96F6: 0, \u4E00: 1, \u4E8C: 2, \u4E24: 2, \u4E09: 3, \u56DB: 4, \u4E94: 5, \u516D: 6, \u4E03: 7, \u516B: 8, \u4E5D: 9 };
    if (text.includes("\u5341")) {
      const [a, b] = text.split("\u5341");
      return (digits[a] || 1) * 10 + (digits[b] || 0);
    }
    return digits[text] || 0;
  }
  function duration(intro) {
    const phrases = intro.match(/[^。！？\n]*(?:分钟|小时|刻钟)[^。！？\n]*/g) || [];
    const text = phrases.at(-1) || "";
    let numeric = text.replace(/([一二两三四五六七八九十零]+)(?=\s*(?:个)?(?:半)?(?:小时|分钟))/g, (x) => number(x));
    numeric = numeric.replace(/(?<![\d个])半(?:个)?小时/g, "0.5\u5C0F\u65F6").replace(/一刻钟/g, "15\u5206\u949F");
    const matches = [...numeric.matchAll(/(\d+(?:\.\d+)?)\s*(?:个)?(半)?\s*(小时|分钟)/g)];
    const minutes = matches.length ? matches.reduce((sum, m) => sum + (Number(m[1]) + (m[2] ? 0.5 : 0)) * (m[3] === "\u5C0F\u65F6" ? 60 : 1), 0) : null;
    return { minutes: minutes && minutes <= 1440 ? minutes : null, timeText: text };
  }
  function recipeEquipment(title, ingredients, steps) {
    const body = ingredients + "\n" + steps, tools = [];
    for (const [name, re] of [["\u7A7A\u6C14\u70B8\u9505", /空气炸锅/], ["\u5FAE\u6CE2\u7089", /微波炉|微波加热/], ["\u70E4\u7BB1", /烤箱/], ["\u9AD8\u538B\u9505", /高压锅|压力锅/], ["\u7535\u996D\u7172", /电饭煲|电饭锅|电炖锅/], ["\u84B8\u9505", /蒸锅|蒸笼|蒸箱/]]) if (re.test(body) || re.test(title)) tools.push(name);
    if (/炒锅|平底锅|热锅|起锅|锅中|锅内|锅里|煎锅|烧一锅/.test(body) || !tools.length && /[炒煎煮炖炸蒸焯]/.test(steps)) tools.push("\u9505");
    return [...new Set(tools)];
  }
  function prepareRecipes(snapshot) {
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.recipes) || snapshot.recipes.length < 300) throw Error("\u5B8C\u6574\u83DC\u8C31\u5E93\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D");
    return snapshot.recipes.map((r) => {
      const ingredients = section(r.md, /原料|食材/), quantities = section(r.md, /计算|用量/), steps = section(r.md, /操作|做法|步骤/);
      const intro = r.md.split(/^##\s/m)[0], category = r.path.split("/")[1];
      const serving = quantities.match(/一份正好够\s*(\d+)\s*个?人/) || quantities.match(/(?:适合|供|为|以|按)?\s*(\d+)\s*人(?:份|食用|食|的)/);
      const baseServings = serving ? Number(serving[1]) : null;
      return {
        ...r,
        id: r.path,
        category,
        categoryName: categoryNames[category] || category,
        ingredientsText: ingredients,
        quantitiesText: quantities,
        stepsText: steps,
        baseServings,
        ...duration(intro),
        equipment: recipeEquipment(r.name, ingredients, steps),
        advance: /提前[^\n。]*(?:一晚|一天|过夜)|(?:腌制|冷藏|浸泡|静置)[^\n。]*(?:一晚|一夜|过夜)/.test(steps),
        source: snapshot.source + "/blob/" + snapshot.sourceCommit + "/" + r.path.split("/").map(encodeURIComponent).join("/")
      };
    });
  }
  function mealPreferences(value) {
    const p = value && typeof value === "object" ? value : {};
    return {
      minutes: ["20", "30", "45", "60", "90", "120", "any"].includes(String(p.minutes)) ? String(p.minutes) : "30",
      people: ["1", "2", "3", "4"].includes(String(p.people)) ? String(p.people) : "2",
      equipment: ["all", "pot", "microwave", "airfryer", "any"].includes(p.equipment) ? p.equipment : "all",
      category: ["dinner", "all", ...Object.keys(categoryNames)].includes(p.category) ? p.category : "dinner",
      exclude: typeof p.exclude === "string" ? p.exclude : "",
      pantry: typeof p.pantry === "string" ? p.pantry : ""
    };
  }
  function variants(term) {
    const memberKeys = Object.entries(groups).filter(([, g]) => g.includes(term)).map(([key]) => key);
    if (term === "\u8611\u83C7") memberKeys.push("\u9999\u83C7");
    const keys = [term, ...memberKeys];
    return [...new Set(keys.flatMap((k) => [k, ...families[k] || []]))].filter((v) => v.length > 1 || !["\u9E21", "\u725B", "\u732A", "\u9C7C", "\u8089", "\u86CB", "\u5976", "\u7C73", "\u9762", "\u6CB9", "\u8C46", "\u83C7"].includes(v));
  }
  var groupPatterns = { "\u6D77\u9C9C": /虾|蝦|蟹|蚝|牡蛎|蛤|贝|鲍|鱿|章鱼|墨鱼|鱼|魚/, "\u9C7C\u7C7B": /鱼|魚/, "\u8089\u7C7B": /鸡肉|鸡腿|鸡翅|鸡胸|鸭|鹅|牛肉|牛腩|猪|羊肉|兔肉|五花肉|里脊|排骨|腊肠|火腿|香肠|培根/, "\u8C46\u7C7B": /豆|酱油|生抽|老抽/, "\u4E73\u5236\u54C1": /牛奶|酸奶|奶油|奶酪|黄油|乳酪|炼乳/, "\u575A\u679C": /花生|核桃|腰果|杏仁|榛子|碧根果|开心果|松仁|松子/, "\u5C0F\u9EA6": /小麦|面粉|面条|挂面|面包|吐司|馒头|饺子皮|生抽|老抽|酱油/, "\u7532\u58F3\u7C7B": /虾|蝦|蟹|龙虾/, "\u83CC\u83C7": /菇|木耳|菌/ };
  function ingredientMatch(text, term) {
    const t = normalize(text);
    return groupPatterns[term] ? groupPatterns[term].test(t) : variants(term).some((v) => t.includes(normalize(v)));
  }
  function scaleQuantities(recipe, people) {
    if (!recipe.baseServings) return { text: recipe.quantitiesText || recipe.ingredientsText, note: `\u8BA1\u5212 ${people} \u4EBA\uFF1B\u539F\u6587\u672A\u660E\u786E\u57FA\u51C6\u4EBA\u6570\uFF0C\u4EE5\u4E0B\u4FDD\u7559\u539F\u7528\u91CF\u3002` };
    const factor = Number(people) / recipe.baseServings;
    const text = recipe.quantitiesText.split("\n").map((line) => {
      if (!/^\s*[-*]\s/.test(line)) return line;
      const clean = line.replace(/\*\s*份数/g, "");
      if (/[*÷/]|每.*(?:个|只).*\d/.test(clean.replace(/^\s*[-*]\s/, ""))) return line + "\uFF08\u539F\u516C\u5F0F\uFF09";
      return clean.replace(/(\d+(?:\.\d+)?)(?:\s*[-~至]\s*(\d+(?:\.\d+)?))?\s*(kg|ml|g|克|千克|毫升|升|个|只|颗|根|片|瓣|勺|斤|两)(?!\w)/gi, (_, a, b, u) => `${Math.round(Number(a) * factor * 100) / 100}${b ? "-" + Math.round(Number(b) * factor * 100) / 100 : ""}${u}`);
    }).filter((line) => !/一份正好够|计划做几份/.test(line)).join("\n");
    return { text, note: `\u6309\u539F\u6587 ${recipe.baseServings} \u4EBA\u57FA\u51C6\u6298\u7B97\u81F3 ${people} \u4EBA\uFF1B\u590D\u6742\u516C\u5F0F\u4FDD\u7559\uFF0C\u70F9\u996A\u65F6\u95F4\u4E0D\u968F\u4EBA\u6570\u7B49\u6BD4\u7F29\u653E\u3002` };
  }
  function planMeals(recipes, value, { offset = 0, recent = [] } = {}) {
    const p = mealPreferences(value), pantry = parseIngredients(p.pantry), exclude = parseIngredients(p.exclude);
    const equipment = { all: ["\u9505", "\u5FAE\u6CE2\u7089", "\u7A7A\u6C14\u70B8\u9505"], pot: ["\u9505"], microwave: ["\u5FAE\u6CE2\u7089"], airfryer: ["\u7A7A\u6C14\u70B8\u9505"], any: null }[p.equipment];
    const has = (m, t) => {
      let text = (groupPatterns[t] ? "" : m.name) + "\n" + (m.ingredientsText + "\n" + m.quantitiesText).split("\n").filter((l) => !l.includes("\u53EF\u9009")).join("\n");
      if (t === "\u756A\u8304") text = text.replace(/番茄酱|番茄膏|西红柿酱/g, "");
      return ingredientMatch(text, t);
    };
    const candidatesByCategory = recipes.filter((m) => p.category === "all" || (p.category === "dinner" ? dinnerCategories.has(m.category) : m.category === p.category));
    const eligible = candidatesByCategory.filter((m) => (p.minutes === "any" || m.minutes !== null && m.minutes <= Number(p.minutes) && !m.advance) && (!equipment || m.equipment.every((x) => equipment.includes(x))) && !exclude.some((t) => ingredientMatch(m.ingredientsText + "\n" + m.quantitiesText + "\n" + m.stepsText, t)));
    const unavailable = pantry.filter((t) => !eligible.some((m) => has(m, t)));
    const unknownExclusions = exclude.filter((t) => !aliases.has(normalize(t)) && !recipes.some((m) => has(m, t)));
    const candidates = eligible.map((m) => ({ ...m, matched: pantry.filter((t) => has(m, t)), titleMatches: pantry.filter((t) => ingredientMatch(m.name, t)).length })).filter((m) => !pantry.length || m.matched.length > 0).sort((a, b) => b.matched.length - a.matched.length || b.titleMatches - a.titleMatches || Number(recent.includes(a.name)) - Number(recent.includes(b.name)) || (p.minutes === "any" ? 0 : Math.abs(Number(p.minutes) - (a.minutes || 0)) - Math.abs(Number(p.minutes) - (b.minutes || 0))) || a.id.localeCompare(b.id, "zh-CN"));
    if (unknownExclusions.length) return { options: [], total: 0, offset: 0, pantry, exclude, unavailable, unknownExclusions, preferences: p };
    const start = candidates.length ? Math.max(0, offset) % candidates.length : 0;
    const selected = Array.from({ length: Math.min(3, candidates.length) }, (_, i) => candidates[(start + i) % candidates.length]);
    return { options: selected.map((m) => ({ ...m, people: Number(p.people), amounts: scaleQuantities(m, Number(p.people)) })), total: candidates.length, offset: start, pantry, exclude, unavailable, unknownExclusions, preferences: p };
  }

  // apps/_decision/life-ai.js?v=20261007-cards2
  async function runLifeAI(kind, body) {
    const sync = raw("ptu.sync.config", null), a = sync?.id && sync?.token ? sync : await account(true);
    const r = await fetch(`${API}/api/life/${a.id}/${kind}`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + a.token }, body: JSON.stringify(body), signal: AbortSignal.timeout(195e3) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || "AI \u670D\u52A1\u8FD4\u56DE HTTP " + r.status);
    return d;
  }
  var metadata = (d) => `${d.model} \xB7 ${(d.latencyMs / 1e3).toFixed(1)} \u79D2 \xB7 ${d.usage?.reduce((n, x) => n + (x?.totalTokenCount || 0), 0) || 0} tokens \xB7 ${stamp(d.at)}`;
  function mountMealAI(host2, getState) {
    const panel = document.createElement("section");
    panel.className = "d-inset life-ai";
    panel.innerHTML = '<h3>AI \u914D\u9910 \xB7 \u8BD5\u9A8C</h3><p>\u6309\u4E0A\u65B9\u6761\u4EF6\uFF0C\u4ECE\u5B8C\u6574\u83DC\u8C31\u5E93\u642D\u914D 1\u20133 \u9053\u83DC\uFF0C\u7ED9\u51FA\u7406\u7531\u4E0E\u4E0B\u53A8\u987A\u5E8F\u3002</p><div class="d-actions"><button type="button" class="d-primary" data-ai-run>AI \u642D\u914D\u4ECA\u665A\u83DC\u5355</button></div><p class="d-muted">\u70B9\u51FB\u624D\u8C03\u7528 Gemini\uFF1B\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u548C\u5019\u9009\u83DC\u8C31\u4F1A\u53D1\u9001\u7ED9\u6A21\u578B\u3002\u70F9\u996A\u987A\u5E8F\u662F\u5EFA\u8BAE\uFF0C\u7528\u91CF\u548C\u505A\u6CD5\u4EE5\u539F\u83DC\u8C31\u4E3A\u51C6\u3002</p><p data-ai-status role="status" aria-live="polite"></p><div data-ai-result></div>';
    host2.querySelector("#meal-options").before(panel);
    let revision = 0;
    host2.querySelector("#meal-plan-form").addEventListener("input", () => {
      revision++;
      panel.querySelector("[data-ai-result]").replaceChildren();
      panel.querySelector("[data-ai-status]").textContent = "\u6761\u4EF6\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210 AI \u83DC\u5355\u3002";
    });
    panel.querySelector("[data-ai-run]").onclick = async (e) => {
      const button = e.currentTarget, status = panel.querySelector("[data-ai-status]"), result = panel.querySelector("[data-ai-result]");
      const current = revision;
      button.disabled = true;
      status.textContent = "\u6B63\u5728\u7B5B\u9009\u83DC\u8C31\u5E76\u642D\u914D\u83DC\u5355\u2026";
      result.replaceChildren();
      try {
        const { recipes, preferences, recent } = getState(), candidates = [];
        for (let offset = 0; offset < 18; offset += 3) {
          const r = planMeals(recipes, preferences, { offset, recent });
          for (const x of r.options) if (!candidates.some((c) => c.id === x.id)) candidates.push(x);
          if (candidates.length >= r.total) break;
        }
        if (!candidates.length) throw Error("\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u98DF\u6750\u3001\u5668\u6750\u4E0E\u5FCC\u53E3\u6761\u4EF6\u7684\u83DC\u8C31\uFF0C\u8BF7\u5148\u8C03\u6574\u6761\u4EF6\u3002");
        const d = await runLifeAI("meal", { preferences, candidates: candidates.map((m) => ({ id: m.id, name: m.name, source: m.source, ingredients: m.ingredientsText.slice(0, 650), minutes: m.minutes, equipment: m.equipment, advance: m.advance, steps: m.stepsText.slice(0, 500) })) });
        if (current !== revision) {
          status.textContent = "\u6761\u4EF6\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u6309\u65B0\u6761\u4EF6\u91CD\u65B0\u751F\u6210\u3002";
          return;
        }
        const selected = d.recipeIds.map((id2) => candidates.find((m) => m.id === id2));
        if (selected.some((x) => !x)) throw Error("\u8FD4\u56DE\u7684\u83DC\u5355\u4E0D\u5728\u5019\u9009\u83DC\u8C31\u4E2D\uFF0C\u8BF7\u91CD\u8BD5\u3002");
        const text = selected.map((m) => m.name + "\n" + m.amounts.note + "\n" + m.amounts.text + "\n" + m.stepsText + "\n\u6765\u6E90\uFF1A" + m.source).join("\n\n") + "\n\n\u642D\u914D\u7406\u7531\uFF1A" + d.reason + "\n\u4E0B\u53A8\u987A\u5E8F\uFF08\u5EFA\u8BAE\uFF09\uFF1A\n" + d.steps.join("\n");
        result.innerHTML = `<h3>${selected.map((m) => esc(m.name)).join(" \uFF0B ")}</h3><p>${esc(d.reason)}</p><ol>${d.steps.map((s) => "<li>" + esc(s) + "</li>").join("")}</ol>${selected.map((m) => `<details><summary>${esc(m.name)} \xB7 \u539F\u83DC\u8C31</summary><p>${esc(m.amounts.note)}</p><pre>${esc(m.amounts.text + "\n\n" + m.stepsText)}</pre><a href="${esc(m.source)}" target="_blank" rel="noopener">HowToCook \u539F\u6587</a></details>`).join("")}<div class="d-actions"><button data-ai-save>\u4FDD\u5B58\u6574\u4EFD\u83DC\u5355</button><button data-ai-copy>\u590D\u5236\u83DC\u5355\u4E0E\u6E05\u5355</button></div>`;
        status.textContent = metadata(d);
        result.querySelector("[data-ai-copy]").onclick = () => copy(text);
        result.querySelector("[data-ai-save]").onclick = (e2) => {
          const plans = raw("ptu.decision.meal-plans", []);
          if (save("meal-plans", [...plans, { id: id(), title: selected.map((m) => m.name).join(" \uFF0B "), summary: "AI \u914D\u9910 \xB7 " + preferences.people + " \u4EBA", text, at: (/* @__PURE__ */ new Date()).toISOString() }].slice(-100))) {
            e2.currentTarget.disabled = true;
            e2.currentTarget.textContent = "\u5DF2\u4FDD\u5B58\u81F3\u5DF2\u9009\u5B89\u6392";
          }
        };
      } catch (err) {
        status.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  function mountMapsAI(host2, restaurants = false) {
    const pin = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 11 16-7-7 16-2-7-7-2Z"/></svg>';
    host2.classList.add("d-root", "life-ai", "life-ai-map");
    host2.innerHTML = `<section class="d-panel map-discovery"><header class="map-discovery-header"><div class="map-discovery-icon">${pin}</div><div><span class="map-eyebrow">NEARBY DISCOVERIES</span><h2>${restaurants ? "\u627E\u4E00\u5BB6\uFF0C\u4ECA\u665A\u60F3\u53BB\u7684\u9910\u5385" : "\u53D1\u73B0\u9644\u8FD1\u597D\u53BB\u5904"}</h2><p>\u8BF4\u8BF4\u4F60\u7684\u60F3\u6CD5\uFF0C\u8BA9 AI \u5E2E\u4F60\u627E\u5230\u6709\u5730\u56FE\u6765\u6E90\u7684\u771F\u5B9E\u5730\u70B9\u3002</p></div><span class="map-ai-tag">AI \u63A2\u7D22</span></header><form class="map-search-form"><label class="map-city-label">\u63A2\u7D22\u5730\u533A<select name="city">${["Kirkland", "Bellevue", "Redmond", "Lynnwood", "Everett", "Seattle"].map((c) => "<option>" + c + "</option>").join("")}</select></label><label class="map-query-label">\u60F3\u627E\u4EC0\u4E48<textarea name="query" required maxlength="300" placeholder="${restaurants ? "\u4E24\u4E2A\u4EBA\u7684\u665A\u9910\uFF0C\u60F3\u5403\u65E5\u6599\uFF0C\u505C\u8F66\u65B9\u4FBF\u4E00\u70B9\u2026" : "\u60F3\u53BB\u6E56\u8FB9\u6563\u6563\u6B65\uFF0C\u9644\u8FD1\u6700\u597D\u6709\u4E00\u5BB6\u5496\u5561\u5E97\u2026"}"></textarea></label><div class="map-search-actions"><button type="button" data-ai-example>${restaurants ? "\u8BD5\u8BD5\u9644\u8FD1\u665A\u9910" : "\u8BD5\u8BD5\u6563\u6B65\uFF0B\u5496\u5561"} <span aria-hidden="true">\u2197</span></button><button type="submit" class="d-primary">${pin}\u67E5\u627E\u771F\u5B9E\u5730\u70B9</button></div></form><div class="map-search-note"><span class="map-note-dot" aria-hidden="true"></span><span>\u70B9\u51FB\u624D\u67E5\u8BE2 \xB7 \u8425\u4E1A\u3001\u505C\u8F66\u4E0E\u8F66\u7A0B\u4EE5\u5730\u56FE\u8BE6\u60C5\u4E3A\u51C6</span></div><p data-ai-status role="status" aria-live="polite"></p><div data-ai-result></div></section>`;
    const form = host2.querySelector("form"), status = host2.querySelector("[data-ai-status]"), result = host2.querySelector("[data-ai-result]");
    let revision = 0;
    form.addEventListener("input", () => {
      revision++;
      result.replaceChildren();
      status.dataset.state = "";
      status.textContent = "\u9700\u6C42\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2\u3002";
    });
    host2.querySelector("[data-ai-example]").onclick = () => {
      form.elements.query.value = restaurants ? "Kirkland \u9002\u5408\u4E24\u4E2A\u4EBA\u665A\u996D\u7684\u4E2D\u9910\u6216\u65E5\u6599\uFF0C\u4F18\u5148\u505C\u8F66\u65B9\u4FBF\uFF0C\u7ED9\u6211\u4E09\u4E2A\u9009\u62E9" : "Kirkland \u9002\u5408\u6563\u6B65\u7684\u6E56\u8FB9\u516C\u56ED\uFF0C\u9644\u8FD1\u6709\u5496\u5561\u5E97\uFF0C\u7ED9\u6211\u4E09\u4E2A\u9009\u62E9";
      revision++;
      result.replaceChildren();
      status.dataset.state = "";
      status.textContent = "\u5DF2\u586B\u5165\u793A\u4F8B\uFF0C\u70B9\u51FB\u201C\u67E5\u627E\u771F\u5B9E\u5730\u70B9\u201D\u5F00\u59CB\u3002";
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const current = revision;
      const buttons2 = [...form.querySelectorAll("button")];
      buttons2.forEach((b) => b.disabled = true);
      status.dataset.state = "loading";
      status.textContent = "\u6B63\u5728\u5BFB\u627E\u5408\u9002\u7684\u5730\u70B9\uFF0C\u5E76\u6838\u5BF9\u5730\u56FE\u6765\u6E90\u2026";
      result.setAttribute("aria-busy", "true");
      result.innerHTML = '<div class="map-loading" aria-hidden="true">' + Array.from({ length: 3 }, () => '<div class="map-skeleton"><i></i><i></i><i></i></div>').join("") + "</div>";
      try {
        const d = await runLifeAI("maps", Object.fromEntries(new FormData(form)));
        if (current !== revision) {
          status.textContent = "\u9700\u6C42\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u67E5\u8BE2\u3002";
          return;
        }
        if (!d.sources?.length) throw Error("\u672A\u8FD4\u56DE\u53EF\u9A8C\u8BC1\u5730\u70B9\u6765\u6E90\u3002");
        const city = form.elements.city.value, blocks = String(d.answer || "").split(/\n\s*\n/);
        result.innerHTML = `<div class="map-result-heading"><div><span class="map-eyebrow">YOUR SHORTLIST</span><h3>\u8FD9\u4E9B\u5730\u65B9\uFF0C\u53EF\u4EE5\u53BB\u770B\u770B <span>${d.sources.length}</span></h3></div><span class="map-source-tag" translate="no">Google Maps</span></div><div class="life-ai-sources map-place-grid">${d.sources.map((s, i) => {
          const name = s.name.replace(/\s*[-–—]\s*Google Maps\s*$/i, ""), block = blocks.find((b) => b.startsWith(`${i + 1}. ${s.name}
`)), summary2 = block ? block.slice(block.indexOf("\n") + 1) : "\u6253\u5F00\u5730\u56FE\u8BE6\u60C5\uFF0C\u4E86\u89E3\u8FD9\u4E2A\u5730\u70B9\u3002";
          const navigation = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent("Juanita, Kirkland WA") + "&destination=" + encodeURIComponent(name + ", " + city + " WA") + (s.placeId ? "&destination_place_id=" + encodeURIComponent(s.placeId) : "");
          return `<article class="map-place-card"><div class="map-place-top"><span class="map-place-number">${String(i + 1).padStart(2, "0")}</span><span class="map-place-area">${esc(city)} \xB7 \u5468\u8FB9\u63A2\u7D22</span>${pin}</div><h4 translate="no">${esc(name)}</h4><p class="map-place-summary">${esc(summary2)}</p><footer><a class="map-place-source" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(name)} \xB7 \u5730\u56FE\u8BE6\u60C5">\u5730\u56FE\u8BE6\u60C5 <span aria-hidden="true">\u2197</span></a><a class="map-place-navigate" href="${esc(navigation)}" target="_blank" rel="noopener" aria-label="\u5BFC\u822A\u5230 ${esc(name)}">${arrow}\u5BFC\u822A</a></footer></article>`;
        }).join("")}</div><div class="map-result-footer"><span>\u5730\u70B9\u6765\u6E90\uFF1A<span translate="no">Google Maps</span> \xB7 AI \u7406\u7531\u4F9B\u53C2\u8003</span><button data-ai-copy>\u590D\u5236\u7ED3\u679C\u4E0E\u6765\u6E90</button></div><details class="map-call-details"><summary>\u672C\u6B21\u67E5\u8BE2\u8BE6\u60C5 \xB7 ${(d.latencyMs / 1e3).toFixed(1)} \u79D2</summary><p>${esc(metadata(d))}</p><p>\u4E2D\u6587\u67E5\u8BE2\u6700\u591A\u4F7F\u7528 3 \u6B21\u6A21\u578B\u8C03\u7528\uFF0C\u9875\u9762\u6253\u5F00\u548C\u5237\u65B0\u4E0D\u4F1A\u81EA\u52A8\u8C03\u7528\u3002</p></details>`;
        status.dataset.state = "success";
        status.textContent = `\u627E\u5230 ${d.sources.length} \u4E2A\u6709\u5730\u56FE\u6765\u6E90\u7684\u5730\u70B9\u3002`;
        result.querySelector("[data-ai-copy]").onclick = () => copy(d.answer + "\n\nGoogle Maps\n" + d.sources.map((s) => s.name + " " + s.url).join("\n"));
      } catch (err) {
        result.replaceChildren();
        status.dataset.state = "error";
        status.textContent = err.message;
      } finally {
        result.removeAttribute("aria-busy");
        buttons2.forEach((b) => b.disabled = false);
      }
    };
  }
  var mapHost = document.querySelector("[data-life-ai-maps]");
  if (mapHost) mountMapsAI(mapHost, mapHost.dataset.lifeAiMaps === "restaurants");

  // apps/_decision/life.js
  var host = document.querySelector('[data-decision="weekend"], [data-decision="meal"]');
  var mode = host?.dataset.decision;
  var cityChoices = [["", "\u5168\u90E8\u5730\u533A"], ...["Kirkland", "Bellevue", "Redmond", "Lynnwood", "Everett", "Kent", "Seattle"].map((x) => [x, x])];
  var events = { events: [] };
  var options = [];
  var batch = 0;
  var saved = () => {
    const value = read(mode === "meal" ? "meal-plans" : "weekend-plans");
    return Array.isArray(value) ? value.filter((p) => p && typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string") : [];
  };
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
    $("#life-backup", host).replaceChildren();
    backupBar($("#life-backup", host), [mode === "meal" ? "meal-plans" : "weekend-plans"], (_, v) => v.every((p) => typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string" && typeof p.summary === "string"));
  }
  var recipeLibrary = [];
  var recipeSnapshot = null;
  var recipeLoad = null;
  async function loadMealLibrary() {
    if (recipeLoad) return recipeLoad;
    mealStatus("\u6B63\u5728\u8BFB\u53D6\u5B8C\u6574\u83DC\u8C31\u5E93\u2026");
    recipeLoad = json("apps/meal-orbit/data/recipes.json").then((snapshot) => {
      recipeLibrary = prepareRecipes(snapshot);
      recipeSnapshot = snapshot;
      $("#meal-plan-form button[type=submit]", host).disabled = false;
      generateMeals(mealPreferences(data($("#meal-plan-form", host))));
    }).catch((e) => {
      mealStatus("\u83DC\u8C31\u5E93\u8BFB\u53D6\u5931\u8D25\uFF1A" + e.message + "\u3002\u8BF7\u70B9\u51FB\u201C\u91CD\u65B0\u8BFB\u53D6\u83DC\u8C31\u5E93\u201D\u3002");
    }).finally(() => {
      recipeLoad = null;
    });
    return recipeLoad;
  }
  function renderMeal() {
    const pref = mealPreferences(read("meal-preferences", {}));
    host.innerHTML = `<div class="d-panel"><div class="d-kicker">Dinner, decided</div><h2>\u4ECA\u665A\u83DC\u5355 \xB7 \u6309\u4F60\u7684\u98DF\u6750\u9009</h2><p class="d-muted">\u4F7F\u7528\u300C\u627E\u98DF\u8C31\u300D\u540C\u4E00\u4EFD HowToCook \u5B8C\u6574\u6570\u636E\u5E93\uFF0C\u4F18\u5148\u63A8\u8350\u7528\u5230\u4F60\u6240\u586B\u98DF\u6750\u7684\u83DC\u3002\u53EF\u4FDD\u5B58\u591A\u9053\u7EC4\u6210\u4ECA\u665A\u83DC\u5355\uFF1B\u7528\u65F6\u4E0E\u505A\u6CD5\u6765\u81EA\u539F\u83DC\u8C31\u3002</p><form id="meal-plan-form" class="d-form">${select("minutes", "\u53EF\u7528\u65F6\u95F4", [["20", "20 \u5206\u949F"], ["30", "30 \u5206\u949F"], ["45", "45 \u5206\u949F"], ["60", "60 \u5206\u949F"], ["90", "90 \u5206\u949F"], ["120", "120 \u5206\u949F"], ["any", "\u4E0D\u9650\u65F6\u95F4"]], pref.minutes)}${select("people", "\u7528\u9910\u4EBA\u6570", [["1", "1 \u4EBA"], ["2", "2 \u4EBA"], ["3", "3 \u4EBA"], ["4", "4 \u4EBA"]], pref.people)}${select("equipment", "\u5668\u6750", [["all", "\u9505\uFF0B\u5FAE\u6CE2\u7089\uFF0B\u7A7A\u6C14\u70B8\u9505"], ["pot", "\u53EA\u6709\u9505"], ["microwave", "\u53EA\u6709\u5FAE\u6CE2\u7089"], ["airfryer", "\u53EA\u6709\u7A7A\u6C14\u70B8\u9505"], ["any", "\u4E0D\u9650\u5668\u6750"]], pref.equipment)}${select("category", "\u60F3\u505A\u4EC0\u4E48", [["dinner", "\u665A\u9910\u83DC\u80B4\u4E0E\u4E3B\u98DF"], ["all", "\u5168\u90E8\u83DC\u8C31"], ["meat_dish", "\u8364\u83DC"], ["vegetable_dish", "\u7D20\u83DC"], ["aquatic", "\u6C34\u4EA7"], ["staple", "\u4E3B\u98DF"], ["soup", "\u6C64"], ["breakfast", "\u65E9\u9910"], ["dessert", "\u751C\u70B9"], ["drink", "\u996E\u54C1"], ["semi-finished", "\u534A\u6210\u54C1"], ["condiment", "\u9171\u6599"]], pref.category)}${field("exclude", "\u4E0D\u5403\u7684\u98DF\u6750", "text", pref.exclude, 'maxlength="200" placeholder="\u4F8B\u5982\uFF1A\u867E\u3001\u9E21\u86CB\u3001\u725B\u5976"')}${field("pantry", "\u4F18\u5148\u7528\u6389\u7684\u98DF\u6750", "text", pref.pantry, 'maxlength="200" placeholder="\u4F8B\u5982\uFF1A\u725B\u8089 \u571F\u8C46\uFF0C\u652F\u6301\u7A7A\u683C\u6216\u9017\u53F7"')}<div class="d-actions"><button type="submit" class="d-primary" disabled>\u751F\u6210\u4ECA\u665A\u83DC\u5355</button><button id="meal-more" type="button" disabled>\u6362\u4E00\u7EC4</button></div></form><p id="meal-status" class="d-note" role="status" aria-live="polite"></p><p id="meal-library" class="d-muted"></p><div id="meal-options"></div><button id="meal-reload" type="button">\u91CD\u65B0\u8BFB\u53D6\u83DC\u8C31\u5E93</button><div id="life-history">${history2()}</div><div id="life-backup"></div></div>`;
    const form = $("#meal-plan-form", host);
    form.oninput = () => {
      $("#meal-options", host).hidden = true;
      $("#meal-more", host).disabled = true;
      mealStatus("\u6761\u4EF6\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u70B9\u51FB\u201C\u751F\u6210\u4ECA\u665A\u83DC\u5355\u201D\uFF0C\u6309\u65B0\u6761\u4EF6\u91CD\u65B0\u63A8\u8350\u3002");
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const p = mealPreferences(data(form)), key = JSON.stringify(p);
      const stored = save("meal-preferences", p);
      generateMeals(p, { next: key === mealKey });
      if (!stored) mealStatus($("#meal-status", host).textContent + " \xB7 \u504F\u597D\u672A\u80FD\u4FDD\u5B58\u5230\u672C\u673A");
    };
    $("#meal-more", host).onclick = () => generateMeals(mealPreferences(data(form)), { next: true });
    mountMealAI(host, () => ({ recipes: recipeLibrary, preferences: mealPreferences(data(form)), recent: saved().slice(-3).map((p) => p.title) }));
    $("#meal-reload", host).onclick = loadMealLibrary;
    bindHistory();
    if (recipeLibrary.length) {
      $("#meal-plan-form button[type=submit]", host).disabled = false;
      generateMeals(pref);
    } else loadMealLibrary();
  }
  var mealResult = null;
  var mealKey = "";
  function generateMeals(p, { next = false } = {}) {
    const offset = next && mealResult ? mealResult.offset + 3 : 0;
    if (!recipeLibrary.length) return;
    mealResult = planMeals(recipeLibrary, p, { offset, recent: saved().slice(-3).map((x) => x.title) });
    mealKey = JSON.stringify(p);
    options = mealResult.options;
    const { total, pantry, exclude, unavailable, unknownExclusions } = mealResult;
    const equipment = { all: "\u9505\uFF0B\u5FAE\u6CE2\u7089\uFF0B\u7A7A\u6C14\u70B8\u9505", pot: "\u53EA\u6709\u9505", microwave: "\u53EA\u6709\u5FAE\u6CE2\u7089", airfryer: "\u53EA\u6709\u7A7A\u6C14\u70B8\u9505", any: "\u4E0D\u9650\u5668\u6750" }[p.equipment];
    const notes = [`\u5DF2\u6309 ${p.minutes === "any" ? "\u4E0D\u9650\u65F6\u95F4" : p.minutes + " \u5206\u949F\u5185"} \xB7 ${p.people} \u4EBA\u4EFD \xB7 ${equipment} \u63A8\u8350`, `\u7B26\u5408\u6761\u4EF6 ${total} \u4E2A\uFF0C\u5C55\u793A ${options.length} \u4E2A`];
    if (pantry.length) notes.push("\u4F18\u5148\u98DF\u6750\uFF1A" + pantry.join("\u3001"));
    if (exclude.length) notes.push("\u6392\u9664\uFF1A" + exclude.join("\u3001"));
    if (unavailable.length) notes.push("\u5F53\u524D\u6761\u4EF6\u4E0B\u672A\u5339\u914D\u5230\uFF1A" + unavailable.join("\u3001"));
    if (unknownExclusions.length) notes.push("\u65E0\u6CD5\u8BC6\u522B\u5FCC\u53E3\uFF1A" + unknownExclusions.join("\u3001") + "\uFF0C\u8BF7\u6362\u6210\u5177\u4F53\u98DF\u6750\u540D\u540E\u91CD\u8BD5");
    if (total > 0 && total <= 3) notes.push("\u5DF2\u5C55\u793A\u5168\u90E8\u53EF\u9009\u83DC\u5355\uFF1B\u53EF\u653E\u5BBD\u6761\u4EF6\u589E\u52A0\u9009\u62E9");
    if (next && total > 3) notes.push("\u5DF2\u6362\u4E00\u7EC4");
    mealStatus(notes.join("\u3002"));
    $("#meal-library", host).textContent = `\u5B8C\u6574\u83DC\u8C31\u5E93 ${recipeLibrary.length} \u7BC7 \xB7 \u4E0A\u6E38\u66F4\u65B0 ${stamp(recipeSnapshot.updatedAt)} \xB7 \u7528\u65F6\u6309\u539F\u6587\u6982\u8FF0\u7B5B\u9009\uFF0C\u5668\u6750\u6309\u539F\u6587\u8BC6\u522B\uFF1B\u672A\u6807\u6CE8\u7528\u65F6\u7684\u83DC\u8C31\u4EC5\u5728\u201C\u4E0D\u9650\u65F6\u95F4\u201D\u51FA\u73B0\u3002`;
    $("#meal-more", host).disabled = total <= 3;
    const target = $("#meal-options", host);
    target.hidden = false;
    target.innerHTML = options.length ? `<div class="d-grid">${options.map((m, i) => `<article class="d-inset" data-meal-id="${esc(m.id)}"><span class="d-pill">${m.minutes !== null ? "\u539F\u6587\u7EA6 " + m.minutes + " \u5206\u949F" : "\u539F\u6587\u672A\u6807\u7528\u65F6"} \xB7 \u8BA1\u5212 ${m.people} \u4EBA \xB7 ${esc(m.categoryName)}</span><h3>${esc(m.name)}</h3><p class="d-muted">\u5668\u6750\uFF1A${esc(m.equipment.join("\uFF0B") || "\u539F\u6587\u672A\u63D0\u5230\u4E13\u7528\u52A0\u70ED\u8BBE\u5907")}${m.advance ? " \xB7 \u9700\u63D0\u524D\u814C\u5236\uFF0F\u51C6\u5907" : ""}</p>${m.matched.length ? `<p class="d-note">\u7528\u5230\u4F60\u586B\u5199\u7684\uFF1A${esc(m.matched.join("\u3001"))}</p>` : ""}<details open><summary>\u98DF\u6750\u4E0E\u5DE5\u5177</summary><pre>${esc(m.ingredientsText || "\u8BF7\u67E5\u770B\u539F\u83DC\u8C31")}</pre></details><details><summary>\u7528\u91CF \xB7 \u8BA1\u5212 ${m.people} \u4EBA</summary><p class="d-muted">${esc(m.amounts.note)}</p><pre>${esc(m.amounts.text)}</pre></details><details><summary>\u5B8C\u6574\u505A\u6CD5\u4E0E\u6CE8\u610F\u4E8B\u9879</summary><pre>${esc(m.md)}</pre></details><p>${link(m.source, "HowToCook \u539F\u83DC\u8C31")}</p><div class="d-actions"><button class="d-primary" data-meal-pick="${i}">\u4ECA\u665A\u5C31\u5403\u8FD9\u4E2A</button><button data-meal-copy="${i}">\u590D\u5236\u6E05\u5355</button></div></article>`).join("")}</div>` : `<div class="d-empty">${unknownExclusions.length ? "\u65E0\u6CD5\u8BC6\u522B\u8FD9\u4E9B\u5FCC\u53E3\uFF0C\u8BF7\u4F7F\u7528\u5177\u4F53\u98DF\u6750\u540D\u3002" : pantry.length ? "\u5F53\u524D\u6761\u4EF6\u4E0B\u6CA1\u6709\u80FD\u7528\u5230\u6240\u586B\u98DF\u6750\u7684\u83DC\u8C31\u3002\u53EF\u4EE5\u589E\u52A0\u65F6\u95F4\u3001\u66F4\u6362\u5668\u6750\u6216\u9009\u62E9\u201C\u5168\u90E8\u83DC\u8C31\u201D\uFF1B\u4E0D\u4F1A\u7528\u4E0D\u76F8\u5173\u83DC\u5355\u4EE3\u66FF\u3002" : "\u6CA1\u6709\u6EE1\u8DB3\u6761\u4EF6\u7684\u83DC\u8C31\uFF0C\u8BF7\u8C03\u6574\u65F6\u95F4\u3001\u5668\u6750\u3001\u7C7B\u522B\u6216\u5FCC\u53E3\u3002"}</div>`;
    host.querySelectorAll("[data-meal-pick]").forEach((b) => b.onclick = () => {
      const m = options[Number(b.dataset.mealPick)], plan = { id: id(), title: m.name, summary: `\u8BA1\u5212 ${m.people} \u4EBA \xB7 ${m.minutes !== null ? "\u539F\u6587\u7EA6 " + m.minutes + " \u5206\u949F" : "\u7528\u65F6\u672A\u6807\u6CE8"}`, at: (/* @__PURE__ */ new Date()).toISOString(), text: mealText(m) };
      if (save("meal-plans", [...saved(), plan].slice(-100))) {
        $("#life-history", host).innerHTML = history2();
        bindHistory();
        b.disabled = true;
        b.textContent = "\u5DF2\u9009\u4E3A\u4ECA\u665A\u83DC\u5355";
        mealStatus("\u5DF2\u4FDD\u5B58\uFF1A" + m.name + "\u3002\u53EF\u5728\u201C\u5DF2\u9009\u5B89\u6392\u201D\u67E5\u770B\u3002");
        toast("\u5DF2\u4FDD\u5B58\u4ECA\u665A\u83DC\u5355");
      } else mealStatus("\u4FDD\u5B58\u5931\u8D25\uFF1A\u672C\u673A\u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5148\u590D\u5236\u6E05\u5355\u3002");
    });
    host.querySelectorAll("[data-meal-copy]").forEach((b) => b.onclick = () => copy(mealText(options[Number(b.dataset.mealCopy)])));
  }
  function mealText(m) {
    return `${m.name}
\u8BA1\u5212 ${m.people} \u4EBA \xB7 ${m.minutes !== null ? "\u539F\u6587\u7EA6 " + m.minutes + " \u5206\u949F" : "\u539F\u6587\u672A\u6807\u6CE8\u7528\u65F6"}
${m.amounts.note}

\u98DF\u6750\u4E0E\u5DE5\u5177\uFF1A
${m.ingredientsText}

\u7528\u91CF\uFF1A
${m.amounts.text}

\u505A\u6CD5\uFF1A
${m.stepsText}

\u6765\u6E90\uFF1A${m.source}

\u5B8C\u6574\u539F\u6587\uFF1A
${m.md}`;
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
      let duration2 = 60;
      if (e.end?.slice(0, 10) === e.start.slice(0, 10) && e.end.length >= 16) {
        duration2 = Math.max(60, Math.min(90, Number(e.end.slice(11, 13)) * 60 + Number(e.end.slice(14, 16)) - start));
      }
      const finish = start + duration2;
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
  var investmentData = null;
  var tab = "";
  var symbol = params.get("symbol") || raw("ptu.workspace.symbol", "NVDA");
  if (!/^[A-Z0-9.^-]{1,20}$/.test(symbol)) symbol = "NVDA";
  if (investment && !params.has("symbol") && read("holdings").length && !read("holdings").some((h) => h.symbol === symbol)) symbol = read("holdings")[0].symbol;
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
    if (d.type === "investment-refresh" && investment) dispatchEvent(new Event("investment-refresh"));
    if (d.type === "ready") {
      if (investmentData) send(x.frame, "investment-data", investmentData);
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
  addEventListener("investment-data", (e) => {
    investmentData = e.detail;
    for (const x of frames.values()) send(x.frame, "investment-data", investmentData);
  });
  activate(params.get("tab") || (investment ? "review" : "weekend"));
  addEventListener("investment-select", (e) => {
    if (!investment) return;
    setSymbol(e.detail.symbol);
    activate(e.detail.tab || "review");
  });
  addEventListener("decision-change", (e) => {
    if (!investment) return;
    if (e.detail.key === "holdings" && read("holdings").length && !read("holdings").some((h) => h.symbol === symbol)) setSymbol(read("holdings")[0].symbol);
    document.querySelector("#ws-symbols").innerHTML = [.../* @__PURE__ */ new Set([...read("holdings").map((h) => h.symbol), ...raw("stock_alert_watchlist_v1").map((h) => h.symbol)])].map((s) => '<option value="' + esc(s) + '">').join("");
    for (const x of frames.values()) send(x.frame, "records", { key: e.detail.key });
  });
  buttons.forEach((b) => b.disabled = false);
  document.body.dataset.workspaceReady = "true";
  document.querySelector("#workspace-boot")?.remove();
  dispatchEvent(new Event("workspace-ready"));
  if (parent !== window) parent.postMessage({ channel: "pt-nexus-tool", type: "ready" }, location.origin);
})();
