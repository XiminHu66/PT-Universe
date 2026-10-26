# 最终幻想 共鸣 · 实用攻略手册

静态子项目 `apps/ff-guide/`，由 PT Universe 现有 GitHub Pages 工作流发布。

首页优先展示角色强度、幻兵排行、角色搭配、武器推荐、隐藏路线与刷级六个专题。
九篇中文长攻略覆盖八角色、二十六幻兵、三套整队、分阶段武器、隐藏回访、经验、精通、吉尔与技能组合。
采用紧凑攻略索引和图文正文；首页不展示总结、推荐宣言或重复说明。
角色榜分别保留Game8的SS/S/A与KeenGamer的S/A/B，幻兵榜保留AppMedia的SS/S/A，名单与档级逐源核对。
18张原始攻略地图与截图保存在images/guides/，未裁剪修改；原网址、出处、尺寸与中文图注见original-images.json。
三篇排行榜原网页为HTML表格，本页按原档级显示名单，不把封面或重排表冒充原始节奏榜图片。

`practical.json` 由 `scripts/ff-guide/practical/*.json` 经 `build_practical.py` 合并。网页不在线抓取外站、不依赖翻译或模型API。
新攻略与旧数据分别维护，加载时应用有来源的纠错；原始记录、收藏ID、原文及数值始终保留。
古老弓前置、古老装备进阶试炼及商船章节的来源分歧已明确记录，模仿技能译名已修正。
技能、装备、道具、敌人与地点以中文为主视图，英文仅保留作检索与折叠对照。

## 资料与翻译

- `data.json` 保留全部 2,389 条原始记录、稳定 ID、数值、出处与版本边界。
- 每条 `original` 保留翻译前的展示文本，详情的“中英对照与资料来源”可展开核对。
- 名称按中文攻略和系列惯用语优先统一；其余是本站对照译名，不冒称全量官方简体中文。
- 技能效果、装备被动、道具说明和敌人特性均经过逐句中文翻译；概率、次数与数值保持。
- 同名敌人、技能和地图在列表中集中展示，详情可切换不同原始记录；带加号的升级能力不与基础能力合并。
- 正式版与试玩版资料范围仍明确区分，翻译不改变数据可信范围。

## 使用记录

沿用 `ptu.ffguide.progress` 与 `ptu.ffguide.preferences`；收藏、勾选、笔记和配对设备同步继续有效。
导入仅合并已存在的稳定 ID。无新增后端、端口、密钥或自动抓取任务。

## 更新与校验

```sh
python scripts/ff-guide/import_database.py --cache-dir /tmp/ff-guide-cache --output /tmp/ff-guide-database.json
python scripts/ff-guide/assemble.py --database /tmp/ff-guide-database.json --curated scripts/ff-guide/curated.json --output apps/ff-guide/data.json
python scripts/ff-guide/localize.py
python scripts/ff-guide/build_practical.py
python scripts/ff-guide/validate.py
node --check apps/ff-guide/app.js
```

本地化使用持久术语表与整句翻译缓存，后续更新应先核查新增原文，不能通过关键词替换伪装完整翻译。
原始抓取页不提交。游戏图像归 SQUARE ENIX 等权利人所有，角色立绘取自原 Vorxu 游戏角色资料页，
其余精灵图沿用 ATMA 的原始素材地址。
