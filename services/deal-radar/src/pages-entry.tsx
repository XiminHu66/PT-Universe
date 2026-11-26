import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DealBoard } from "./components/deal-board";
import { PromotionBoard } from "./components/promotion-board";
import { connect, connected } from "../../../apps/monitor-center/connection.mjs";
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

const publicFeed = {
  url: "https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-radar/latest",
  homeUrl: "../../",
  managementUrl: "https://pt-vps-tools.h1nano.chatgpt.site/deal-radar/",
};
const owner = {
  token: () => connected() ? sessionStorage.getItem("pt.monitor.session.v1") : null,
  connect: () => {
    sessionStorage.setItem("pt.deal-promo.return.v1", JSON.stringify({ expiresAt: Date.now() + 600_000 }));
    connect();
  },
};

function RadarViews() {
  const [promotion, setPromotion] = useState(() => location.hash === "#promotion");
  const [visitedPromotion, setVisitedPromotion] = useState(promotion);
  useEffect(() => {
    const update = () => {
      const selected = location.hash === "#promotion";
      setPromotion(selected);
      if (selected) setVisitedPromotion(true);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <>
    <nav className="radar-views" aria-label="优惠雷达">
      <a href="../../">PT Universe</a>
      <a href="#promotion" aria-current={promotion ? "page" : undefined}>大促追踪</a>
      <a href="#radar" aria-current={!promotion ? "page" : undefined}>全球优惠</a>
    </nav>
    {!promotion && <DealBoard initial={initial} publicFeed={publicFeed} />}
    {visitedPromotion && <div hidden={!promotion}><PromotionBoard owner={owner} /></div>}
  </>;
}

createRoot(document.getElementById("deal-radar")!).render(<RadarViews />);
