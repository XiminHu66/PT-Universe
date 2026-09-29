# Media Vault · 万能下载

PT Universe 原仓库内的独立分项目：`apps/media-vault/`。主页和折叠导航均已注册。

| 板块 | 可用路径 | 边界 |
|---|---|---|
| 音乐 | 七个国家/地区的 iTunes / Apple Music 榜单，八个曲风选项；试听播放器；Internet Archive FLAC 查询与真实文件下载 | iTunes 是商店销量榜；中韩用 Apple Music 热播总榜，曲风为总榜内筛选，不代表独立曲风总榜；部分地区/曲风无数据；不是任意商业音乐的免费 FLAC 库 |
| 轻小说 | wenku8 / bili 小说链接目录；文库公开正文；TXT 导入；阅读进度；本章 TXT / EPUB 导出；引擎整本 EPUB 与每日追更 | 来源要求验证/登录或返回 403 时明确失败；bili 正文交给原版 packer 以处理分页和段落顺序 |
| 动漫 | Anime1 搜索和公开更新；单集解析入口；播放器、本地 VTT | 动态页面需要引擎；字幕依实际片源，没有虚构“所有资源中文字幕” |
| BT | magnet / 种子 URL / HTTP URL 的 aria2 任务，状态、取消、文件取回 | 必须连接常驻引擎；未连接不会显示虚假下载进度 |
| 视频 | 公开直链、HTML video/source/og:video；引擎 yt-dlp、格式选择与 FFmpeg 合并 | HLS/DASH 清单本身不是合并视频；DRM 不支持 |

## 架构

- GitHub Pages：静态界面、本地阅读器、播放、个人书架。
- 现有 `pt-universe-api` Cloudflare Worker：`/api/media/*`，短时 metadata 缓存，不中转大文件。
- Actions：每日美西 08:23 起抓取榜单与来源状态，失败保留最近成功的榜单；09–11 点补跑窗口。GitHub 调度可能延迟。
- 私有引擎：见 `services/media-engine/README.md`。用户尚需在自己的主机启动，代码交付不等于常驻引擎已运行。
- FMHY：保留来源导航入口；不把目录误当成稳定下载 API。

## 验证

`node --check apps/media-vault/app.js`

`npm run check --prefix workers/pt-universe-api`

`python -m unittest discover -s scripts/media-vault -p 'test_*.py'`

自动 workflow 会构建 Docker 引擎，验证 Dart 适配器编译。前端真实网络与移动端测试记录在交付时报告。

JSZip 3.x 使用 MIT/GPL 双授权，此处按 MIT 使用；许可证位于 vendor/JSZIP-LICENSE.txt。未将原站内容、下载文件或密钥提交到 GitHub。
