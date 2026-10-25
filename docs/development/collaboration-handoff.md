# AcceptCat 新聊天交接 prompt

2026-10-25（北京时间）。协作流程以根目录[CONTRIBUTING.md](../../CONTRIBUTING.md)为准，当前事实以[项目状态](../current-state.md)为准。下方内容可复制到负责人新聊天；外部合作者将本机目录替换为自己的克隆目录，明确本人负责的任务，并按Fork的origin/upstream关系操作。

```text
请接手 AcceptCat 项目，接着处理我随后给出的需求。

工作目录：D:\deepseek-agent\research-agent-platform-chat-integration
主仓库：https://github.com/luoyan96/personal-agent
共同开发基线：主仓库最新 main，已包含聊天、资料/课题组、同组本机资料互传、任务拆解/依赖图、构建修复及PR97/96科研助手交流调整、PR100/99科研同伴与连续规划修复，以及PR104/103/102规划正常回复、同一助手设置和聊天展开（main合并2736ffc）；公开Latest为v0.10.37。

先读取根目录 AGENTS.md，然后读取 CONTRIBUTING.md、docs/current-state.md、docs/project-log.md 最新记录、README.md、docs/roadmap.md 和 docs/development/collaboration-handoff.md。

先核对实际 Git 状态、当前分支、提交和远端；保留已有修改，不执行 hard reset、强推或整文件覆盖。main 已在2026-10-21完成一次性同步，不要重新回到0.10.13或旧协作基线。后续如有其他人提交，以实际远端和交接记录为准，不把本文当成固定最新提交。

产品方向：服务中国教师、科研工作者和实验室团队，优先 Windows 桌面，围绕真实科研任务、师生协作、资料使用和成果审阅持续完善。任务规划和资料 Agent 沿用聊天交互，不随意改回复杂表单向导。

多人合作约定：
1. 我也会继续开发，同事以及以后新增的合作者会同时开发其他功能；每个人使用独立工作目录。
2. 所有新功能从主仓库最新 main 建独立功能分支。合作者优先 Fork：origin 是自己的仓库，upstream 是 luoyan96/personal-agent；先核对远端，不假设 origin 一定是主仓库。
3. 一个分支/PR聚焦一个功能，说明负责人、范围、接口/数据库变化和实际验证情况。共享模块冲突需结合双方意图处理，不能覆盖别人的功能。
4. 完成后推送自己的功能分支，向 luoyan96/personal-agent 的 main 提 PR，由我审阅并决定是否合并。只要求审阅时不要自行合并；我明确要求合并时再整合最新双方改动。
5. 每次新任务获取最新 main 再另开分支，不沿旧功能分支继续堆新需求。
6. 代码合并、安装包制作、公开 Release、后台部署分别记录，不能把其中一项完成说成全部完成。此前同步 main/发布0.10.29的授权已履行，不是以后自动合并或发布的长期授权；按我当前指令推进，不重复询问已明确授权的同一操作。

当前交付事实：
- 最新本机0.10.46候选（PR106已提交，尚未合并）：产品ccbc411dd76d32f4504cf76c261a78a4a4bdf0a4，feature/agent-role-skills从main/fb2150b建立并保留PR105。十类默认角色改由agents/roles的meta/persona/work/SKILL和manifest组织，未来默认角色注册后自动加载；自建/导入沿同一约定，保留用户自改档案与私人偏好。787项根CI/2生产入口、60客户端/双类型及NSIS/更新清单、44份成品角色原文与2入口通过。桌面C:/Users/luo/Desktop/AcceptCat_0.10.46.exe，87,372,525字节，SHA256 b8d2f7b87a4ff6d8b16c2fa4e2d0e315341fd4bdad51abe84ee9d098947585de。配套API/worker需要单独部署；contract0.32/schema026无迁移，仍沿0e78530/7d75165a，没有合main/公开或代做安装/模型/用户体验。新增角色遵循agents/roles/README.md，不再在TS另写默认人设。
- 此前本机0.10.45候选（尚未合main/公开，无需再次部署后台）：从main/fb2150b另开fix/planner-single-task，产品a600ec06e5a01b6755c7511cdda7b81ed26dea18。工作台一个目标默认一项任务，步骤与交付/验收放进说明；用户明确多项才拆。模型多拆时预览与创建用同一份完整单项草案，先editPlan再按版本confirmPlan，丢回执不重复建；已确认旧任务保持。781项根CI/2生产入口、52客户端、双类型及NSIS/更新清单通过；桌面C:/Users/luo/Desktop/AcceptCat_0.10.45.exe，87,408,189字节，SHA256 a33243130a749450a4b7d4c15ed65701a92efd18c6edcfcbb3fa3cf4b459ecd8。性格/私人偏好不覆盖；无API/contract0.32/schema026/后台源码/依赖锁变化，无迁移或新线上操作，沿7d75165a部署。新规则随0.10.45和客户端内置方法生效，不自动替换服务器canonical或私人Skill。实际体验未代验，见docs/deployment/acceptcat-0.10.45.md及docs/development/planner-single-task.md，证据D:/deepseek-agent/.runtime/planner-single-task-20261025。
- 上一版本本机0.10.44候选/PR104（已合main、未公开，配套0.32后台已上线）：从main/c971d9c新建fix/planner-reply-return并普通merge PR103/2539030，产品0e78530f6a6a00354474d82ee1df3ec927c0e383。规划每轮真实答复与可选草案分开，普通交流不改计划，右上为浅绿细边框“← 返回工作台”；保留助手档案/私人偏好、任务确认与旧历史。781项根CI/2生产入口、38客户端、双类型及NSIS/更新清单通过，桌面C:/Users/luo/Desktop/AcceptCat_0.10.44.exe，87,405,873字节，SHA256 8e620823ee852ebce19f93e7e0060942cd19a8fcf8fd419ff315382baa3ddfd5。contract0.32新增可选模式/回复字段，不插入默认值；reply.message读取时投影，持久0.31回复结构保持，无schema026迁移。配套后台已按本批授权于2026-10-25 12:39:44上线0e78530/7d75165a、contract0.32/schema026；82项服务器隔离、停写备份/独立恢复、103表/7原件和21配置保全及健康通过。PR104/bc29c54四项GitHub检查全success后，于2026-10-25 16:55:51以merge commit 2736ffcfabcf10c45e1118f4443afe5c29bc606b合main，PR103/102于16:55:53自动MERGED，合并树与受审head相同；main新运行另计。实际体验未代验。见docs/deployment/acceptcat-0.10.44.md和docs/development/planning-conversation-replies.md，证据D:/deepseek-agent/.runtime/planner-reply-return-20261025。
- 上一版本本机0.10.43候选（PR103已随PR104合main、未公开，配套后台已上线）：从main/c971d9c另开feature/unified-colleague-agents，普通merge PR102/fbc462a，产品b16cbd610b16d6b07aeed2708579d19e2233b05f。规划复用本人研究方案助手的档案/私人偏好，普通聊天、规划、资料页共用助手设置；保留自改档案及任务确认/版本，明确偏好保存不调用模型。新contract0.31.0可选colleague引用及摘要校验，无schema026迁移；配套后台已按本批授权于2026-10-25 00:24:38上线b16cbd6/de6dce92、contract0.31/schema026，统一规划配套现已生效。776项根CI/2生产入口、36客户端、双类型及NSIS通过；桌面C:/Users/luo/Desktop/AcceptCat_0.10.43.exe，87,407,785字节，SHA256 47d9a9d2848ac0a1e6d0d210e4dcaf9eca20c8fc1b0d5765230c2ce6e3df7fd1。77项服务器隔离、停写备份/独立恢复与健康检查通过，103表/7原件及20配置保持；PR103/ef458eb四项GitHub检查success，实际体验未代验。见docs/deployment/acceptcat-0.10.43.md、docs/development/unified-agent-colleagues.md，证据D:/deepseek-agent/.runtime/unified-colleague-agents-20261024。
- 上一版本本机0.10.42候选（PR102已随PR104合main、未公开）：从main/c971d9c新建fix/planning-chat-expand，产品e87ebe2deb78fa10906a3d5fb6312b0a9ef01b64。底部规划聊天展开占满工作台内容区，绿色白箭头按钮收起恢复任务页，迟到回执不强行再展开。客户端类型/28项规划检查、Windows包和更新清单通过；桌面C:/Users/luo/Desktop/AcceptCat_0.10.42.exe，87,409,277字节，SHA256 077070b5152a6d472f6482841cdf77e017509450c2d4c3fa742e4410109c47cf，旧包保留，未代安装/浏览器/真实模型验收。仅客户端变化，无API/数据库/锁变化或后台部署，原后台5293eba/367367ea保持。见docs/deployment/acceptcat-0.10.42.md，证据D:/deepseek-agent/.runtime/planning-chat-expand-20261024。
- 上一版本本机0.10.41/PR100已合main、未公开Release：feature/research-colleague从main/89c987c新建后普通merge PR99/05ebf3a，产品5293eba94d2133f8624628084351ad1f06cd7bfe。2026-10-24 22:53:29以merge commit b73edfc3d91480c4031f87fed1c9698f4a452f59合入main，PR99于22:53:31自动MERGED；受审head3d3bb02四项检查success，合并树相同，双方历史保留。七个助手有场景判断/接话示例，规划/拆解先判断证据价值；明确本人指令保存该助手私人交流偏好，复用版本/修订/撤回与幂等，不调用模型或跨角色/账号/公开档案。772项根CI/2生产入口、32客户端、双类型与NSIS/更新清单通过，初稿长输入/旧预算失败压缩重复规则后通过并保留。桌面C:\Users\luo\Desktop\AcceptCat_0.10.41.exe，87,410,682字节，SHA256 ae8f3bc1a60a4dac27b439e25de5ee71202f9b8f19b59b579e304093db618b1e，旧包保留，未代安装/真实模型验收。配套后台已按本批授权于2026-10-24 21:03:08上线367367ea，73项隔离、备份/独立恢复及健康通过，无迁移；详见下方后台项。head5b414a7四项GitHub最终success，Windows原既有用例超时/原时限单独复核及失败job复跑记录保留。见docs/deployment/acceptcat-0.10.41.md与docs/development/research-colleague.md，证据D:/deepseek-agent/.runtime/research-colleague-20261024。
- 本机候选0.10.40与PR99（已随PR100合main、未公开Release）：从main/89c987c另开fix/planning-reply-validation，产品b232296fb10e3484959b628aa47c087d5fbf35e6，修复完整Plan/精简输入混用及空日程边界，保留权限/明确日期/版本校验；规划失败原子回滚、无正文诊断，界面显式原话重试，兼容旧失败缓存。769项根CI/2生产入口、13 API定向、28客户端、双类型和NSIS通过。桌面C:\Users\luo\Desktop\AcceptCat_0.10.40.exe，87,408,408字节，SHA256 7bfdc1d4f3b248d379dbdaeea2828851a4ba41b47142929646c869c98ebfc8c7，旧包保留，未代安装或真实模型验收。Workbench重新连接后，29项服务器隔离、备份/独立恢复及健康检查通过，配套后台已于2026-10-24 17:42:10上线620bc025（详见下方后台项）；没有自动重放失败请求，不声称原真实返回的具体错误字段已还原。见docs/deployment/acceptcat-0.10.40.md，证据D:/deepseek-agent/.runtime/planning-reply-validation-20261024。
- 本机0.10.39候选与PR97（含PR96）已按本人明确指令合入main：2026-10-24 16:48:58 merge commit a08a63a87ea3cf2e561c20197259bf2a60cafa08，PR96随之自动标记MERGED；受审head6d4df11四项GitHub检查成功，合并树相同，双方作者/历史保持。产品e48852eda15e8512ef59ce3c9ddae1f8c2e1a6a6，七个内置助手、十一个canonical方法和任务全流程统一低负担交流，角色化跟进、旧模板复用/用户编辑保持。桌面C:\Users\luo\Desktop\AcceptCat_0.10.39.exe，87,409,143字节，SHA256 70340836adade67025d5572411389b7c17ef54e23cf256e0bfc016b81f19fa24。762项根CI/2生产入口、71客户端、双类型和NSIS/更新清单通过；保留初稿预算失败并在原上限内压缩规则。日常聊天等后台系统规则已按本人单独授权于16:23:50上线7fa2e86e；桌面界面/规划与模板仍需使用0.10.39候选，尚未公开Release。无接口/数据库/锁变化，未代安装/界面/真实模型验收。见docs/deployment/acceptcat-0.10.39.md、docs/deployment/agent-conversation-20261024.md及docs/development/agent-conversation-flow.md。
- main已按本人指令以merge commit合入PR89、PR91、整合PR94、PR97、PR100及PR104；PR104/2736ffc包含PR103/102，PR100/b73edfc包含PR99，PR94提交8dba29fb6715269ff3ef0bee5f26867f5ae3d050包含FANLI-w的PR92与PR93，PR97/a08a63a包含PR96，原PR均自动MERGED，保留同事PR86及双方原作者。公开Latest为v0.10.37，标签固定8dba29f；main后续可有文档提交，开始前仍需fetch实际最新状态。
- 上次公开安装包（桌面仍保留）：C:\Users\luo\Desktop\AcceptCat_0.10.37.exe；公开页：https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37 。87,410,751字节，SHA256 ecc17405bb3bf5e12ee7a28e934668dbce039b05ffbcc6482f3a2ae8d9529225；四附件与未登录更新清单已核对。后续是否仍是最新版须按实际状态确认。
- 同组原件互传：PR91已合main，产品09ffb44的目录授权、聊天索取、WebRTC直传和本机原件打开现已随0.10.37公开；配套contract0.30/schema026保持，本次后台交流规则升级没有迁移或扩大资料权限。双方须在线且切同组，每份10MiB，无TURN/云原件兜底；实际双机与安装体验由本人检查。
- 构建与任务拆解：公开0.10.37产品4c6ea18统一两共享包先构建、link依赖及工具链/成品守卫，并接入任务拆解Skill/依赖图；根desktop:win命令见CONTRIBUTING。762项根CI、36客户端定向、双类型与受审head d4eb38e四项GitHub检查通过。桌面prompt加载新方法；后续11个canonical方法已随2026-10-24后台交流规则升级上线，不覆盖已安装私人版本。未代安装或真实模型验收，NSIS关闭循环未复现。详情见docs/deployment/acceptcat-0.10.37.md及docs/deployment/agent-conversation-20261024.md。
- 原有聊天交互、独立资料页、飞书库打开/明确共享、自助课题组创建/已有账号邀请接受均保持，任务规划和资料Agent继续聊天交互。负责人确认旧附件0.10.35为同事干净构建成功样本，勿列为已确认坏包。
- 已部署后台为contract0.32/schema026、DSH0.2.1-rc.2/Cordis4.0.5，产品0e78530叠加已校验de6dce92生产基线，新镜像7d75165a49a586e8c45b0045b31df172481325a7604fe8fe6a6aaa3a281ebbfa。2026-10-25 12:39:24—12:39:44完成停写备份、独立恢复及API/worker切换，82项Linux隔离、103表/7原件及21配置输入保全、两服务/公网健康通过，运营种子摘要与其他6服务保持，无迁移。见docs/deployment/acceptcat-0.10.44.md；历史统一档案部署见0.10.43。广场每日同步仍关闭，GITHUB_CATALOG_SYNC=0。回退旧de6dce92前停止新服务并取消活动replyMode=conversation规划、提升fence及保留用量，旧colleague规划和已完成记录保持，再配对恢复；禁止回灌旧DB覆盖后续写入。未用私人资料或真实模型验收交流质量。

尚未完成及边界：
- 他人注册新账号超时根因尚未确认，仍待对方设备的具体错误、安装版本和同机连接信息；不能宣布已修复。
- 课题组已支持同账号创建、已有账号邀请接受、邀请码确认加入、成员查看/普通成员移除退出与多组切换；每人最多负责一组，负责人交接/解散仍需维护者处理，未完成任务发起/审阅职责须先完成或取消。好友/群聊不自动授予课题组权限。
- 飞书应用仍仅罗岩本人试点，安装新版或加入课题组不会自动开放飞书应用、共享私人论文库或其他资料权限。
- 我此前要求功能体验和安装后检查由我自己进行，不要主动展开额外的界面、安装包载荷、原生启动或真实账号验收；后续按我的新指令调整。已执行与未执行的验证必须如实区分，不能用构建成功代替功能验收。
- API Key、App Secret、用户材料、运行数据库、构建产物与验收证据保留Git外，不复制入仓库或交接prompt。

每批完成更新docs/current-state.md并追加docs/project-log.md，记录提交、PR、打包/部署/发布状态与剩余事项。先简要汇报当前基线、已完成、未完成和风险，然后根据我接下来给出的具体需求继续开发，不自行选择其他功能或扩大任务范围。
```
