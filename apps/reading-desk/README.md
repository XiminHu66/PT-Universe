# Reading Desk

从 PT Universe 打开 **Reading Desk**。iPad Safari 可在分享菜单里将它加入主屏幕。

- **RSS Orbit** 有「常用」和「今日热点」。在「常用源」选已有订阅，点标题打开发布方网页。「今日热点」先显示最多十个归并后的话题，优先保留发布方链接并限制同一来源刷屏。热榜条目标的是采集时间；RSS 条目标的是发布时间。浏览器在当前标签页记住 RSS 子视图、搜索和阅读位置。
- **ChatGPT** 顶部是两份工作日简报。各卡片的「配置直达」接受已登录的原会话地址。「试开」可立即确认位置，保存后点卡片使用系统通用链接。「Safari 网页」使用 ChatGPT 的浏览器专用模式。
- **Muse** 可为 Spaces 和定时任务填入已验证的 Muse 网页或 App 链接。空白字段会走官方 App 入口，网页和 App Store 入口备选。Watch Inbox 仍打开原项目。
- **Memo** 位于标题栏右侧，继续使用此浏览器的既有备忘录和导出。

## 在 Safari 定位最新回复开头

在 ChatGPT 栏展开「总是落在旧消息或末尾？定位到最新回复开头」并复制书签地址。在 Safari 添加普通书签，命名「简报开头」，编辑它的地址并粘贴复制的内容。之后用卡片的「Safari 网页」打开会话，点书签即可。它在当前 ChatGPT 网页中找到最新已加载的助手回复并滚到开头，不上传内容。任务还未完成或聊天未载入时，查看报告日期或等载入后再试。原生 App 的会话滚动由 App 自己控制。

## 本地验证

在仓库根目录运行 `python -m http.server 8765`，访问 `http://localhost:8765/apps/reading-desk/`。运行 `python scripts/reading-desk/browser-test.py`，或使用 `--browser webkit`。运行 `python .github/scripts/actions_policy.py .` 和 `node --check` 检查修改的 JavaScript。App 唤起、Safari 书签保存和软键盘需要真实 iPad 验证。

独立 RSS 路由是 `?reader=1&view=frequent` 或 `?reader=1&view=hot`。内嵌时父页用同源消息切换视图，子页同时校验来源和父窗口。
