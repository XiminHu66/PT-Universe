# PT Intelligence OS：暂停独立产品路线

日期：2026-10-22。状态：停止扩展独立 OS；保留 PoC、原始本机记录和恢复入口。

## 结论

现阶段没有理由要求用户再维护一个 Today / Inbox / Task / Project / Note 系统。原 proposal 的目标仍然成立，但这个 PoC 把模块齐全当作验收，缺少数据与操作的闭环。上一轮视觉精简没有解决这个问题。

默认入口改为暂停说明和原始数据导出；旧应用仍在 `experiment.html`。不删除、迁移或重写任何本机记录，不修改其他 PT 页面或部署平台。默认页不启动资讯抓取、定时刷新、排序或数据写入；只有主动打开旧实验才运行旧应用。

## 实际重叠与断点

| PoC 功能 | 已有能力 | 代码核查发现 | 取舍 |
| --- | --- | --- | --- |
| Today / Command Center | Daily Nexus 日常入口 | 新入口多了一套 Today 任务状态与选择工作 | 停止新增独立日常入口 |
| Tasks / Projects | Idea Pad 中的 PT Todo 项目树、任务、项目记录、加密同步 | `sources.mjs` 从 IndexedDB 只读映射；`triage.mjs:addToday` 往 PoC entities 创建任务；完成仅写 `pt.intelligence.v1` | 停止发展第二套任务与项目系统 |
| Unified Inbox / Save Later | RSS Orbit 未读、稍后读；Watch Inbox 待处理报告；Research 收集与阅读 | 各自的处理状态没有互通，PoC 归档不会处理原输入 | 停止复制所有信息流 |
| Watch 聚合 | Watch Inbox 已接收带证据、变化、建议下一步的 Muse 报告 | PoC 只读旧 `ptu.decision.monitors`，没有接现有报告 API；不能代表全部当前监视 | 撤销已统一监视工作流的假设 |
| Decision Memory / Notes | Idea Pad 笔记；Research 方法决策；投资工具中的领域记录 | 新记录只存在 PoC，关联仅限已复制的对象；没有原记录检索与稳定跨模块引用 | 停止建设独立笔记与决定库 |
| Daily Brief | 上述工具已管理的任务和信息 | `views.mjs:brief` 截取任务、待处理项和关键词命中信息；没有项目影响分析与跨来源证据整合 | 停止把排序列表作为 intelligence 成果 |
| Global Search | 各模块已有领域搜索 | 只搜已复制到 PoC 的对象，不能搜到所有原始记录和完整研究上下文 | 不继续扩展为假统一搜索 |

Todo 的日期是创建/关闭元数据，不能推断为截止日期。任务存在、项目多日未编辑、股票涨跌达到阈值，都不能单独推断“今天必须做什么”。失败和未连接也不能视为没有变化。

## 重新定义真正的增量

Intelligence 应成为现有模块之间的连接能力，而非新的数据主人。采用各模块原有稳定 ID、权限、加密同步与备份；关系只引用原始对象。需要先建立明确、带版本的读写契约，不从页面展示文本或不兼容的私有缓存猜测状态。

值得验证的最小场景只有一个：

1. 从用户已配置的 Watch Inbox 收到一条真实变化或待处理报告，保留 report/item ID、时间、前后差异与原始证据；失败单独呈现。
2. 用户明确关联现有项目。只有确有依据的关联可以自动建议，不能把兴趣关键词匹配当作项目影响。
3. 在现有 Todo 中创建或关联一项任务。重复处理复用原任务；原应用立即看到同一个对象、同一状态。未知项目或无行动必要时允许直接忽略，不强制转任务。
4. 在原工作流处理任务，留下与证据和项目相连的决定及结果。监视报告中的处理标记也必须能区分已处理、待处理与仅已读。

这是候选方案，尚未实现。它需要扩展现有数据契约；本次保留“不改已有页面和项目”的边界，没有暗中写入原存储。验证通过后再决定放进 Daily Nexus、Watch Inbox 还是项目详情，不预先增加入口。

## 重新立项条件

- 同一个真实案例能完整走通“变化 → 关联项目 → 原任务 → 决定/结果”，中途不复制粘贴或维护第二份对象。
- 原工具与整合视图使用同一状态；重复执行、并发编辑、失败重试和恢复均不会产生重复任务或丢失记录。
- 用户能解释为什么需要关注、证据在哪里、下一步是什么；没有明确项目影响的信息留在原阅读工具。
- 相比当前原工具组合，实测减少页面切换或人工整理；在真实使用前不扩展到第二场景。

不以更多卡片、一次摘要、统一外观、页面数量或 AI 聊天作为验收。Knowledge Graph、Agent、语义搜索和新的基础设施继续不开发。

## 保留与恢复

- PoC 当前文档：`localStorage['pt.intelligence.v1']`；导入前备份：`localStorage['pt.intelligence.v1.backup']`。暂停页只有用户点击导出时读取原始字符串，不解析改写，坏格式记录也可导出。
- 数据仍只在原浏览器/设备中；本次没有上传、同步或迁移它们。导出必须在原来使用实验的浏览器完成。
- 旧 PoC 可继续打开、导出和查看原有记录；它仍有旧的独立状态与原有运行行为，不作为正式工作入口。
- 不清理原工具数据库、不创建新调度任务、不改现有页面，不在 GPT Sites 发布。

## 核查依据

- `apps/pt-intelligence/{model,triage,sources,app,views}.mjs`
- `apps/pt-todo-dashboard/{README.md,model.mjs,storage.mjs,app.mjs}`
- `apps/idea-pad/README.md`
- `apps/watch-inbox/README.md`
- `apps/research-workbench/README.md`
- 根目录 `app.js` 中 Daily Nexus、Idea Pad、RSS Orbit 和 Watch Inbox 的已有入口
