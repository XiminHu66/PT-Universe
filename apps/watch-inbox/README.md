# Muse 每日监视汇总

1. 用户在此页点「创建通道并生成任务指令」。建立独立后台读取凭据与仅写入投递令牌。
2. 把生成的完整指令交给 Muse 一次。要求每天 20:00 America/Los_Angeles 汇总所有现有监视任务，比较前后变化、保留原始证据、建议下一步。先发送一次真实日报验证。
3. Muse 可 HTTP POST，或打开指令中的 `submit.html#owner=…&token=…`，填入 JSON 后点击发送。必须取得 `ok=true` 回执。工具本身不会假称已连接 Muse 账户或已创建其定时任务。
4. 收件箱打开后及前台每分钟自动读取，按待处理、变化、失败、无变化分组。没有收到当日报告会明确提示。用户可标记处理并查看历史日报。

## 投递契约

`POST /api/muse/{owner}/deliver`，`Authorization: Bearer <write-only-token>`，JSON：

```json
{
  "reportId": "muse-2026-09-30",
  "date": "2026-09-30",
  "summary": "总览，区分事实与推断",
  "items": [{
    "id": "固定的监视任务标识",
    "title": "任务标题",
    "category": "投资",
    "status": "changed",
    "priority": "normal",
    "summary": "具体变化及意义",
    "before": "之前",
    "after": "现在",
    "action": "建议下一步，无则留空",
    "observedAt": "2026-09-30T20:00:00Z",
    "urls": ["https://example.com/original"]
  }]
}
```

状态为 action / changed / unchanged / failed。失败不能记为无变化。成功项必须有 HTTP(S) 证据 URL；每份最多 100 项 / 150 KB。保存最近 60 份私有报告。

同 reportId、同内容重试返回去重回执；同 id 不同内容返回 409，修订需新 id，例如 `-r2`。读取需要 owner 账户令牌，投递令牌无法读取数据；更换投递令牌撤销旧通道。凭据只在 URL fragment / Authorization 中；投递页不加载分析脚本。

`GET /api/muse/{owner}/reports` 与 `POST /api/muse/{owner}/channel` 需要读取账户令牌。报告不提交到公共仓库。旧通用网页监视保留在 `?legacy=1`。

如果 Muse 既不能 HTTP POST 也不能浏览器投递，需要其邮件或其他出口的额外适配；不能把“每天让用户粘贴”当成自动连接。
