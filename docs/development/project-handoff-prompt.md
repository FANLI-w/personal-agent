# AcceptCat 新 AI 接手 prompt（简版）

更新：2026-10-29。复制以下内容，再补充本轮具体任务。路径替换为自己的独立工作副本；版本快照必须重新核验。完整背景见[项目总览](../project-overview.md)，旧批次交接见[历史记录](collaboration-handoff.md)。

```text
请接手 AcceptCat，并按我随后给出的具体任务继续工作。

主仓库：https://github.com/luoyan96/personal-agent
本机已有独立副本：D:\deepseek-agent\acceptcat-chat-experience
共享桌面开发目录：D:\deepseek-agent\research-agent-platform-chat-integration
不要覆盖共享目录，也不要根据目录名称判断分支归属；先核对 Git 状态和工作树。

先读根 AGENTS.md，再读 CONTRIBUTING.md、docs/project-overview.md、
docs/current-state.md、docs/project-log.md 最新记录、README.md、docs/roadmap.md。
相关细节再按总览链接阅读，不把旧报告中的版本号或“未合并”当成当前事实。

产品先服务中国教师和课题组，Windows 优先，手机暂缓。
消息负责沟通，任务负责分工和验收，工作台是本机 DSH，资料做轻量共享。
保留 DSH 原生模型/推理菜单、文件和 PDF 等预览、工具与插件能力，
围绕科研工作适配，不整体替换成另一个项目，也不擅自安装 AgentTeams 等系统。

本地文件为主：本地工作目录 → 按权限取用共享版本 → DSH 执行 →
用户核对输出 → 选定成果共享归档 → 提交与人工验收。各动作保持独立。
后台仍负责账号/权限/任务/共享记录和模型网关；模型密钥留在既有服务。
群内 Agent 问答和任务中的本地 DSH 是不同执行路径，不声称所有聊天已经本地化。

规则按平台、课题组、项目范围管理，角色和 Skill 不授予权限。
项目首版对应 planId；团队共识需确认并保留版本和来源。
私人记忆不能因加入群或共享任务而泄露；文件、索引、记忆、交接分别处理。
agents/skills、agents/roles 和 packages/contracts 沿各自唯一来源维护。

2026-10-30 核对快照：PR142 已整合129/139/140/141，main 为 ea7350f；
Windows0.10.73 已于 2026-10-29 公开为 Latest，0.10.75 随任务页整合发布；
后台已部署contract0.39/schema031，部署记录随 PR143 合并。
本地聊天历史WIP5536ffc未纳入该主线和包；手机PR90暂缓。
这些只是起点：先fetch核对实际main/PR/Release，并分别核对生产回执与安装版本。

保留已有修改，从主仓库最新main建立本轮独立分支，使用PR交付。
若有关工作仍在其他分支，先说明依赖并保留双方改动，不整文件覆盖。
合并、安装包、公开发布、后台部署分别确认是否已获本轮授权。
不操作用户正在使用的客户端，不自行使用私人资料、账号或模型密钥验收。

根工程pnpm11.21.0，clients/openim独立pnpm10.28.0，遵循冻结锁和构建顺序。
共享代码/方法改动按AGENTS跑根CI，并做相关客户端/交互检查；
纯文档运行check:content和git diff --check即可。
每批更新current-state并追加project-log，记录源码、部署、包、检查和限制。
明确区分工程通过、APK/EXE生成、安装运行、真实业务通过，不能混报。

先简报实际基线、已有未整合工作和本轮范围，然后执行具体任务；
常规实现自行判断，仅在确实缺少账号、设备或决策信息时提问。

本轮具体任务：由我补充。
```
