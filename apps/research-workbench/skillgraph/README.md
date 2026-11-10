# SkillGraph 回归评测台

公开合成基准 `skillgraph-public-v1`，从研究工作台侧栏进入。浏览器只在本地读取题集、评测和导入/导出。岗位术语参考 [O*NET Data Scientists](https://www.onetonline.org/link/details/15-2051.00)。关系、证据、题目与期望答案由本项目编写。

```sh
node scripts/research/skillgraph-eval.mjs --suite > suite.json
node scripts/research/skillgraph-eval.mjs 3 > results.json
```

`suite.json` 中的 facts 为统一证据库。接入 Neo4j 或生产向量检索时，在本地用同一证据 ID 和题集。执行端使用题目的 query 和公开查询约束，评分端读取 expected。不要把 expected 传给被测检索器。将两组结果写入本地命令生成的 JSON 结构。逐题字段如下。

- `id` 为题号，`retrieved` 为按排序返回的证据 ID，最多 Top K 条。
- `answers` 的每项包含 `id`、`citation` 和 `path`。路径为节点名称与边名称交替组成的数组，可参考本地结果。拒答使用空数组。
- `latencyMs` 与 `costUsd` 可填 `null` 表示未测。成本应填写该题实际 API 费用，多个调用的费用需要相加。
- 两组 run 的 method 固定为 `vector` 和 `graph`，label 可填实际配置名。导入完整文件后重新计算指标。

本地关系基线预先得到查询的结构化约束。它能隔离检索和路径验证，适合作为回归夹具。生产系统的意图解析、模型生成和泛化能力需要通过外部跑分单独评估。
