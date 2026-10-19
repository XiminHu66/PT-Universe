# Media Vault 最终合并检查清单

原始八阶段与约束见 `MEDIA_VAULT_REMAINING_PLAN.md`。当前具体验收以
`MEDIA_VAULT_FINAL_ACCEPTANCE.md` 和 `candidate-manifest.json` 为准。

## 当前状态

- 发布及公共合并触发 Pages 已获条件式授权，不需重复询问。
- 2026-10-19 用户明确同意移除 24 小时发布等待。跨日登录尚未验证，按单项用户延期记录，不能写通过。
- Windows 三文件真实落盘、离线校验与播放通过；固定小说四项任务、参数、刷新/退出流程已有证据。
- 用户明确尚未逐项确认目录与紧凑/默认/大字体预览，保留唯一 `novel-real-ui` 门槛；两 PR 保持草稿。
- 默认账号、提交、票据、两端文件流关闭；旧窗口不续期、不复活。无新增公网端口或本地密钥要求。

## 已完成交付

出站 Agent、HTTPS Worker/D1 队列与账本、幂等/取消/恢复、预算/预留、临时文件保护，
小说 EPUB、中文漫画 CBZ、视频和受控 BT 来源，原生保存及离线校验，目录/章节/纯文字/排版控件。
大文件、背压、中断/恢复及实际 Agent/workerd 空闲心跳、断开重连均有各自适用范围的证据。
MangaDex 中文仅限已支持 zh/zh-hk 托管章节，不泛化到其他漫画站。

VPS Agent 清理失败增加持久退避；34 项 Agent 检查和部署后状态核对通过。
旧视频未取得写入停止证明时继续保留，不为清空队列放宽删除边界。

## 最新主线与部署影响

本次审查公共 main 为 `ff3526b703a818c090a73ae92c2ccec3956b0073`。
自前次审查的变化为自动数据更新，包括 3C、周末活动、行情、财务和 Media Vault 来源快照；
与候选修改文件无重叠。最终合并前仍需重读当前 main，不能覆盖这些更新。

公共 PR 修改 Media Vault 既有 `app.js`/`index.html` 并新增配套页面/脚本。
合并 main 自动触发 `.github/workflows/pages.yml`，发布整个 GitHub Pages 网站，流程读取当时最新 main。
当前差异不修改 `workers/pt-universe-api/**` 或其部署工作流，不因此触发生产 API push 部署。
专用 hybrid Worker 和 VPS 仍手动部署；合并不等于批准账号、任务提交、文件流或公网端口。

## 最终执行顺序

1. 补齐用户真实目录和三预览结果；不能用后台参数、CI 夹具或页面策略绕行代替。
2. `node workers/media-vault-hybrid/candidate-check.mjs` 验证关闭候选、源指纹、排版契约。
3. `node workers/media-vault-hybrid/candidate-check.mjs --release` 要求真实验收和发布授权，
   只接受有明确用户决定、理由、单项范围的长期观察延期；删除 pending 不能绕过其他条件。
4. 公共/配套 CI 固定到当前精确提交，检查必要结果；此批只改验收规则和文档，不重复来源下载。
5. 核对最新 main 和两份 PR 差异，按配套 PR、公共 PR 顺序合并，核对 Pages 发布版本与结果。

条件未完成不标 ready、不合并。无额外权限时按现有授权执行；新增范围必须单独有明确依据。

## 回退

合并前错误：保留草稿和关闭配置，修复后跑受影响检查。
合并后页面错误：提交 revert，核对 Pages；不清空 D1、历史会话、票据或账本。
VPS 源码合并不自动部署，运行时回退不扩大权限。
