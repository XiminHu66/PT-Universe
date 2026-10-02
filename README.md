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

## Media Vault

- [Media Vault · 万能下载](https://ximinhu66.github.io/PT-Universe/apps/media-vault/) — 轻小说、各国/曲风音乐榜单与 FLAC 音源、动漫、BT 和视频解析。
- 每日 08:23 PT 起更新元数据，沿用 GitHub Pages + Cloudflare Worker。
- BT / yt-dlp / 整本 EPUB 需要连接自己的[下载引擎](services/media-engine/README.md)。源站阻挡会显示真实错误。

## Self Learning

- [Self Learning · 自学工作台](https://ximinhu66.github.io/PT-Universe/apps/self-learning/) — 原五门课程保持；新增嵌入式、独立产品、音频与摄影，共9门120章；中文讲义、互动实验、练习与完整参考资料。
- 金融课程延续此前16章顺序，历史教学至第4章；本机进度、回答和笔记可导出/导入迁移设备。
- 资料核对2026-10-02；详见 [课程维护与验证](apps/self-learning/README.md)。
