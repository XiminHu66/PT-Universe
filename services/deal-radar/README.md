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


## 大促追踪

在 PT Universe 的优惠雷达打开「大促追踪」（`/apps/deal-radar/#promotion`）。点击「手动刷新」才获取优惠和勾选的商品报价，进度按已完成的来源和商品计算，失败保留上次成功的内容和时间。来源读取与普通优惠雷达的任务独立。查询更多商家会打开 Deal Lab，由用户提交搜索。

活动设置支持名称、起止日期、来源和关键词。在「复制为新活动」中填写新名称和日期即可复用来源和关键词，历史结果、追踪清单和报价留在原活动。Slickdeals 和北美省钱快报是通用来源，Best Buy 和 Costco 选择的是黑五活动页。

追踪清单支持原 Amazon 黑五表的首个工作表，以及首行含 `title`、`url` 和可选 `target` 的 Excel。历史报价作为参考价。清单、设置、进度结果中的成功快照存在当前浏览器。单轮最多勾选 10 个商品核价，请先连接现有 PT 私有后台。公开商家报价仅接受单一美元报价，有货才触发站内到价状态。无法读取的商品可以打开原页核对后手动记价，Amazon 直达商品也提供 Keepa 入口。

大促通过现有 Worker 提供手动 API：活动源每个最多 36 次/UTC 日，商品端点合计 40 次/UTC 日。服务器不保存个人清单，页面打开、切换活动和搜索当前优惠均不采集。新增活动源时更新 `src/lib/promotion.ts` 和 Worker 的对应解析器。
