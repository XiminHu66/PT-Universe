# 监控中心

独立入口：<https://ximinhu66.github.io/PT-Universe/apps/monitor-center/>。首版没有加入 Daily Nexus 导航。

购物、USCIS案件和酒店订后监控共用一个私有后台。页面代码公开，业务记录只存入VPS加密SQLite。复用现有工具中心的 owner-private 身份，独立的 `monitor:manage` ES256 grant有效期一小时，只保存在当前标签页的sessionStorage；校验回调随机数并立即清理URL。

## 运行与支持范围

- 添加对象后，后台每分钟扫描计划任务。默认商品/酒店每6小时，案件每24小时检查；无需开着页面。
- 商品可从JSON-LD读取唯一Product/Offer，或在浏览器中指定唯一价格区域。Amazon免费自采集不依赖Keepa API；反爬时显示实际失败，不承诺覆盖所有商品或所有个性化优惠。
- 动态页面复用现有VPS Chrome，通过独立浏览器上下文隔离每次检查。仅支持源码中明确列出的购物、酒店及USCIS域名；阻断私网与其他子请求，不接受用户脚本。
- USCIS使用官方公开表单，保存状态标题、正文、明确日期及发现时间。验证码、表单变化、访问限制与状态未变分开记录。
- 酒店需要具体房型的价格与条件区域。首次成功后由用户核对入住范围、房型、付款、取消及含税总价；绑定当次观测和条件摘要，条件变化自动取消可比性。Booking来源必须保留匹配的日期、成人数、房间数查询参数。
- Price match是待核对候选；需用户填写并核实政策与申请截止。重新预订另按取消截止和取消损失计算。没有自动申请、取消或预订。
- 站内事件默认开启；可选ntfy主题推送仅含事件类型。未接入邮件账户或付费服务。
- 来源观测可下载包含公开酒店截图的JSON证据；案件证据文本不包含完整receipt。支持导出配置、最新报价和事件；此导出不是服务器SQLite及历史证据的完整灾备副本。
- 健康状态包含lastAttempt、lastSuccess、错误类别、连续失败；失败不会覆盖最后有效观测。

酒店跨站房型映射依赖首次人工核对，无法可靠识别的报价保持待处理。没有真实案件编号和酒店订单时，只能验证代码、边界及部署，不把演示数据标为真实监控结果。

## 部署结构

`services/monitoring/` 使用Node 24内置SQLite，无新增npm依赖；挂载 `/monitor-data`，与数据库一起保管 `encryption.key`。VPS部署在现有hub-gateway内，不新增公开端口，不变更其他工具或changedetection任务。`pt-oci-ops`工作流54负责部署、健康检查与回滚。完整灾备需同时备份SQLite数据库及密钥。

API由 `workers/pt-universe-api/src/monitor.ts` 校验独立授权，使用已配置的私有签名传输，只允许固定资源路径。工具中心只增加监控专用授权回调，不改变原登录范围。

## 验证

```sh
node --test services/monitoring/monitoring.test.mjs
node scripts/monitor-center/connection-test.mjs
cd workers/pt-universe-api
npm run check
node tests/monitor.test.mjs
```

上线验证不得使用虚构状态冒充成功，不应把真实私人订单或案件写入公共仓库、Actions日志或公共artifact。
