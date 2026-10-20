# Media Vault 登录修复与方案选择（2026-10-20）

本轮采用 GitHub 身份登录 + VPS 固定 API 转发 + Worker 会话鉴权，继续使用原页面完成下载。Cloudflare Access 是以后希望取消自有 GitHub 登录应用时的托管备选；VPS 上的 Pocket ID 适合明确需要自行维护身份服务的情况。本轮复用现有经过鉴权的 VPS 出站 WSS，不新增身份服务、域名、VPS 公网监听端口或账号访问者。

## 线上故障证据

只读诊断确认：首次开通回调已到达，私有应用的 OAuth 配置未保存，正常登录回调尚未开始。真实 workerd 原生 fetch 复现 TypeError：不支持 redirect:error。这在发出 GitHub API 请求前发生；之前注入 fetch 的测试没有覆盖平台差异。

修复为 redirect:manual，并拒绝非成功响应，包括所有 3xx；不自动跟随跳转，不将 client_secret 或用户 access_token 发往第三方地址。同一错误也存在于 Worker 的小说目录元数据请求，已一起修正。浏览器和 Node 操作脚本支持 redirect:error，保留原策略。

服务端连接失败使用独立提示，不再推测用户账号错误。首次开通自动提交已经预填的 GitHub manifest 表单，最终创建和身份确认仍由用户在 GitHub 完成。后续有效设备复用，不逐个下载授权。

线上复验随后确认第二个故障：Cloudflare 出口请求 GitHub 返回 HTTP 403 且 X-RateLimit-Remaining 为 0。GitHub 官方说明，未登录 REST 请求按来源 IP 计数，每小时 60 次。为避免共享出口配额影响首次开通，生产登录的服务端请求改走自己的 VPS。

VPS 只接受开通、令牌交换、身份核对和固定公开身份探测四种操作，主机、路径和回调地址固定；拒绝任意网址、额外请求头和所有 HTTP 跳转。消息经现有 Agent 鉴权的出站 WSS 往返，凭据只在请求内存中短暂存在，不进入文件、下载状态或日志；D1 继续只保存加密配置。每次最多一个交换、16 秒期限和每分钟 20 次上限；断线会立即失败，不自动放行或创建授权。

## 方案比较

| 方案 | 首次配置 | 日常使用 | 维护和当前结论 |
| --- | --- | --- | --- |
| GitHub 登录 + 现有 VPS 固定转发（本轮） | 用户确认专用私有 GitHub App；无需仓库权限和本地密钥 | 记住设备最多 30 天，有效设备直接下载 | 同时解决 Worker 参数错误和共享 IP 配额；使用已有基础设施，本轮发布 |
| Cloudflare Access | Zero Trust 账户配置、允许的个人身份、独立登录路径策略及服务端 JWT 校验 | 可用 Cloudflare 身份或邮箱一次性验证码；依策略复用会话 | 托管身份维护负担更低；需要账户侧一次配置，尚未创建或启用 |
| VPS Pocket ID | HTTPS 地址、反向代理或出站 Tunnel、管理员首建、Passkey 绑定和恢复备份 | Windows Hello / 手机 Passkey | 单容器、SQLite，但域名、HTTPS、更新、备份由自己负责；当前不是即插即用替换 |
| VPS Authelia / authentik | HTTPS/代理/身份配置，authentik 还需数据库和更多内存 | OIDC / SSO | 对当前单用户下载器配置偏重，不选为本轮修复 |

若以后采用 Access，只保护专用登录路径，不给整个 Worker 开启 Worker-level Access：官方说明后者不支持 WebSocket，会影响 VPS 出站 WSS。Access 身份必须在服务端验签并校验 issuer、audience 和限定身份；不能仅相信浏览器传入的邮箱或请求头。

## 验证范围

- 新增真实 workerd + D1 + 原生 fetch 测试；GitHub 的返回由 Miniflare 出站服务在网络边界模拟，不替换 Worker 内部 fetch。
- 覆盖开通、PKCE 回调、加密配置和交付、真实账号/设备会话、未授权诊断拒绝、重定向阻断及小说目录元数据。
- 保留 Chromium 真实跨域 Cookie / COOP 测试；首次开通不再要求多点一个中间按钮。
- 上线检查通过受现有 Owner 鉴权保护的 /login-readiness，让实际部署的 Worker 经 VPS 出站 WSS 请求固定公开 GitHub 身份地址；只输出可用性和配置是否存在，不读取凭据。
- 上述自动测试不代替用户真实 GitHub 创建/登录。未保存的首次配置需要用户重新开始一次；不会自动操作真实授权或创建应用。

## 官方资料

- Cloudflare Request 支持的重定向模式：https://developers.cloudflare.com/workers/runtime-apis/request/
- Cloudflare Access 与 Workers、路径保护和 WebSocket 限制：https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Access 邮箱一次性验证码：https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- Access 会话管理：https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- Pocket ID 安装与 HTTPS 要求：https://pocket-id.org/docs/setup/installation
- Authelia 架构：https://www.authelia.com/overview/prologue/architecture/
- authentik 安装需求：https://docs.goauthentik.io/install-config/install/docker-compose/
- GitHub App manifest：https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest

- GitHub 未登录 API 的 IP 配额：https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
