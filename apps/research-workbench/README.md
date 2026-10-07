# Research & Knowledge Workbench

PT Universe 独立研究项目：`apps/research-workbench/`。入口位于「学习与成长」，不接入 Daily Nexus。

完整产品方向：Discover → Read → Extract → Compare → Connect → Implement → Experiment → Evaluate。当前交付第一阶段，不把后续评估 / 实验功能伪装成可用功能。

## 第一阶段使用

1. Inbox 输入 arXiv ID / URL、GitHub Repo 或 Hugging Face 模型地址。支持实时 arXiv / Semantic Scholar 搜索，RSS/Atom 导入，或手动保存其他来源与粘贴原文。按 arXiv ID、DOI、规范 URL / 标题去重；保留 Save、Ignore、Read Later、Deep Read 状态。
2. Reader 阅读摘要、读取 arXiv HTML（若可用）、查看 PDF 或粘贴全文。原文段落保留章节和 `p1` 等引用 ID。导入版本的来源和全文版本保持一致。
3. Extraction 按原文句子 / 章节规则生成候选：question、hypothesis、problem、idea、contribution、architecture、training、dataset、baseline、metrics、results、ablations、limitations、compute、code。没有证据的内容为空。可复制 AI 提取 prompt，在已有 AI 工具生成严格 JSON 后导入；**没有托管 LLM 调用**。
4. Evidence 原文逐字匹配，区分无引用 / 不匹配 / 匹配待确认 / 人工已核查。修改原文重置人工确认。匹配仅证明引用存在，不证明推断语义正确；结果需手动核查实验协议、数据集与表格。支持自定义 Claim。
5. Compare 2–5 篇论文，使用结构字段及持久化自定义 dimension / 比较备注，导出 Markdown。所有缺失字段和引用状态明确保留。不同协议的 benchmark 分数不直接排序。
6. Topic 汇总论文 timeline、规范化 Method / Dataset / Benchmark 对象、作者、repo 与结果证据；保存主题总结、开放问题和笔记。词法主题命中 + repo 的 relevance 分数可查看原因，不是学习得到的评分。
7. Research Graph 支持 13 类核心对象、手动规范化名称 / 关系、自动字段 / topic 候选图、按类型筛选、节点定位到论文 / 引用、JSON 导出。虚线是候选，实线是手动关系。当前不做自动实体消歧或 citation mining。
8. Research Memory 在标题、摘要、全文、提取、引用、笔记中做关键词检索。Notes 的 decision log 记录为什么采用或放弃某方法。

## 保存和同步

- 使用 PT Universe 现有 D1 + AES-GCM 加密同步，隔离 scope `research-workbench`；复用 `ptu.sync.config` 和配对码。
- 本机缓存 `research-workbench.v1`，联网后自动注册 / 上传，刷新、显示页面、恢复网络和每分钟拉取。单独记录的更新时间与删除 tombstone 支持多设备合并。
- D1 原子 CAS 防止并发覆盖；409 重新拉取再合并。错误配对码不会替换当前配置。
- 对话框或编辑输入有焦点时后台同步不重绘表单。保存失败保留输入；读取失败阻止覆盖原始记录，仍可导出原始备份。
- 当前同步密文上限约 2 MB；全文容量大时会明确报告容量错误，本机数据可导出 JSON。下一阶段应迁移全文到独立加密 blob / 对象存储。
- 自定义比较维度与备注持久化；当前选择的论文组合是临时 UI 状态。JSON 备份支持合并导入，非破坏性替换。

## 后端 / 安全边界

沿用现有静态 Pages + Worker，无新增部署平台、密钥或数据库实例。`src/workbench.ts` 提供 `/api/workbench/import|discover|semantic|fulltext|rss|repo`；只访问固定公开研究来源，逐跳检查 HTTPS、主机、端口和凭据，限制响应字节数与等待时间。页面只显示转义文本，不执行来源 HTML / JavaScript。RSS 未支持主机可手动录入；不提供任意 URL 代理。

GitHub 卡片展示实时 stars、last push、issues、language、license，并链接 commits / releases / README。论文 claim 与代码实现对照分析留在下一阶段。

## 后续路线图

### Gemini 部署测试

Worker Secret `GEMINI_API_KEY` 保存模型密钥。`/api/workbench/gemini-probe` 是部署诊断接口，当前不属于页面自动提取功能；只接受固定公开样本与选定有免费层的 Flash 模型，不接受用户 prompt、API Key 或来源 URL。

部署提交信息包含 `[gemini-test]` 时，部署流程运行 `scripts/research/gemini-probe.mjs`：生成一个 15 分钟有效的随机诊断凭据，临时设置 `RESEARCH_PROBE_AUTH`，检测 Google 模型列表，尝试全文提取，并测量两篇摘要比较与主题总结。结束后删除临时凭据；删除失败也会自动到期。每个凭据 / 模型 / 测试步骤用 D1 原子 claim 防止重复调用。不进行压力测试，不自动选择付费模型；Worker 不掌握项目账单层级，因此测试应保持 Google 项目为 Free Tier。

结果记录为 GitHub Actions artifact `research-gemini-probe`，仅包含 Token、延迟、JSON / 引用匹配统计及结构化错误，不含 Gemini 密钥、临时凭据或生成全文。比较与主题样本使用两篇摘要，不能当作完整论文比较的耗时或质量测量。正常响应不提供项目官方 RPM / TPM / RPD 上限，必须以 AI Studio 的项目配额为准；429 返回的 quota violations 可帮助定位限制。

第二阶段：Paper → Implementation（架构、组件、依赖、数据、训练、评估、算力、风险、里程碑）、伪代码与 repo 结构 / 配置建议、implementation checklist；GitHub 组件完整性和复现问题；Reproduction（环境、数据、模型、config、目标 / 实际分数、偏差、artifact）；Experiment（hypothesis、method、dataset、model、prompt、config、result、cost、runtime、Git commit、复现 metadata）；RAG Eval（recall、precision、context relevance、correctness、faithfulness、latency、token cost）；Benchmark（task、metric、baseline、model、result、leaderboard、cost、显著性）。

第三阶段：GraphRAG Inspector（entity extraction、candidate nodes、traversal、node score、edges、filtered nodes、vector retrieval、evidence、answer，对比 Vector / Graph / Hybrid）；Agent Evaluation（input、plan、tool calls/results、output、errors；success、selection、arguments、hallucination、recovery、cost、latency）；Failure Mining（embedding、clustering、taxonomy、人工修正、趋势）；Research Memory（semantic / hybrid retrieval、highlights、backlinks、previous experiments）；Weekly Radar（personalized topics、authors/labs watchlist、GitHub trending、arXiv、去重、反馈，每周选 3–5 篇）；Python SDK（log_run、evaluate、trace、compare、dataset、metrics、experiment、artifact）。

技术演进：独立 PostgreSQL / FTS / embeddings、relationship tables；后期按需求 Neo4j，Markdown/PDF reader 与 Python SDK。迁移独立 Next.js/TypeScript 前端和 FastAPI/Node 后端属于后续架构工作；本阶段优先与现有 PT Universe 一致。

不做通用 AI Chat、Zotero 替代、完整 LaTeX Editor / IDE、自己训练 foundation model、大型社交网络或论文投稿系统。

## 验证

```sh
node scripts/research/model-test.mjs
PT_PLAYWRIGHT=/path/to/playwright PT_CHROMIUM=/path/to/chromium node scripts/research/browser-test.cjs
cd workers/pt-universe-api
npm ci
npm run check
node tests/workbench.test.mjs
node tests/todo-sync.test.mjs
npm run types -- --check
npx wrangler deploy --dry-run
```

浏览器测试覆盖导入 / metadata、规则提取、错误证据不能确认、全文替换重置确认、笔记 / 决策、比较与导出、维度刷新后保留、图和主题、关键词搜索、移动端无横向溢出，以及两端加密配对与刷新。WebMCP 注册 `search_research_records` 和 `import_research_paper`，与可见 UI 共用逻辑并验证输入。
