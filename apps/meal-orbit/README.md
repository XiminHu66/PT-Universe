# Food Orbit v4.1

纯静态单页版，可直接部署到 GitHub Pages。

## v4.1：手机端 App 跳转

- 手机端外部链接不再强制新开浏览器标签页，而是使用同页导航，让 iOS Universal Links / Android App Links 有机会直接交给已安装的 App。
- Google Maps 继续使用官方 `https://www.google.com/maps/...` Universal Maps URL：安装 Google Maps 时优先进入 App，否则进入网页。
- Yelp 使用原始 Yelp HTTPS 链接并在手机端同页打开，由系统 / Yelp 的 App Link 处理；无法接管时正常落到移动网页。
- 小红书使用官方 `xhsdiscover://search/result?keyword=...` Deeplink；若 App 未接管，约 1.1 秒后回退到对应网页搜索。
- 下厨房、爱料理 LIVE 入口改为手机端同页 HTTPS 导航，避免 `target=_blank` 阻断可能存在的 Universal Link。
- 收藏里的 Google Maps 餐厅链接、随机探店按钮也统一走 Smart Link 逻辑。
- 桌面端仍保持新标签页打开，不改变原来的桌面使用习惯。

## v4：手机端适配

- 桌面端继续使用左侧固定导航。
- ≤760px 自动切换为底部 4 Tab 导航，更适合单手操作。
- 顶部保留当前页面标题，主题 / 设置按钮固定在右上角。
- 支持 `viewport-fit=cover` 与 iPhone safe-area，避开刘海、Dynamic Island 和 Home Indicator。
- 输入框在手机端使用 16px 字号，避免 iOS Safari 聚焦时自动放大。
- 转盘按屏幕宽度自适应，320px 宽的小屏也不会横向溢出。
- 餐厅雷达改成单列触控布局。
- 食谱分类按钮和 LIVE 来源支持横向滑动。
- 设置 / 菜谱详情在手机端显示为底部 Sheet。

## 部署

将 `index.html` 放到 GitHub Pages 仓库根目录即可。无需 npm、构建步骤或后端。

如果替换旧版本，只需要覆盖仓库中的 `index.html`。
