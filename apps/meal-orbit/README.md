# Food Orbit · 共享完整菜谱库

「找食谱」与 Daily Nexus／Life Desk 的「今晚菜单」共用 `data/recipes.json`，包含 HowToCook `dishes/` 下的全部实际菜谱，排除模板／README。不再以六个固定菜单代替库内搜索。

- 原菜谱全文、路径、上游提交及许可随快照保存；不需要浏览器逐篇调用 GitHub API。
- 今晚菜单按原料、时间、器材、类别筛选，支持常见食材别名及换一组。无匹配直接说明。
- 用时取自原文概述；缺失用时仅在不限时间时出现。工具按原文识别。
- 只对有明确人数基准的原文用量做比例折算；未知基准和复杂公式保留原文。
- 每次站点部署从上游重新同步。上游不可用时保留已验证快照，不换成示例菜谱。
- 手动生成：`python scripts/decision/sync-recipes.py /path/to/HowToCook`；只需源仓库的 Markdown 与 LICENSE。

源：<https://github.com/Anduin2017/HowToCook>，Unlicense（见 `data/HOWTOCOOK-LICENSE.txt`）。

# Food Orbit v4.1

纯静态单页版，可直接部署到 GitHub Pages。

## v4.1：手机端 App 跳转

- 手机端外部链接不再强制新开浏览器标签页，而是使用同页导航，让 iOS Universal Links / Android App Links 有机会直接交给已安装的 App。
- Google Maps 继续使用官方 `https://www.google.com/maps/...` Universal Maps URL：安装 Google Maps 时优先进入 App，否则进入网页。
- Yelp 使用原始 Yelp HTTPS 链接并在手机端同页打开，由系统 / Yelp 的 App Link 处理；无法接管时正常落到移动网页。
- 小红书使用官方 `xhsdiscover://search/result?keyword=...` Deeplink；若 App 未接管，约 1.1 秒后回退到对应网页搜索。
- 下厨房、爱料理 LIVE 入口改为手机端同页 HTTPS 导航，避免 `target=_blank` 阻断可能存在的 Universal Link。
- 收藏里的 Google Maps 餐厅链接、随机探店按钮也统一走 Smart Link 逻辑。
- 桌面端仍保持新标签页打开，不改变原来的桌面使用习惯。

## v4：手机端适配

- 桌面端继续使用左侧固定导航。
- ≤760px 自动切换为底部 4 Tab 导航，更适合单手操作。
- 顶部保留当前页面标题，主题 / 设置按钮固定在右上角。
- 支持 `viewport-fit=cover` 与 iPhone safe-area，避开刘海、Dynamic Island 和 Home Indicator。
- 输入框在手机端使用 16px 字号，避免 iOS Safari 聚焦时自动放大。
- 转盘按屏幕宽度自适应，320px 宽的小屏也不会横向溢出。
- 餐厅雷达改成单列触控布局。
- 食谱分类按钮和 LIVE 来源支持横向滑动。
- 设置 / 菜谱详情在手机端显示为底部 Sheet。

## 部署

将 `index.html` 放到 GitHub Pages 仓库根目录即可。无需 npm、构建步骤或后端。

如果替换旧版本，只需要覆盖仓库中的 `index.html`。

## Gemini 配餐与地图试验（2026-10-07）

- Life Desk / Daily Nexus 今晚菜单新增 AI 配餐：先用完整菜谱库筛选时间、食材、忌口、器材，再发送至多 18 个候选，只接受候选 ID 中的 1–3 道菜。
- 餐厅雷达与活动地图新增按需 Google Maps 地点查询。使用英文查询，中文输入/输出分别翻译，最多 3 次调用；每次答案保留 Google Maps 来源与英文原答，无来源直接报错。
- 不随页面打开、刷新或定时任务调用 Gemini。配餐一次 1 次调用。页面记录模型、用量、耗时；失败保留原有静态工具。
- API Key 只使用 Worker 的 `GEMINI_API_KEY` Secret。前端沿用 PT 同步凭据或已有后台连接，不接受浏览器传入模型或 Key。
- 应用试验上限：全局每日 80 次、账号每日 30 次、每分钟 6 次上游调用预算，按洛杉矶日期计算。地图预留 3 次；预算拒绝也可能保守消耗此前预留。
- 部署提交含 `[life-ai-test]` 时做固定公开菜谱/地点 smoke test，使用临时过期诊断凭据；结果在 Actions 的 `life-ai-probe` artifact。只测选定 Flash 模型，不配置账单、不自动升级计费。测试成功的模型记录在 KV `life-ai:models`；没有可用 Maps 配额时页面明确报错。
- Maps Grounding 与地图渲染、Places/Routes API 是不同服务。本次保留现有 Leaflet / OSM 地图；不将 LLM 猜测坐标投成精确点，不提供实时车程或实时活动信息。
