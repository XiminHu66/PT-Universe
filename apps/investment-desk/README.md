# 投资工作台

打开主页面 → 选择 Fidelity 等券商持仓 CSV → 核对预览与跳过行 → 确认更新持仓和观察列表。

- CSV 在浏览器中解析，不上传数量、成本或账户名。支持带引号的逗号、BOM、多账户合并、每股成本或总成本。仅支持 USD 多头股票 / ETF；现金、期权和空头跳过并解释原因。合并为默认；替换需要明确选择。成交后重新导入，不声称券商账户已连接。
- 自动行情接口只接收股票代码。Yahoo 延迟报价与一年日线缓存 5 分钟，公司标准化季度财报缓存 6 小时。页面打开及前台每 10 分钟核对，失败保留旧快照并显示失败与时间；超过新鲜度窗口暂停信号。
- 日线支撑阻力、均线、RSI、ATR 生成买入和减仓候选区间；完整买入候选还要求基本面条件通过。区间不是内在价值估值或保证成交价。没有投资期限与完整资产信息，不自动下单或生成仓位比例。
- 「公开交易核验」自动加载 Tracefour 公共披露快照（CC BY 4.0，页面保留归属链接）。默认 Pelosi、Khanna、Gottheimer、McCaul、Tuberville；机构包括 Berkshire、Aschenbrenner、Ackman、Druckenmiller。每 4 小时 GitHub Actions 更新。
- 交易日、披露日、配偶 / 本人、股票 / 期权、申报金额区间与原始 House / Senate / SEC 链接分别显示。13F 为季末持仓；不使用聚合商估算买价或收益作为真实业绩。普通股买入才计算披露后次一完整交易日开始的 20 日价格观察；历史补录不作为实时实绩。
- Serenity 等 X 观点由 Muse 在其已有访问能力下监视，保留原文投递；核验页读取最近 7 份 Muse 日报中的投资项。没有自动 X API 连接，不冒充已证实交易。
- Ask GPT 降为持仓证据卡的可选深入提问动作。旧 Signal Audit 地址自动进入本工作台；旧记录保留，可用 `?standalone=1` 访问。

验证：`node scripts/investment/test.mjs`；HTTP 静态站运行在 8765 时执行 `node scripts/investment/browser-test.cjs`。后台测试在 Worker 目录执行 `node tests/muse.test.mjs`。
