# 按需数据更新

2026-10-29：按所有者选择，以下数据不再无人值守采集。网页不会调用 GitHub Actions。

| 数据 | 打开/进入视图 | 手动刷新 | 常规缓存 |
| --- | --- | --- | --- |
| 3C Scout | 页面打开时检查 | 刷新商品 | 1 小时 |
| 公开投资披露 | 进入公开交易核验时检查 | 刷新披露 | 1 小时 |
| 财报与投资论点 | 打开/切换当前公司 | 刷新当前公司财报 | 4 小时 |
| Earnings Dojo 财报 | 打开时核对一家练习公司 | 刷新财报并换题 | 每公司 4 小时 |
| 兴趣话题 | 打开话题视图 | 刷新 | 30 分钟 |
| 完结作品库 | 打开发现视图 | 刷新 | 2 小时 |
| Kenney 素材目录 | 进入素材库 | 刷新目录 | 24 小时 |
| Stock Alert | 打开/切换当前股票 | 刷新 | 每股票 5 分钟 |

手动刷新可以跳过常规缓存，但 60 秒内的重复请求合并。上游可能限流或返回延迟数据；最近核对时间不等于交易时间或财报季度。失败保留最后成功数据和原时间，部分来源失败单独标记。Stock Alert 不再定时轮询；关闭页面后不抓取，也不会在后台检查价格提醒。

3C、披露、Stock Alert：浏览器 → Cloudflare 固定公开接口 → 既有服务端签名传输 → VPS 单任务采集器。复用原 Python 解析和金融计算。财报与三个目录仍由 Cloudflare 按请求获取，目录从 `hubTick` 移除。无新公网端口、浏览器采集服务、VPS cron 或 timer。

VPS：最多同时运行 1 个采集进程；3C/披露/股票最长分别 240/300/150 秒，超时杀死进程；内存上限 1.5 GiB、CPU 上限 0.75 核、临时文件 384 MiB、公开缓存最多 128 MiB/256 个键。每天最多 12 次 3C、12 次披露、160 次股票采集。预算持久化，重启不清零；忙碌时保留缓存并提示稍后刷新。部署前须保留至少 15% 磁盘和内存。

应急：`refresh-3c.yml`、`refresh-investment.yml`、`refresh-stock.yml` 仅 `workflow_dispatch`；`refresh-labs.yml` 的 financials 只允许手动选中，定时/普通 push 保留 events/upcoming。Pages 与 Worker 部署仍随源码变更发布，属于部署而非周期采集。

未选中的 Tsugi 小说/漫画、音乐、游戏，RSS Orbit，活动/即将发生，Anime1、放送日历、Media Vault 和同步功能保持各自原有策略。

开发验证：

```bash
python .github/scripts/actions_policy.py .
python -m unittest discover -s services/on-demand-data -p 'test_*.py'
node services/on-demand-data/gateway.test.mjs
python -m unittest discover -s scripts/labs -p 'test_*.py'
cd workers/pt-universe-api
npm run check
node tests/on-demand-data.test.mjs
```

浏览器流程测试：在仓库根目录运行 `node services/on-demand-data/browser-test.cjs`，已安装 Chromium 时可用 `PT_CHROME` 指定路径。测试验证页面打开、强制刷新、结果应用、失败保留旧数据及闲置不轮询；上游为固定 fixture，不能代替部署后的真实来源验证。

VPS 部署由私有运维仓库的手动部署工作流选择已测试的公开提交；复制当前在线网关后仅增加固定公开数据路由，保留既有网关功能，失败恢复旧配置。更新采集器后需明确部署对应版本，不会因开发 push 自行采集。
