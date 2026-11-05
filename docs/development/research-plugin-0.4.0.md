# AcceptCat内置科研插件0.4.0

2026-11-05，负责人要求将已更新的科研插件与PR172聊天缓存一起发布。**已随公开0.10.94交付**，成品实际安装/加载与边界见[发布回执](../deployment/acceptcat-0.10.94-release.md)；本文说明客户端接入。

## 固定来源

- [luoyan96/dsh-research-workbench v0.4.0](https://github.com/luoyan96/dsh-research-workbench/releases/tag/v0.4.0)，tag实际指向4572c4b3ef9c02fd818ff01bc6cb0680d357803b。
- 资产dsh-research-workbench-0.4.0.tgz，3083842字节，SHA256 `583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585`，与GitHub资产digest和SHA256SUMS核对。
- 仍配套固定DSH0.2.1-rc.3，tectonic0.17.0；不改变AcceptCat模型网关、模型设置或原生文件/PDF预览。
- 插件包含预构建lib、Office helper和上游许可。安装到本机profile后不需要用户构建插件，也不要求本机Node/pnpm。文件流程需要可用的Windows WPS/Office，不能声称仅装AcceptCat就自带Office。

## 升级和保留

安装器包含固定tgz。沿用现有AcceptCat启动补装适配：在自有DSH子进程启动前，通过DSH内置pnpm从本地tgz离线安装，pnpm管理依赖和锁文件；仅在现有bundle列表中补插件名。这个既有适配尚不是原生pluginManager.installBundle桥接，不应在文案中称已完成该桥接。新插件自己的独立更新使用原生pluginManager，后续宿主桥接另行安排。

- 缺失或比0.4.0旧才补装；已装更高版本不降级，包括0.5.0-rc及1.x。无法解析/损坏的版本不擅自替换。
- 安装命令成功后必须读取node_modules实际版本，防止锁文件/旧目录导致假成功；失败反馈真实错误，不能吞掉后称安装完成。
- 已运行的DSH不在再次打开页面时被替换依赖；首次生成profile后先停止自有DSH子进程，再补装并重启，避免Office或编译运行中换代码。
- 保留其他插件、profile设置、论文、旧结构化草稿和原始文件。不会接触负责人正在使用的profile，所有验收使用独立临时home。

0.4.0本身提供Office/WPS文件工作区、原生会话编辑、实际页面预览、论文编译恢复、插件独立更新。它自己对Office上传设置80MiB上限；这不是AcceptCat本地文件读取或共享资料上限，本批不擅改上游资产。与科研项目1–300MB文件范围的差异明确保留，不能宣传全部文件都能在插件上传入口使用。

## 检查范围

新增补装定向测试覆盖缺失、旧版、同版、较高版本、预发布、安装返回成功但实际仍旧版、命令失败、损坏版本及配置保留；纳入Windows工作流。打包守卫校验已有tgz文件摘要，不能因文件存在而绕过固定校验。还须从最终EXE提取tgz核对同一摘要，并在隔离profile检查真实安装版本与DSH加载。

插件上游WPS实测是其发布证据，不能替代AcceptCat成品测试；本批不动真实研究材料、不调用私人模型、不操作用户Office会话。复杂材料编辑质量和真实账号体验由负责人验收。验收日志、临时profile和构建输出保存在Git外`D:/deepseek-agent/.runtime/release-0.10.94-20261105`。

已有[旧交接](dsh-plugin-handoff.md)描述0.3.3当时状态，并提出完整installBundle桥接目标；本次只升级固定内置包、消除降级和假成功，不将旧规划称为已经完成。
