DeskBoard v5 — Market layout/search/layout controls fix

更新内容

1. 股票区重构
- 不再使用两个固定的 Market Overview iframe。
- 改用 TradingView Single Ticker Web Components + CSS Grid。
- 默认自动分列：
  1–6 支：1 列
  7–12 支：2 列
  13–18 支：3 列
  19–24 支：4 列
- 所有股票单元平均占用可用空间，不再出现 12 支股票只挤在上半部、下半部大片留白的问题。
- 第 13 支股票不会再把旧组件变成内部滚轮。
- 可在 设置 → 布局 → 股票分列 手动指定 1–4 列。

2. 股票搜索 / 手动加入修复
- 本地搜索库新增：
  AMEX:DIA — SPDR Dow Jones Industrial Average ETF Trust
  NYSE:NKE — Nike, Inc.
  以及 MCD / KO / V / MA 等常用标的。
- 搜索 DIA / NKE 无需联网即可出现正确结果。
- “高级：手动输入”现在会先查本地精确代码：
  输入 DIA 时自动使用 AMEX:DIA
  输入 NKE 时自动使用 NYSE:NKE
  不会再因为下拉框默认 NASDAQ 而加入错误交易所。
- 对本地数据库没有的短 ticker，会提供 NASDAQ / NYSE / AMEX 候选作为兜底。
- Yahoo 联网搜索仍只是补充；Safari/CORS 阻止它时，不影响本地搜索和候选功能。

3. 布局调整
设置 → 布局：
- 顶部 时间/天气 高度
- 顶部行情条高度
- 股票 / 新闻比例
  横屏：左右宽度
  竖屏：上下高度
- 底部导航高度
- 股票分列数
- 一键恢复默认布局
所有布局设置写入 localStorage。

4. 自动刷新
- 时间：每 1 秒更新。
- TradingView 股票 / 顶部行情条 / TradingView 市场新闻：
  由 TradingView 组件保持自己的数据连接并自动更新，不使用本页的 15 分钟轮询。
  是否是实时、延迟或 EOD 取决于具体标的/交易所及 TradingView Widget 提供的数据级别。
- RSS：每 15 分钟自动重新抓取；右下角刷新可立即强刷。
- 天气：v5 改为每 30 分钟自动刷新；右下角刷新可立即强刷。

5. 配置备份
- v5 导出的 JSON 现在也包含 layout。
- 从旧 v3/v4 升级会保留原股票 / RSS / 主题；布局使用新的默认值。

部署
1. 用本包的 index.html 覆盖 GitHub Pages 仓库根目录中的旧 index.html。
2. manifest.webmanifest 和 icon-180.png 可一起覆盖，也可以保留旧版。
3. Commit。
4. 等 GitHub Pages 部署完成。
5. iPad 完全关闭 DeskBoard Web App 后重新打开。
6. 如果仍显示旧版，在 Safari 打开 Pages 地址强制刷新一次，再启动主屏 Web App。
