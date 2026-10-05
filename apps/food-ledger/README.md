# 红黑榜 · 我的点菜记录

PT Universe 独立工具，路径 `apps/food-ledger/`，入口在「生活与饮食」。不嵌入 Daily Nexus。

## 使用

1. 「记一家」填写菜馆名字，可补充地址、菜单/官网/地图链接和备注。
2. 「记一道菜」选择红榜或黑榜，填写评价和用餐日期。
3. 列表搜索支持菜馆、菜品、地址和评价。点击菜馆查看分榜记录。
4. 点击地址打开 Google Maps directions URL，出发点由 Google Maps 决定。
5. 「备份与同步」复制配对码，在手机/电脑另一端连接。也可导出 JSON 备份并合并导入。

## 保存

- 保存先写本机 `food-ledger.v1`，失败保留表单。读取异常暂停写入，原始内容仍可导出。
- 首次保存联网时自动注册端到端加密同步；已连接 PT Universe 的设备复用 `ptu.sync.config`。
- 独立 `food-ledger` 云端 scope，服务器只存 AES-GCM 密文，不随主页的偏好快照覆盖。
- Cloudflare D1 原子比较版本；冲突重新读取并按单条记录的更新时间合并。删除保留 tombstone。
- 离线时本机保存，重新联网、页面显示或每分钟自动同步。配对码相当于读取记录的密钥，需保管。
- 同一条记录在两台设备修改时，更新时间更晚的版本生效。新菜馆/菜品的独立编辑都会合并。
- 不自动抓取餐厅菜品，不带虚构示例或公开用户记录。

## 验证

`node scripts/food-ledger/model-test.mjs`

`PT_PLAYWRIGHT=/absolute/path/to/playwright node scripts/food-ledger/browser-test.cjs`

Worker 的 `tests/todo-sync.test.mjs` 同时检查新 scope 的认证、并发和旧记录隔离。
