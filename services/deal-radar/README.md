# 全球优惠雷达

PT Universe 下的独立优惠看板，基于 [PerkRadar](https://github.com/luobinger/PerkRadar/tree/0e37fc94aa65e9fbee4b3c9b9c566a81fbc48e9f) 的 MIT 授权代码。原作者声明和第三方说明见 LICENSE 与 THIRD_PARTY_NOTICES.md。

## 来源和筛选

| 来源 | 用途 | 发布口径 |
| --- | --- | --- |
| Epic 官方 · 国区 | 正在进行的免费活动 | 官方商店零价和当前促销窗口均匹配时收录，保留活动结束时间，含本体及礼包 |
| 小众软件 | 软件限免与正版促销 | 保留原文，明确优惠信号进入默认列表 |
| 异次元软件世界 | 正版软件和会员折扣 | 允许订阅源跳转，保留原文 |
| LINUX DO | 福利版的社区线索 | 仅使用上游已有 Jina Reader 读取方式；失败可见 |
| Slickdeals · 美国 | 美国首页精选折扣 | 单轮最多接收 12 条有日期的帖子，保留原标题、金额和原文链接 |

归档分析使用 Global Deal Hunter 导出包的 167 条历史记录。新部署使用实时来源，未导入历史内容。NodeSeek 已从抓取和旧数据库的展示中移除。V2EX 推广、果核剥壳暂停使用。社区抽奖、明显已失效、代充、号池和 API 中转等标题会被剔除。普通内容归到默认隐藏的「其他」。来源失败保留尚未过期的已抓条目。

## 运行

VPS 上单容器部署，SQLite 持久化到容器 `/data`。定时器两小时一次，首次启动主动抓取。生产前缀为 `/deal-radar/`，通过现有 PT 工具中心授权入口代理，无需新增公网端口、抓取用 GitHub Actions、付费搜索或模型调用。免费来源的响应与优惠可领取性以原文和最新状态为准。

本地校验使用 Node 24，运行 `npm ci`、`npm test`、`npm run lint` 和 `DEAL_RADAR_BASE_PATH=/deal-radar npm run build`。临时真实抓取可用 `DATA_DIR="$(mktemp -d)" npm run report`。

PT Universe 的 `/apps/deal-radar/` 由同一个看板组件生成。Pages 工作流在静态分发目录中运行 `node services/deal-radar/scripts/build-pages.mjs`，浏览器只读 PT Universe Worker 的 `/api/deal-radar/latest`。该接口使用现有的签名 VPS 通道读取结果，公开标题、来源、原文链接和时间。原文摘要、详细诊断和手动抓取在私有工具入口使用。
