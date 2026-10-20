# 视频来源范围与本轮故障（2026-10-20）

上游是 [MeTube](https://github.com/alexta69/metube)，实际提取由 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 完成。上游明确说明：[解析器列表](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) 不保证每个网站当前都可下载；网站改版、来源权限和地区限制都会影响结果。

## 当前证据

- 实际 VPS 运行 yt-dlp 2026.8.19、yt-dlp-ejs 0.8.0、Deno 2.9.7，运行依赖齐备。MeTube 镜像为既有 2026.10.19；并未因为失败而盲目降级或更换客户端。
- 用户的 YouTube 任务和一次固定公开 CC 视频元数据尝试均返回机器人验证要求。VPS 没有 YouTube Cookie。连接 Media Vault 的 GitHub 身份，不会提供来源网站身份；本地浏览器登录来源网站也不会同步到 VPS。
- 前一轮 MP4 直链完整取回通过，不能代表 YouTube 页面提取通过。YouTube 当前仍未恢复为已验收来源。
- 一段 Wikimedia Commons CC BY 4.0 视频已由实际 VPS 提取并下载低清版本：1,495,950 字节，SHA-256 `bff952e17c8c3ebd46c740f1849445870d0699ded564d886cc9dc6ed7e47fddd`；ffprobe 确认存在视频轨道。该证据是下载引擎层验收，不能单独代替页面到本机的交付验收。

## 链接格式

| 来源 | 接受的链接 | 本站范围 |
| --- | --- | --- |
| 公开媒体文件 | HTTPS MP4 / WebM | MP4 小样本交付已验收；签名直链仍可能过期 |
| HLS / DASH | 非 DRM 的 HTTPS 媒体清单 | 上游支持，需来源允许 VPS 访问，不承诺任意清单 |
| YouTube | `https://www.youtube.com/watch?v=视频ID`、`https://youtu.be/视频ID`、`https://www.youtube.com/shorts/视频ID`；单视频 live / embed 也会规范化 | 当前 VPS 请求要求来源验证，未验收恢复 |
| Wikimedia Commons | 具体 `File:` 视频页面 | 上述公开授权样本已通过引擎下载 |
| Vimeo | `https://vimeo.com/数字ID` | 上游有解析器，本站未进行实际下载验收 |
| Bilibili | `https://www.bilibili.com/video/BV…` | 上游有解析器，本站未进行实际下载验收，清晰度和账号限制仍适用 |
| 其他网站 | 公开 HTTPS 的具体视频页 | 尝试通用解析器，不承诺通用下载 |

频道、搜索页和整份播放列表不作为单视频提交。YouTube 单视频链接中附带的列表和分享追踪参数会被移除，保留所选视频 ID。

公开授权测试原页：[地球温度变化，ZDF Terra X，CC BY 4.0](https://commons.wikimedia.org/wiki/File:Die_Temperaturkurve_der_Erde_(ZDF,_Terra_X)_720p_HD_50FPS.webm)。网页提供“填入已验证的 Commons 视频示例”，只填链接，不自动开始下载。

## 错误处理与限制

机器人验证、账号权限、解析依赖、无视频格式、地区或 403 拒绝、429 限流、媒体提取失败分别给出安全错误类别。来源授权和解析器问题不再显示无效的一键重新提交；查看支持范围仍在原页面完成。未知连接失败和确认取消的任务仍允许重试。

当前版本不接收来源网站 Cookie，也不收集 Google 密码。不把“在本机重新登录”当作 VPS 授权方案，不通过公开 issue 或聊天收取凭据。不新增公网端口，不改变现有登录、传输预算、文件保留及正常文件交付状态。

官方故障说明：[MeTube FAQ](https://github.com/alexta69/metube/wiki/Troubleshooting-FAQ)、[yt-dlp YouTube 提取与来源身份限制](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#youtube)、[JavaScript 运行环境](https://github.com/yt-dlp/yt-dlp/wiki/EJS)。未执行人机验证绕过、换 IP 或更换请求身份重试。
