# 课题组资料与素材库调研（2026-10-20）

## 范围与状态

用户要求先调查他人方案，再说明论文/代码、论文写作、专利、已获批项目申请书、PPT素材如何组织，以及自建/复用、技术路线和成本。本批仅官方文档、许可文本与现有代码的对照研究；以下为候选建议，不代表用户已确认产品范围或功能已实现。

实际基线 `release/acceptcat-0.10.19` / `69d8822ee1d2f027b949bf030c6ec6fa0887e0b7`，开始时工作区干净。本调研没有改产品代码、依赖、安装包、数据库、服务器、公开目录或Release；未使用私人材料、模型Key或真实模型请求。未部署候选工具，未做真实科研语料的解析质量或负载评测。调研当时Key预览部署尚待单独答复；随后用户明确同意，该接口于同日独立部署，准确生产状态见[后续部署记录](../deployment/key-preview-20261020.md)，不能把这次部署计为资料库新方案实现。

## 现有实现核对

- `packages/contracts/src/research-library.ts`：集合范围包含owner_private/task_scoped/lab_shared/public，文件元数据有题名、作者、年份、DOI、标签和备注；不可变版本、SHA256和页/字符引用、本人Agent绑定已有。
- `apps/api/src/research-library.ts`：SQLite元数据/提取页与服务器blob原件，单原件10MiB；PDF/TXT/Markdown/CSV提取，其他格式仅原件；按当前授权先过滤，再关键词排序，未接语义索引或OCR。
- Zotero适配目前只将用户选中的个人库条目元数据/摘要导入TXT；没有同步团队文献全文、附件、笔记或批注。见 `zotero-local-library.md`。
- 尚无统一科研条目与多附件关系、领域状态/模板适用版本、PPT缩略图、完整Office解析、资料复用统计、模板到任务成果的完整归档闭环。原件版本与基础权限不能称为这些功能完成。

## 对照来源与可借鉴做法

以下均于2026-10-20阅读官方文档或维护方仓库；网页与main分支会变化，正式选型仍须固定发布版本并核对各模型/依赖许可。

| 系统 | 官方依据 | 对AcceptCat的启发与边界 |
| --- | --- | --- |
| Zotero | [Collections and Tags](https://www.zotero.org/support/collections_and_tags)、[Related Items](https://www.zotero.org/support/related)、[Groups](https://www.zotero.org/support/groups) | 同一条目可处于多个集合；集合、标签、关联分开，组库独立于个人库。保留其文献/引用能力，AcceptCat维护业务关联；跨库条目并非自动同一副本。 |
| 飞书 | [知识库组织](https://www.feishu.cn/hc/zh-CN/articles/807073676453-飞书知识库-构建企业与个人的专属智库)、[权限](https://www.feishu.cn/hc/zh-CN/articles/821998241087-快速了解知识库权限) | 内容导航与企业/知识库/页面权限分层。适合已有飞书团队直接使用；外部文档链接不等于AcceptCat已获准读取全文或同步权限。 |
| eLabFTW | [Resources](https://doc.elabftw.net/docs/usage/user-guide/resources/)、[Templates](https://doc.elabftw.net/docs/usage/user-guide/templates/) | 资源分类、模板和科研记录分别建模，通过链接复用；模板与实例可以使用不同权限。借鉴数据模型，不引入本轮不需要的完整实验室管理系统。 |
| openBIS | [Data Modelling，20.10.12-plus文档](https://openbis.readthedocs.io/en/20.10.12-plus/user-documentation/advance-features/openbis-data-modelling.html) | 项目、集合、对象、数据集分层，并可有多对多关联。本次阅读的是指定历史文档，仅作模型参考，不据此断言最新部署要求。 |
| Nextcloud | [版本控制](https://docs.nextcloud.com/server/latest/user_manual/en/files/version_control.html) | 文件历史/恢复是单独成熟能力；用户文件版本和科研业务状态应分开。所读latest文档标有upcoming版本，不锁定任何具体版本行为。 |
| Dify | [文档元数据](https://docs.dify.ai/en/cloud/use-dify/knowledge/metadata)、[实际LICENSE](https://raw.githubusercontent.com/langgenius/dify/main/LICENSE) | 可借鉴文档切块、元数据过滤和检索。LICENSE有多租户与前端标识的附加条件，不能笼统视为标准Apache-2.0；采用方式须逐项核对。检索引擎不替代课题组成员和任务授权。 |
| RAGFlow | [维护方README与LICENSE入口](https://github.com/infiniflow/ragflow) | 可作为复杂文档解析/检索候选；官方当前README起步推荐4核、16GB、50GB，实际随负载变化。不是AcceptCat试测数据，也不代表所有RAG方案要求该配置。整套服务会带来额外运行组件与权限适配。 |
| Docling | [支持格式](https://docling-project.github.io/docling/usage/supported_formats/)、[仓库](https://github.com/docling-project/docling) | 优先做PDF/DOCX/PPTX结构解析的可替换候选，支持OCR和本地执行；旧DOC/PPT依赖LibreOffice。代码MIT不代表所选模型/所有依赖自动相同许可。中文双栏、公式、表格、扫描件和PPT视觉必须另测。 |

另查 [SQLite FTS5](https://www.sqlite.org/fts5.html)、[pgvector混合检索](https://github.com/pgvector/pgvector#hybrid-search)、[阿里云OSS版本控制](https://help.aliyun.com/zh/oss/user-guide/overview-78/)。全文索引、向量索引、对象版本均是组件，不提供完整科研资料治理。

## 建议的产品模型

保留工作台“资料与素材库”入口。按课题组/个人可见范围切换，主分类为论文与文献、代码与数据、专利、项目申报、汇报与PPT、方法与写作。另用“模板/案例/方法/正式成果”等用途筛选，并区分本组成果与外部参考；分类与用途不建成互相复制的多套文件夹。

核心为资料条目、多附件、不可变文件版本、条目关系、专题引用与任务引用。一个条目可有PDF、Word/LaTeX、补充材料和外部代码仓库；可进入多个专题，跨权限展示仍逐项鉴权。论文关联代码仓库及固定commit、环境/复现说明；发表和复现状态分别记录。项目关联申请书、获批证据、通知、预算和总结；申报/获批/结题区分。专利区分交底、申请、公开、授权及相应文件。PPT保留可编辑原件，后续按页建立缩略图、文字、用途与出处，不声称提取文字等于理解版式。

模板记录适用年份、机构/资助方/期刊、来源、维护人及推荐版本；正式案例与通用空模板分开。用户只需少量基本字段，AI可以提出分类和关系建议，不能推断“已获批/已发表/已授权”。领域状态由有权限的人及相应证据确认。

素材来源分三路：团队主动贡献且确认可共享的真实案例；官方指南/模板及有明确许可的公共素材；团队自行沉淀并审阅的方法。公开可下载不自动等于可打包再分发，许可不明则保留出处链接。本组案例可制作脱敏共享副本，保留其与原件的关联。系统交付的是组织和复用能力，不能承诺自动填满某课题组的历史申请书与内部成果。

候选闭环：老师/学生上传或选入 → 核对分类/范围 → 在任务中引用明确资料版本 → Agent按当前权限读获准片段并给出定位 → 生成新任务材料 → 老师审阅 → 明确选入团队案例/成果库。模板实例不覆盖模板，任务验收不自动授予全组共享；未加入课题组不读取其资料。

## 建议技术边界与实施顺序

自建AcceptCat的科研条目、关系、权限、模板复用和任务闭环；复用存储、解析与检索组件。已有Zotero/飞书/NAS继续保留，第一步支持明确选入/外链和来源标识；双向同步与统一登录另估。不另造Office多人编辑、网盘同步客户端或Git托管服务。

1. 当前React/Electron与TypeScript API保持；第一批沿用SQLite，补条目/附件/关系/筛选和迁移。FTS5是关键词索引候选，需显式中文分词、索引更新、撤权和短查询评测，不能认为默认unicode61已解决中文检索。
2. 原件使用存储适配层，当前blob可兼容，生产候选阿里云OSS私有Bucket，文件和缩略图分开；权限以AcceptCat为准，对象存储版本不替代业务版本/备份。较大文件分片/直传、配额和清理须设计后实现，当前10MiB不能简单放大。
3. 现有worker旁增加隔离解析任务，Docling/必要的LibreOffice和中文OCR作为服务器可替换服务；展示排队/已解析/失败/仅原件及重试，避免阻塞聊天与任务API。先部署在受控Linux服务侧，不要求每位Windows用户安装Python/Docker。原生预览与中文字体还需验证。
4. 第一批先做好可见范围、字段和关键词检索。语义阶段采用关键词+向量的混合检索候选；若迁移到PostgreSQL，可用pgvector减少独立搜索服务。当前大量SQLite SQL与迁移需单独评估，不能当成安装一个插件即可切库。不在首批同时引入多种向量数据库、图数据库或整套RAG平台。
5. 原件、文字、缩略图、索引、缓存和Agent回答均按同一授权策略处理；搜索候选阶段过滤权限，引用返回前复核；撤回后停止后续检索。外部模型读取前仍需明确材料范围，不能默认全库可传。

工作量仅为工程估算：按10–30人试点、约5000份以PDF/DOCX/PPTX为主的资料、复用现有账号任务与资料API，第一批“分类/多附件/基础预览/版本权限/任务引用”约6–10人周；语义检索、复杂OCR和资料辅助整理另约6–10人周。两名熟悉项目的工程人员第一批约4–6周，包含联调回归，真实导入清理、现有并行工作、采购与服务器变更可延长；正式承诺前先做小样本验证。完整在线Office、双向同步或大型实验数据管理会明显扩大到持续项目。

下一步候选是20–50份获准样本和约30个真实找资料问题，衡量分类负担、原件/版本可回溯、中文/扫描/PPT解析、查找正确性与权限隔离，记录解析耗时/资源后再决定检索引擎和硬件。本批未读取这些样本、未运行此评测。
