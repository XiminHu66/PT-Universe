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

## 红黑榜

- [红黑榜 · 我的点菜记录](https://ximinhu66.github.io/PT-Universe/apps/food-ledger/) — 独立移动端工具；菜馆与红黑榜菜品记录、地址导航、链接、评价和日期。
- 自动建立加密云端同步，复用 PT Universe 配对码；支持离线保存、JSON 备份合并与手机/电脑跨设备记录。未加入 Daily Nexus。
- 菜谱收集支持保存原始链接、食材、步骤及“会做”“回头菜”等标签；下厨房链接可尝试提取，小红书截图识别为可选操作。
- 独立“购物清单” tab：选择 1–20 道菜，合并同名食材及兼容单位的明确用量，保留“适量”和不同单位。单击标记已买，双击或点 × 删除，可撤销最后一次删除、复制待买清单。刷新、切换 tab 后可继续回看；一键清空重置材料和选菜状态，可撤销清空。重新生成会确认替换当前清单和已买标记。
- 购物清单独立保存在 `food-shopping.v1`，通过 `food-shopping` 范围加密同步，纳入 JSON 备份；支持离线修改后合并标记和删除记录，不改变原菜谱。
- 验证：`node scripts/food-ledger/shopping-model-test.mjs`、`node scripts/food-ledger/shopping-browser-test.cjs`（需 Playwright Chromium）、Worker 的 `npm run check` 和 `node tests/todo-sync.test.mjs`。线上检查需显式设置 `PT_LIVE=1`，仅创建独立诊断账户。
