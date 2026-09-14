# PT Universe

Personal Tools OS for the XiminHu66 GitHub Pages ecosystem.

Live site: https://ximinhu66.github.io/PT-Universe/

## Integrated modules

- Daily Nexus — calendar, notes, discovery, music, focus and micro tools
- DeskBoard — stocks, weather, breaking news, RSS and quick links
- RSS Orbit — Chinese-first RSS inbox, unread state, read later and OPML migration; refreshed every four hours from 08:00 PT
- Stock Alert — market data, options activity, technical model and alerts
- QF Tool — investing, rewards, deals, side-income and decision journal
- 3C Scout — Chinese-first product, deal and discovery feeds
- Food Orbit — meal wheel, restaurant discovery and Chinese recipes
- Tsugi — manga, novels, Japanese music, game releases and ACG news

PT Universe is a local-first monorepo. Favorites, recent apps, quick notes, countdown and theme are stored in the browser. All twelve tools are vendored below `apps/`, so navigation and static assets stay inside this repository and do not depend on the original Pages sites.

```text
apps/
  daily-nexus/
  deskboard/
  rss-dashboard/
  stock-alert/
  qf-tool/
  3c-scout/
  meal-orbit/
  tsugi-checker/
```

## Add another tool

Add one item to `APPS` in `app.js`. Navigation, search, category views, favorites and the source map are generated automatically.

## Deployment

The included `Deploy PT Universe` workflow publishes the repository root to GitHub Pages after every push to `main`.

## Research tools

- [Thesis Lab — 财报与投资论点](https://ximinhu66.github.io/PT-Universe/apps/thesis-lab/)
- [Earnings Dojo — 财报阅读训练](https://ximinhu66.github.io/PT-Universe/apps/earnings-dojo/)
- [Tsugi — PC 游戏比价搜索](https://ximinhu66.github.io/PT-Universe/apps/tsugi-checker/#pc-prices)
- [Weekend Atlas — 大西雅图活动地图](https://ximinhu66.github.io/PT-Universe/apps/eastside-weekend/)

Daily public snapshots refresh around 08:35 America/Los_Angeles. The refresh workflow deploys Pages and verifies the published routes. See [data sources and verification](scripts/labs/README.md).
