# Media Vault 下载引擎

网页：https://ximinhu66.github.io/PT-Universe/apps/media-vault/

网页和 Cloudflare Worker 已提供榜单、公开资源查询、小说目录接口和公开媒体链接解析。普通 BitTorrent、小说整本 EPUB、yt-dlp 解析和 FFmpeg 合并由本引擎执行。需要你自己的电脑、NAS 或服务器持续运行；没有将 GitHub Actions 当作持续下载服务器。

## Windows / macOS / Linux：Docker

1. 安装并启动 Docker Desktop（Linux 可用 Docker Engine + Compose）。
2. 下载本目录五个文件 `compose.yaml`、`Dockerfile`、`requirements.txt`、`engine.py`、`novel_adapter.dart`，放在同一目录。
3. 在该目录的终端执行：

```sh
docker compose up -d --build
docker compose logs engine
```

4. 日志会显示 `Access token`。在网页左下角 **⚙ → 下载引擎**，地址填 `http://localhost:8789`，密钥填上述 token，点击连接并测试。
5. 浏览器询问是否允许访问本地网络时，允许此网页访问你正在运行的引擎。浏览器或组织策略可能禁止公网网页访问 loopback，此时需用可信 HTTPS 入口，或通过本地 HTTP 服务打开仓库网页。

默认端口仅绑定本机；电脑关机后任务不会继续。引擎数据位于 Docker 的 `media-data` 卷，重建容器保留文件、密钥和追更列表。`docker compose down` 停服务但保留卷；不要附加 `-v`，除非确实要删除所有引擎数据。

下载任务结束后，在网页“下载任务 → 查看 / 取回文件”保存到本机。视频 / EPUB 构建期间显示“处理中”，BT 才显示实际字节进度。引擎重启时未完成任务标为“中断”，需要重新提交。

## 跨设备

在自己的主机上通过 HTTPS 反向代理或 Cloudflare Tunnel 发布本服务，再把该 HTTPS 地址填入网页。保留访问密钥，不要公开分享密钥或把它写入仓库。当前没有为你创建额外云主机、域名或收费服务。

`MEDIA_ORIGINS` 是允许的网页来源列表，默认含 PT Universe 和本地开发地址。更换网页域名时需要更新它。`MEDIA_TOKEN` 可覆盖自动生成的密钥，至少 24 个字符。

## 功能与限制

- aria2：磁力链接、HTTP(S) 种子 URL 和文件 URL；最多 3 个同时下载，下载完成停止做种。
- yt-dlp + FFmpeg：解析实际格式、选择单个格式，或最佳画质音视频合并；尝试下载源站提供的中文字幕。支持范围随来源变化，DRM、付费权限和站点验证不会被解除。
- EPUB：使用 MIT 授权的 `Montaro2017/bili_novel_packer`，固定提交 `9774efe8221a03341f677a03aceb4929c1559220`，保留原项目许可证，适配为非交互命令。保留其插图、目录、分页与正文处理。
- 小说追更：每天美西 08:00 后首次检查书架（进程运行时）；目录变化生成新的 EPUB。当天源站失败会显示错误，次日重试。最多 20 本。完整阅读进度在网页本机保存，使用 PT Universe 配对可同步。
- 每次最多 10 个未完成任务；普通视频上限 10 GB；可用空间不足 1 GB 拒绝新任务。BT 总大小依源文件，用户需管理主机磁盘。
- 访问密钥鉴权、允许来源检查、非公网初始 URL 拦截、下载文件范围校验；这不是面向陌生人的多租户服务。只在你控制的私有环境运行。
- 登录、403 / 429、反爬、地区限制或来源变动可能造成失败；错误显示在网页任务里，不会把失败任务标为已完成。

## 更新

```sh
docker compose build --pull
docker compose up -d
```

源站变化时需要先更新固定版本或适配器，再重新构建。不要直接用不明镜像或把账户 cookie 上传到公开网页。

## Qobuz 订阅音源（可选）

参考 [QobuzDL/Qobuz-DL](https://github.com/QobuzDL/Qobuz-DL) 的公开 API 协议，增加鉴权搜索和 FLAC 下载任务。需自行拥有有效 Qobuz 订阅及获准使用的应用凭据；不会从网页提取凭据，也不使用共享账号。

在 Compose 目录的私有 `.env` 文件设置 `QOBUZ_APP_ID`、`QOBUZ_AUTH_TOKEN`、`QOBUZ_SECRET`，然后重建并重启引擎。不要提交该文件。网页连接引擎后选择“Qobuz · 自有订阅”，搜索歌曲，再选择 CD / Hi-Res 音质下载。完成后在下载任务里取回 FLAC。凭据只发送到固定 Qobuz 官方 API，签名 CDN 下载不携带账户请求头；拒绝试听、非 FLAC 和不完整文件。未提供有效订阅时此源不可用。
