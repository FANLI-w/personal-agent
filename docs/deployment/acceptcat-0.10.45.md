# Windows 0.10.45：一项科研要求默认一项任务

2026-10-25，北京时间。负责人要求修复工作台将一个要求拆成七项独立任务的逻辑。从干净main/fb2150b核对origin主仓库并fetch后，另开fix/planner-single-task；产品 **a600ec06e5a01b6755c7511cdda7b81ed26dea18**。保留main中的同事聊天、资料/课题组、助手设置和展开布局，没有回到旧分支或覆盖他人修改。

## 改动与规则位置

目标足够表达时直接整理一项待确认任务，内部执行步骤、交付和检查写入任务说明，缺材料或日期可后续补。只有明确要求分别创建或主动选择多项时才分开安排；普通对象数量、引用、疑问、抱怨和模型自己的拆解不自动切多项。界面默认“创建这项任务”，内部说明折叠可读。

planningPrompt与canonical task-decomposition规定任务单位；plannerTaskInput保留原步骤内容并做单项转换，createPlannerTasks确认实际一项草案和版本；PlanningAgent负责同一预览、明确选择与真实回执。[设计与完整边界](../development/planner-single-task.md)。没有修改或覆盖用户编辑过的联系人性格/私人记忆，性格不能改变创建规则。

不同分工、公共Agent/执行预算、资料授权、冲突日程、原图错误或超出说明容量时拒绝直接合并，不截内容、不擅改权限/日期。已确认旧任务按实际数量和日期读取；旧多项待确认写入不能直接续建，先重新审阅；若此前已经成功，只找回原链接。确认前按原版本读取，合并和日期编辑后用精确新版本确认，沿用既有幂等机制。

## 实际检查与安装包

冻结根依赖准备通过；完整根CI **781项/60文件**、2生产CLI/HTTP、B0/生产边界通过。客户端 **52项**覆盖单/多项选择、七步内容保留、日期/图/授权/容量、旧缓存、回执和原模板行为。2项真实本机HTTP/SQLite合成账号用当前编译0.32 API验证：七步草案在editPlan或confirmPlan回执丢失后均只有 **1项任务、1份分工**，版本和内容与单项预览一致；不调用模型或线上服务。清理临时目录增加resolved绝对路径/前缀守卫后仅复核这2项，通过，未重复根CI。renderer/Electron双类型通过。

首次renderer检查发现JSX回调中的预览变量未收窄（TS18048），修正后最终通过；原失败日志保留，没有放宽类型或测试。Node模块类型、Vite/Ant Design等既有构建警告保留，未为消警更换工具链或依赖。

根desktop:win按根冻结安装→contracts与research-skills均构建→客户端冻结安装→固定工具链→生产Web/4SDK/55运行包→NSIS/成品4入口执行通过；更新清单核对通过。桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.45.exe**，**87,408,189字节**，SHA256 **a33243130a749450a4b7d4c15ed65701a92efd18c6edcfcbb3fa3cf4b459ecd8**；复制摘要一致，旧版本包保留。没有代安装/启动、浏览器产品、真实账号/材料/模型或双机体验验收；[语言情境](../../evaluations/fixtures/planner-single-task.md)未实跑，不把合成结构检查称为自然交流质量通过。

Git外证据 **D:/deepseek-agent/.runtime/planner-single-task-20261025**包含原类型失败、根CI、52项客户端、2项HTTP复核、双类型、打包、更新清单及delivery.json。生成文件、运行SQLite和材料不进入Git。

## 源码、后台与公开发布分别记录

本批仅客户端与打包方法变化；沿用planRequest/getPlan/editPlan/confirmPlan/planTasks，contract **0.32.0**、schema026和后台源码未改，依赖与锁不变，无迁移。当前已部署0e78530/7d75165a后台兼容，无需再次升级；没有本批线上操作、健康探测或回退。新规则随0.10.45客户端和内置方法原文生效，服务器canonical方法及已安装私人Skill不会自动替换。

分支fix/planner-single-task目标main，尚未合并；安装包为本机候选，0.10.45未公开Release，重新读取公开Latest仍 **v0.10.37**。注册超时未定因、飞书本人试点、广场同步关闭、原件在线/10MiB/无TURN与本机规划历史等边界保持。
