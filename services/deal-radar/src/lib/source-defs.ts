export type SourceDef = {
  id: string;
  name: string;
  url: string;
  /** Item links must stay on the source's own domain: feed content is untrusted input. */
  allowedHosts: string[];
};

/**
 * Fixed sources. Callers cannot substitute URLs.
 * LINUX DO must go through the Jina reader. Direct category RSS is not used.
 * 异次元 is requested at the URL that 301-redirects; the client follows it.
 */
export const SOURCE_DEFS: SourceDef[] = [
  {
    id: "linuxdo",
    name: "LINUX DO福利羊毛",
    url: "https://r.jina.ai/https://linux.do/c/welfare/36.rss",
    allowedHosts: ["linux.do"],
  },
  {
    id: "epic",
    name: "Epic 官方 · 国区",
    url: "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN&allowCountries=CN",
    allowedHosts: ["store.epicgames.com"],
  },
  {
    id: "appinn",
    name: "小众软件",
    url: "https://www.appinn.com/feed/",
    allowedHosts: ["appinn.com"],
  },
  {
    id: "iplaysoft",
    name: "异次元软件世界",
    url: "https://www.iplaysoft.com/feed",
    allowedHosts: ["iplaysoft.com"],
  },
  {
    id: "slickdeals",
    name: "Slickdeals · 美国",
    url: "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1",
    allowedHosts: ["slickdeals.net"],
  },
];

export function sourceName(id: string): string {
  return SOURCE_DEFS.find((source) => source.id === id)?.name ?? id;
}
