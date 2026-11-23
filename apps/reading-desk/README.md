# Reading Desk

PT Universe 首页的 **Reading Desk** 卡片打开阅读工作台。iPad Safari 可用分享菜单中的「加入主屏幕」。

- **RSS Orbit** 默认打开「常用」。点「常用源」，选好已有订阅并保存。点「今日热点」进入 RSS Orbit 的原有热点列表和信息源设置。页面保留同一个 RSS 阅读器，可切回原来的阅读位置。「独立打开」可在新标签页打开当前 RSS 视图。完整的订阅管理在 [RSS Orbit 原站](../rss-dashboard/)。
- **ChatGPT** 顶部两张卡是工作日简报，另外三张卡是现有每日或每周任务。默认打开 ChatGPT Scheduled。要直接进入某份报告，在 ChatGPT 登录后复制对应会话的地址并保存到「设置直达链接」。可用标准会话或项目会话路径，链接参数可去掉。
- **Muse** 的两个主入口默认打开 Meta 的官方 App 入口，有网页和 App Store 回退。登录后在 Muse 里选择 Spaces 或定时任务。如在 Muse 网页获取了可直接访问的页面地址，可保存在「设置直达链接」。Watch Inbox 继续使用 PT Universe 已有的监视报告页。
- **Memo** 停止输入片刻后保存到此浏览器，刷新可恢复。复制或导出 TXT 可保留备份。若别的标签页已保存了新版本，本页会保留草稿并停止写入。可先导出草稿，再载入已保存版本。清除网站数据会移除浏览器保存的内容。

Memo 和个人直达链接保存在当前浏览器。请等状态显示「已保存」再关闭浏览器。站点和 RSS 的加载依赖网络和原有缓存，ChatGPT 与 Muse 的内容需要各自账号。同一 Apple ID 下的其他设备也不会自动同步。若 iPad 上的 App 入口留在 Safari，可用官方网页或从主屏幕打开 Muse。

## 本地验证

在仓库根目录运行 `python -m http.server 8765`，然后访问 `http://localhost:8765/apps/reading-desk/`。安装 Python Playwright 后，运行 `python scripts/reading-desk/browser-test.py`，也可添加 `--browser webkit`。运行 `python .github/scripts/actions_policy.py .` 以及 `node --check` 检查修改过的 JavaScript。验收竖屏和横屏可用 744 × 1133 与 1133 × 744 的视口模拟，原生 App 唤起和软键盘需在真实 iPad 验证。

RSS 的独立阅读路由为 `?reader=1&view=frequent` 或 `?reader=1&view=hot`。内嵌时由 Reading Desk 向同源 iframe 发送 `reading-desk-rss-view` 消息，子页校验消息来源和父窗口。浏览器后退可以恢复 Reading Desk 的 Tab 和 RSS 视图。
