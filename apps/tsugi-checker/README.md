# Tsugi — ACG 追踪中心

Tsugi 是部署在 **GitHub Pages** 的静态 ACG dashboard。GitHub Actions 每日抓取公开数据并缓存为 JSON；浏览器负责展示、本机订阅和界面设置。

## 当前功能

- **更新流**：漫画柜、BiliNovel / Linovelib、CopyManga 等公开最新更新。
- **我的书架**：本机 LocalStorage 订阅 + `config/library.json` 云端深度追踪。
- **音乐追踪**：Billboard JAPAN Hot 100、近一周新曲、艺人关注、YouTube Music 入口。
- **游戏追踪**：
  - 手游：日本 App Store / Google Play + 国内 TapTap，经过数量与热度筛选。
  - PC：`scraper/steam_pc.py` 抓 Steam 热门新作 / 热门待发，`game_enrich.py` 补中文名、开发/发行商、类型与讨论度。
  - 主机：Famitsu 日本发售时间线。
- **ACG 新闻**：仅中文 / 繁中来源。
- **界面设置**：字号/缩放、密度、列数、主题图位置/透明度/模糊、明暗模式等，保存在浏览器本地。

## 目录

```text
index.html
styles.css
v5.css
app.js
games.css
games.js
ui-settings.css
ui-settings.js

config/
  content.json
  library.json
  library.example.json

data/
  feed.json
  feed.xml
  state.json
  site-updates.json
  acg-news.json
  music.json
  game-releases.json
  game-state.json

scraper/
  main.py
  run_games.py
  sources.py
  aggregators.py
  music.py
  games.py
  steam_pc.py
  game_enrich.py

.github/workflows/refresh-tsugi.yml
.github/workflows/refresh-tsugi-games.yml
```

## 调度

刷新任务已经拆分：

- Cloudflare 每日刷新漫画 / 小说、音乐与新闻，`.github/workflows/refresh-tsugi.yml` 只在数据过期时兜底；
- `.github/workflows/refresh-tsugi-games.yml` 每天 **08:00 America/Los_Angeles** 独立刷新游戏，自动适配 PST / PDT；
- 游戏任务写回 GitHub JSON、部署静态备用数据，并通知 Cloudflare 导入新快照；
- QF 是另一项目，暂停状态不影响 Tsugi 游戏更新。

PC 的稳定抓取链是：

```text
run_games.py
→ games.py
→ steam_pc.py
→ game_enrich.py
→ data/game-releases.json
```

`config/content.json` 不再保留已失效的 `featuredcategories` Steam legacy source。

## 书架

云端深度追踪编辑 `config/library.json`：

```json
{
  "items": [
    {
      "id": "my-title",
      "type": "manga",
      "source": "manhuagui",
      "title": "作品名",
      "url": "https://作品详情页",
      "enabled": true
    }
  ]
}
```

第一次成功抓取只建立 baseline；之后章节 / 话数变化才产生个人更新记录。

## 本地预览

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000`。

## 部署

GitHub → **Settings → Pages → Source → GitHub Actions**。

前端资源现在直接写在 `index.html` 中，不再由 workflow 临时修改 HTML，因此仓库源码与线上 Pages 结构一致。
