import { createRoot } from "react-dom/client";
import { DealBoard } from "./components/deal-board";
import type { BoardState } from "./lib/types";

const initial: BoardState = {
  generatedAt: 0,
  lastUpdatedAt: null,
  lastUpdatedLabel: null,
  nextRefreshAt: null,
  nextRefreshLabel: null,
  sourceHealth: { ok: 0, total: 0 },
  activeCount: 0,
  newCount: 0,
  refreshInProgress: false,
  roundStatus: null,
  failures: [],
  sources: [],
  deals: [],
};

const params = new URLSearchParams(location.search);
const nexusUrl = new URL("../daily-nexus/", location.href).href;
const embedded = params.get("embedded") === "nexus" && window.parent !== window && document.referrer.startsWith(nexusUrl);

createRoot(document.getElementById("deal-radar")!).render(<DealBoard initial={initial} publicFeed={{
  url: "https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-radar/latest",
  homeUrl: "../../",
  managementUrl: "https://pt-vps-tools.h1nano.chatgpt.site/deal-radar/",
  embedded,
}} />);
