# Media Vault: 无自有域名的 HTTPS 连接（未上线）

## 方案
GitHub Pages 的 Media Vault → `https://pt-media-gateway.summer07-nanjolno.workers.dev` → Cloudflare Workers VPC Service → outbound-only `cloudflared` → Docker 私有网络中的 `http://adapter:8789`。

无需自有域名或新增 OCI VPS 入站端口。使用已经存在的 12 GiB Media Vault 数据盘、Aria2、MeTube、Suwayomi 和经过 Bearer Token 认证的适配器。Workers VPC 在 2026-10-13 仍为开放 Beta，Beta 期间 Cloudflare 官方标明 Workers VPC 免费，Workers 自身计费和使用限制仍适用。不能保证未来 Beta 定价或功能不变。

官方文档：https://developers.cloudflare.com/workers-vpc/get-started/ 与 https://developers.cloudflare.com/workers-vpc/platform/pricing/

## 当前权限阻塞

GitHub Actions 只读检查：https://github.com/XiminHu66/PT-Universe/actions/runs/38489141159

- `GET /accounts/{account}/cfd_tunnel`：200 成功（无已存在的 Tunnel）。
- `GET /accounts/{account}/connectivity/directory/services`：403，Cloudflare 错误码 10000。
- 未确认是此 GitHub API Token 缺少 Connectivity Directory Read/Bind/Admin 权限，还是账户侧 Beta 访问限制。不可在失败后猜测授权已生效。

Cloudflare Workers VPC 官方要求创建 VPC Service 的身份具有 **Connectivity Directory Admin**，为 Worker 绑定已有服务需要 **Connectivity Directory Bind**，只读查看需要 **Connectivity Directory Read**。优先使用用户 Cloudflare 控制台操作来完成一次性资源创建，不为现有 PT Universe Worker 添加超出需要的广泛权限。

## Cloudflare 控制台需用户完成的准备（不用本地命令行）

1. 在 https://dash.cloudflare.com/ 登录此前部署 PT Universe Worker 的同一账户。
2. 进入 Workers VPC → Tunnels，确认能否创建 Tunnel；只为 Media Vault 新建一个 outbound-only Tunnel（例如 `pt-media-vpc`）。不要将 Aria2/MeTube/Suwayomi 注册为公网入口。
3. 在 `XiminHu66/pt-oci-ops` 私有 GitHub 仓库的 Settings → Secrets and variables → Actions 中，新增 Secret **`CF_MEDIA_TUNNEL_TOKEN`**，值为 Cloudflare 控制台为上述 Tunnel 给出的连接器 Token。**绝不把 token 提交到文件、贴入聊天或者打印进 Actions 日志。**
4. 手动运行 https://github.com/XiminHu66/pt-oci-ops/actions/workflows/19-vpc-tunnel.yml，安装常驻 cloudflared 容器并验证没有新增公网端口。此工作流只有手动触发，且 Secret 缺失则拒绝运行。
5. 返回 Cloudflare Workers VPC → VPC Services → Create：类型 HTTP，选择该 Tunnel，Hostname **`adapter`**，HTTP Port **`8789`**。这是 cloudflared 和 adapter 共享 Docker 网络中的服务名，不是公网 DNS。
6. 将创建的 **VPC Service ID**（非密钥）用于 `wrangler.example.jsonc` 的 `__VPC_SERVICE_ID_FROM_CLOUDFLARE__`，然后让自动化部署新 Worker。部署用的 Cloudflare CI Token 可能还需要 Connectivity Directory Bind 权限；如果权限不允许，请在 Cloudflare 控制台添加/调整最小权限，不要在日志里输出凭据。
7. 通过 Workers.dev HTTPS 实测 GET /health 的 401、正确鉴权、Origin CORS、POST /jobs、实时任务状态和票据文件取回，才能在浏览器中填写连接地址并将 Draft PR 合并。

## 安全约束

- Cloudflare VPC Service 固定目标，不提供任意地址或开放代理；只允许明确列出的 Media Vault 路由。
- 用户仍需提供保存在浏览器会话里的长随机 Bearer Token。现在的 Token 存在 VPS root-private `.env`，**还没有无日志泄露的用户取用/配对流程**，这一步需要在实际生产连接前解决。
- GitHub Pages 前端仍旧可以走以前的本地 EPUB 下载。未经验证不得合并。
- 整个系统不新增公网入站端口；不要开启 Cloudflare Quick Tunnel 当作长期生产域名。
- 当 Worker VPC 完成 Beta 后，需重新核查价格/限制，不允许自动切换付费方案。
