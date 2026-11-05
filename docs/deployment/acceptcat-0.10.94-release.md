# AcceptCat 0.10.94 发布回执

2026-11-05补充更正：下述插件实际安装检查使用新建profile，未覆盖旧GitHub依赖/锁的升级。负责人随后报告0.3.1旧GitHub包离线恢复错误，已用本成品模块重现；这项旧profile兼容性不能称为验收通过。修复使用显式插件名@file替换并增加真实pnpm旧锁回归，见[修复说明](../development/dsh-legacy-plugin-upgrade.md)。已随 [0.10.95](acceptcat-0.10.95-release.md) 发布并通过旧 profile 成品升级检查；0.10.94 资产保留。其余已记录成品/缓存检查范围保持，不把用户问题归因于账号数据。

负责人授权合并PR172、发布新版并内置其更新的科研插件。北京时间 **2026/11/5 12:09:19** 已公开稳定Latest [v0.10.94](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.94)，Release 434767134。没有覆盖旧版资产，没有部署后台、安装或重启负责人真实客户端。

## 源码与成品

- PR172四项检查全成功后普通合并为43e35e7c7b71d54a38ca22ac1e80207b15d9cdd2，完整本地缓存提交f5093f6、同步收尾d12858b保留。
- PR173最终c34238dd1c643471a5c3639948504e7ec9bf641f四项检查全成功后普通合并。实际构建main/tag为 **d574aa5c6a99e1932f0cfd087567c68e5990f8c7**，从重新fetch的该提交完整重建，1650份已跟踪输入前后摘要不变。
- EXE 421224202字节，SHA256 **e103bef308a033f2cd74292ec4cb4136dfd2a55a8ce43b14d3caa08c6cbf5483**。直接提取EXE的app.asar、更新源、插件tgz、tectonic、DSH元数据/运行入口，和本轮win-unpacked逐字节核对；129份构建文件摘要与本轮dist/dist-electron一致，零rcedit残留tmp。
- 成品内完整缓存表research_records、正文/引用记录读写、preload IPC、会话批量transcript-sync代码均存在。旧两态规划组件、样式、重新梳理入口及原任务拆解Skill仍在；原生DSH文件/PDF和模型设置保留。
- 科研插件官方0.4.0资产3083842字节，SHA256 583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585；实际包内package.json为0.4.0，Office helper、预构建lib、Copy的MIT许可与NOTICE齐全。DSH仍0.2.1-rc.3，tectonic仍0.17.0。

## 验证

| 检查 | 实际结果 |
| --- | --- |
| 本机完整根CI | 70文件874项、生产3项、B0和Web生产隔离通过 |
| 客户端 | 双类型、9项构建守卫、79项缓存/相邻回归、41项DSH检查通过；79项内包含17项插件/资源检查 |
| 精确PR源码CI | PR172和PR173各四项成功，含干净Windows NSIS与隔离启动 |
| 合并main CI | Windows打包通过；Foundation首次Windows迁移测试20秒超时，仅该作业在相同源码/阈值重跑后通过，两个Ubuntu作业首次成功 |
| EXE内SQLite模块 | 直接提取实际编译模块，在随包Electron43.8.4的独立进程写入/重开读回正文和引用；账号/服务隔离、撤回压过晚到正文、本地分页/删除通过，禁止网络 |
| 缓存组件界面 | 实际消息/分页组件和SQLite；合成SDK/API/IPC边界及辅助卡片。1280×800、1024×768，40条已读消息在模拟服务503后刷新/上翻：正文API0、旧页SDK0，独立最新页核对1；切账号不串内容，pageerror0 |
| 实际插件加载 | 使用EXE中提取的补装模块和成品DSH，在独立临时home真实离线安装0.4.0；bundle登记/实际版本一致，宿主无skip，匿名文件/截稿接口403，临时有效会话GET files?kind=slides为200/空列表，重复补装不重装 |
| 成品启动与更新 | 隔离profile启动通过，保留既有electron-log初始化告警；版本、EXE SHA512、blockmap、公开GitHub更新源一致 |
| 上传与公开 | 四附件先在草稿核对远端大小/SHA256再公开；匿名Latest、更新清单/校验文件摘要、EXE HEAD/大小核验通过 |

界面检查走独立headless Edge/Playwright（Browser plugin not available），有实际页面标题、内容、交互和截图；React Router既有警告和故意503留存，无框架错误覆盖层。它是合成组件验收，不是私人聊天截图或真实账号验收。插件上游Office实测不替代AcceptCat复杂材料效果，本批没有运行用户Office命令或真实模型。

## 边界

旧版仅缓存指针的消息首次仍要联网补取完整正文。已读内容本地先展示，联网核对更新不阻塞正文；服务器仍承担通信和权限，不能把缓存称为无后台通信。系统级断网冷启动、真实双客户端撤回/状态变化与账号权限由负责人验收。

后台本批只复核公网ready，仍0.42.0、database/storage/authentication全ok、harness not_verified；此前部署源码3aa3030及schema032/113表不变，见[后台回执](chat-transcript-20261104.md)。没有修改AcceptCat角色、Skill或后台提示词；科研插件自己的工具指引随官方0.4.0资产更新。

插件仍沿用上游Windows用户本地资料目录和80MiB的Office上传入口，不改变其数据归属或默认为按AcceptCat账号隔离的云端资料库；已有论文/草稿/文件保留。WPS/Office需用户本机已有。插件补装与更高版本保留的具体范围见[接入说明](../development/research-plugin-0.4.0.md)。

## 失败留证

- 连接器merge/create403：用已有gh账号按明确授权执行，未新建凭据或扩权。
- 新测试初稿跨VM数组原型和同步close事件错误、Error cause选项与现有TS lib不兼容、一次content命令cwd错误：原日志保留，修正后相应检查通过；不放宽期限。
- Windows包工作流首次在旧目录选择夹具失败：旧夹具曾依赖吞掉补装异常；明确隔离插件安装边界，实际补装另由17项行为检查覆盖。PowerShell步骤各自保留失败守卫。
- 临时原生插件探针先过窄预期401而收到正确403，再遗漏kind参数得到400；保留native-staging及native-staging-2日志。最后使用文档化参数和临时有效会话，必须200/空文件列表；没有改插件鉴权代码。
- 首次main Windows旧库迁移测试超过原20秒：保留main-ci-first-failure.log，本机同项785ms通过；只重跑失败Windows作业，同一构建源码和阈值成功，未修改安装包或放宽检查。
- 草稿创建后首次列表查询尚未看到新草稿，保护断言中止；后续按已创建Release ID 434767134恢复并上传，没有重复创建草稿或覆盖旧资产。

Git外证据：D:/deepseek-agent/.runtime/release-0.10.94-20261105。包含完整source/build/CI日志与失败、installer-audit.json、built-assets.json、packaged-cache.json、native-plugin.json、隔离界面截图与请求计数、原始公网/更新文件、四附件远端摘要及发布回执；不将运行数据库、临时会话或构建产物入Git。
