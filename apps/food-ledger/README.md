# 红黑榜 · 我的点菜记录

PT Universe 独立工具，路径 `apps/food-ledger/`，入口在「生活与饮食」。不嵌入 Daily Nexus。

## 使用

1. 输入菜馆名字，点击「添加」（已有同名记录时直接「打开」）；地址、链接和备注在「资料」中补充。
2. 在菜馆内直接输入菜名，点击「＋ 红榜」或「＋ 黑榜」立即保存；日期自动记录为当天，评价和日期可在菜品「编辑」中补充。
3. 列表搜索支持菜馆、菜品、地址和评价。点击菜馆查看分榜记录。
4. 点击地址打开 Google Maps directions URL，出发点由 Google Maps 决定。
5. 「备份与同步」复制「本设备配对码」，在另一台设备的「连接另一台设备」输入框粘贴并连接。成功后两端的本设备配对码相同。也可导出 JSON 备份并合并导入。

## 保存

- 保存先写本机 `food-ledger.v1`，失败保留表单。读取异常暂停写入，原始内容仍可导出。
- 首次保存联网时自动注册端到端加密同步；已连接 PT Universe 的设备复用 `ptu.sync.config`。
- 独立 `food-ledger` 云端 scope，服务器只存 AES-GCM 密文，不随主页的偏好快照覆盖。
- Cloudflare D1 原子比较版本；冲突重新读取并按单条记录的更新时间合并。删除保留 tombstone。
- 配对码展示与粘贴分开，后台同步不改动用户输入；同步忙碌时连接请求等待后执行。失败连接不切换账号，错误保留在独立状态栏。
- 离线时本机保存，重新联网、页面显示或每分钟自动同步；初次注册失败后，有本机记录的页面也会在重新打开、重新显示或每分钟重试。配对码相当于读取记录的密钥，需保管。
- 同一条记录在两台设备修改时，更新时间更晚的版本生效。新菜馆/菜品的独立编辑都会合并。
- 不自动抓取餐厅菜品，不带虚构示例或公开用户记录。

## 验证

`node scripts/food-ledger/model-test.mjs`

`PT_PLAYWRIGHT=/absolute/path/to/playwright node scripts/food-ledger/browser-test.cjs`

Worker 的 `tests/todo-sync.test.mjs` 同时检查新 scope 的认证、并发和旧记录隔离。

真实线上接口验证（创建隔离测试账号，不访问已有用户账号）：

`PT_LIVE=1 PT_PLAYWRIGHT=/absolute/path/to/playwright node scripts/food-ledger/live-sync-test.cjs`

覆盖真实账号注册、不同初始账号配对、两端记录合并、双向拉取、刷新和测试记录清理。浏览器回归测试还覆盖同步中粘贴与连接、错误配对码及草稿保留。
