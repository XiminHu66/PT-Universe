# Media Vault · 万能下载

PT Universe 独立分项目：`apps/media-vault/`。

## 当前功能与验收边界

| 板块 | 已实现 | 2026-09-29 实际验证 |
|---|---|---|
| 音乐 | 七地区/八曲风榜单与试听；Archive 直接列出 FLAC 文件并播放、下载；Ektoplazm 专辑搜索 | Archive 搜索返回 44 个文件，实际下载 877,343,841 字节文件；ffprobe 确认 FLAC、44.1 kHz、24-bit、双声道。另一个 FLAC 音轨在网页播放超过 24 秒。Ektoplazm `Globular` 查询返回 5 张专辑，并验证一个下载地址返回 ZIP 文件头（整张专辑未下载）。主流商业歌曲无损库仍未接通。 |
| 小说 | 目录、正文适配、分页、段落恢复、本地缓存、章节范围文字版 EPUB、TXT 导入 | Bili 目录返回 93 章，但样本正文源返回“内容加载失败”的截断内容；已拦截并禁止导出，不能标记阅读修复完成。Wenku《文学少女》目录 213 章，连续两章正文与 EPUB 已实测；ZIP 校验通过，包含 2 个有效 XHTML 章节。 |
| 动漫 | Anime1 单集解析、短期播放凭据、Range 流、网页播放和 MP4 下载入口 | `https://anime1.me/30255` 在生产网页实际解码 1280×720，readyState=4，播放超过 21 秒。未声称所有集数/地区或整集下载均已验证。 |
| BT | Nyaa、动漫花园、Internet Archive 同页并行搜索，磁力/种子，独立来源状态与去重 | `Frieren` 查询：动漫花园 35 条、Archive 8 条，合计 43 条；Nyaa 返回 429，页面明确显示来源失败。浏览器普通 BT 文件传输仍需要下载执行环境。 |
| 视频 | 公开媒体直链、HTML video/source/og:video、Anime1 专用解析；可选 yt-dlp 引擎 | Anime1 已实测；其他动态站点、分片合并仍依赖专用引擎，未宣称通用解析全部可用。 |

## 架构

- GitHub Pages：静态界面、播放器、本地书架和 EPUB 打包。
- Cloudflare Worker `/api/media/*`：按请求解析、来源搜索、缓存；限时 KV 凭据仅允许固定媒体来源流式传输。无需常驻主机。
- 下载凭据一小时过期；重新解析取得新链接。不会保存源站凭据到页面。
- 小 FLAC 保存前检查 `fLaC` 文件头；大于 128 MB 的文件先核验 Range 数据，再交给浏览器下载，避免整个文件驻留 JS 内存。
- 小说遇到来源验证、加载失败、排序规则变化或分页异常时停止；失败不写入章节缓存、不生成残缺 EPUB。
- Actions 负责代码检查、构建部署，以及生成供静态网站发布的每日榜单/更新列表。每日更新列表不等于无人值守整本抓取。
- GitHub-hosted Actions 不作为通用按需下载后台或 CDN。参见 [GitHub Actions 条款](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions)。
- 原私有引擎代码在 `services/media-engine/`；未部署。按需执行通用 yt-dlp/BT 需要另一个允许这类用途的任务平台和输出存储，当前没有假装已连接的云引擎。

## 验证

```sh
node --check apps/media-vault/app.js
node scripts/media-vault/frontend-test.cjs
npm run check --prefix workers/pt-universe-api
npm run test:media --prefix workers/pt-universe-api
python -m unittest discover -s scripts/media-vault -p 'test_*.py'
```

Worker 部署前运行回归测试：段落恢复、安全表达式、截断正文拒绝、媒体域名校验、RSS 解析、单来源失败时保留其他来源。UI mock 测试仅覆盖界面交互，不能作为真实来源可用的证据。

JSZip 按 MIT 使用，许可证位于 `vendor/JSZIP-LICENSE.txt`。正文段落恢复适配自 MIT 项目 bili_novel_packer，许可证位于 Worker `licenses/`。未将下载文件、小说正文或密钥提交到仓库。

## 2026-09-29 续接修复

- 流式传输仅等待响应头时设置超时，响应体不再被 20 秒计时器截断；回归测试使用延迟响应体验证。
- 附件下载通过命名框架交给浏览器，避免异步取票后的弹窗被拦截。大 FLAC 不整体装入 JS 内存。
- 手动刷新跳过前后端旧缓存；iTunes 不可用时尝试 Apple Music（准确标注榜单类型），再保留已成功的静态快照。
- 阅读请求防止旧响应覆盖新章节；禁用 IndexedDB 的浏览器仍可直接阅读；停止 EPUB 打包不会在最后一章完成时误触发下载。
- 小说本机追更无需引擎：打开小说页每天检查一次，支持手动检查；网页关闭时不执行整本后台抓取。
- 现有磁力/种子入口在未连接引擎时交给本机客户端；不宣称实现浏览器 TCP/UDP BT 或免费云离线下载。
- 右上角可检测服务连接，资源请求的超时、来源失败与缓存数据分别显示。

未解决的上游边界仍保留：Bili 样本截断正文、Nyaa 429、主流商业歌曲稳定 FLAC 源，以及无人值守通用云下载引擎。
