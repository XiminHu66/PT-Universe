# 3C Scout

一个面向个人兴趣的新品与好价聚合站，自动收集中英文公开 RSS / Atom 信息，重点覆盖：

- 3C 数码、存储、充电与桌面设备
- 音频、游戏掌机与外设、Maker 小硬件
- 厨房用品、生活小物、收纳、清洁与智能家居

网站把内容分为“新商品”“好 Deal”和“发现”三条流。发现流聚合众筹、独立硬件、设计概念和非主流新品，用来寻找可能感兴趣的下一件产品。页面提供搜索、分类、中英文筛选、排序和折叠详情；综合排序优先中文内容，所有商品优先跳转购买链接，并保留原始文章 / 视频作为备用链接。

对于 The Deal Guy 等在视频详情中列出多个商品的合集，抓取器会读取详情中的商品名与购买链接，把一个视频拆成多张独立商品卡。普通文章也会额外检查正文中的 Amazon、Best Buy、Walmart、Newegg 等商家链接及常见联盟跳转；没有可识别商品链接时，页面仍会回退到原视频或原文。

当前来源包括少数派、爱范儿、IT之家、UNWIRE、Cool3C、Engadget、The Verge、Tom's Hardware、MacRumors、9to5Mac、9to5Toys、DealNews、The Deal Guy、Dealmoon 分类搜索、Product Hunt、New Atlas、Yanko Design、The Gadgeteer，以及中英文新品 / 好价 / 众筹主题搜索。

## 自动更新

`.github/workflows/daily-refresh.yml` 会在每天 `15:15 UTC` 自动运行，对应西雅图冬令时约 `07:15`、夏令时约 `08:15`。也可在仓库 **Actions → Refresh products and deploy → Run workflow** 手动刷新。

每个来源独立抓取；单个源失败不会阻断其他数据。最近 14 天的可用条目会被保留，页面底部会显示本轮来源健康状态。

## 发布

首次使用时，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。之后工作流会在刷新数据后直接部署静态站点。

默认地址：`https://ximinhu66.github.io/3C-scout/`

## 本地检查

```bash
python -m unittest discover -s tests -v
python -m http.server 8000
```

不需要 API key，也不需要单独服务器。价格和库存仅从公开标题/摘要提取，最终以商家结账页为准。
