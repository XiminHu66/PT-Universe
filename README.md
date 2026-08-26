# PT Universe

Personal Tools OS for the XiminHu66 GitHub Pages ecosystem.

Live site: https://ximinhu66.github.io/PT-Universe/

## Integrated modules

- Daily Nexus — calendar, notes, discovery, music, focus and micro tools
- DeskBoard — stocks, weather, breaking news, RSS and quick links
- Stock Alert — market data, options activity, technical model and alerts
- QF Tool — investing, rewards, deals, side-income and decision journal
- 3C Scout — Chinese-first product, deal and discovery feeds
- Food Orbit — meal wheel, restaurant discovery and Chinese recipes
- Tsugi — manga, novels, Japanese music, game releases and ACG news

PT Universe is a local-first monorepo. Favorites, recent apps, quick notes, countdown and theme are stored in the browser. All seven tools are vendored below `apps/`, so navigation and static assets stay inside this repository and do not depend on the original Pages sites.

```text
apps/
  daily-nexus/
  deskboard/
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
