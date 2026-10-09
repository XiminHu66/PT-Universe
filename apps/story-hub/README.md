# 作品与话题

Daily Nexus 工具箱中的独立页面，包含作品地图、兴趣话题、Anime1 番剧分集和完结作品库。通过 `?tab=works|topics|anime|discovery` 直接打开板块；追更旧链接自动跳转。

继续使用 `tsugi-hub-state` / `tsugi-hub-seen`，保留收藏、进度和已读状态。完结作品加入书架仍写入 `tsugi-local-library-v1`。实时数据读取共享 Cloudflare 公开接口，失败时沿用追更目录下的已验证快照。搜索、刷新和页面打开均不调用 Gemini。

验证：`node scripts/content-hub/browser-test.cjs`。
