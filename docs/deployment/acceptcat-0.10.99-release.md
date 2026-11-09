# AcceptCat 0.10.99 发布回执

后续状态：2026-11-09 18:43:55，配套后台已另行部署至0.45/034，见[后台回执](constitution-library-20261109.md)。下文“未部署”描述客户端公开时的状态，安装包与tag保持。

北京时间 2026-11-09T18:24:53+08:00，Windows **0.10.99** 已公开发布并设为 Latest：[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.99)。固定源码/tag 为 main **cc04d955dd03d3cf3a79ee1458f5b7d0e8088877**；PR #190、#191 经审核修复后通过整合 PR #192 合并，保留双方提交历史。

本地安装包：`D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.99\AcceptCat_0.10.99.exe`；桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.99.exe`。两份均为 421231162 字节，SHA256 `f96a2ff571df434f385db8ddaa3af391947b0735bd4662f8edc5255941102f75`。四附件为 EXE、blockmap、latest.yml、SHA256SUMS.txt，远端大小/digest 与本机一致，匿名 Latest、小文件字节和 EXE HEAD 已核对。0.10.98 原资产保留。

## 本批内容与审核修复

- 团队资料按项目树、文件表格、详情及紧凑助手组织。Git 管小正文、目录、版本和待审更新；大原件复用本地/共享服务，选择任务后明确取用，记录 commit/哈希。没有自动替人合并或发布资料。
- 规则框架覆盖服务端聊天/规划及本机工作台；保留同事的分层、预算和人审核思路。项目规则隔离，个人规则只随本人；共享个人任务不携带私人规则。
- 修复个人规则修改成重复新建、切账号草稿与晚到结果、幂等重试、方法来源/类型/审核。来源选择本人承接完成的任务，修订保持来源，提供可点击来源任务。
- 生效规则超限明确失败，不静默移除规则继续调用模型。服务端和本机使用共同装配器，任务区分当前可用与上轮真实带入回执。
- 旧客户端按 layers-v1 能力协商接收原格式；不新增第二份数据或替代现有 ACL。权限表骨架尚未接管所有接口，不能据此声称完整全软件权限引擎已完成。
- 保留 DSH 原生文件/PDF 能力、模型设置、既有角色和 Skill 内容、本地优先聊天缓存与截图。DSH 0.2.1-rc.3、科研插件 0.4.0、Tectonic 0.17.0 固定版本不变。

## 验证

PR 最终 HEAD 四项检查及固定 main 四项检查成功；本地根 CI 76 文件 / 917 项，另生产 CLI 3 项、B0 进程和 Web 生产检查通过。客户端双类型、工作流所列回归脚本、构建通过；定向 API/规则 38 项、契约/基础 281 项与 DSH 回归存在交集，不能相加当独立覆盖数。

Edge 实际 React 组件连接隔离 SQLite/API，以合成账号验证个人规则 v1→v2 仍一条、会话更新清未保存草稿；可复用方法选择已完成来源、修订保持来源并升 v2。资料 Git 工作区之前的公开示例/原生桥/任务素材与权限隔离验证保留，详见开发说明及 design-qa.md。

冻结 1703 份源码输入，从最终 EXE 提取 8 项载荷并与 win-unpacked 核对，134 份构建文件逐字节一致；规则/资料入口、原生 CJS 及共同装配逻辑存在，旧格式上下文默认值可解析。直接调用 EXE 提取的模块验证个人规则/方法、问候与超预算失败。实际成品 Electron 的空 profile 启动和更新清单通过。EXE 提取的 SQLite 缓存模块使用成品 Electron、独立进程、禁网验证完整正文/引用、账号服务隔离、撤回及分页；没有调用生产账号。

## 后台与迁移边界

**本次没有部署后台。** 公网只读 ready 实测仍为 contract **0.43.0**，database/storage/authentication 全 ok，harness 为 not_verified。schema032 沿上批部署回执，未清库或新建账号。

新功能要求配套 **0.45.0 / schema034**：033-team-library-repository，034-personal-work-rules；隔离重复迁移为34条/116表（含 schema_migrations），历史001–032未改。客户端连接旧后台保留旧入口，新能力按门槛开放。部署另行按原完整 Compose 链、停写一致备份、恢复副本迁移两次再正式切换，保留现网025历史字节处理；不要改 schema_migrations。旧镜像不认识新迁移，不能直接切回；优先兼容前滚。

## 失败、警告及待验收

保留初轮类型/合成夹具失败、客户端旧文案断言、VM 缺 TextEncoder、合成模型开关遗漏等日志，修复后复查；界面热更新曾有一处括号笔误造成空白，已修正、类型及实际页面重新通过。最后一次 push 未触发 Actions，通过关闭并立即重开 PR 触发相同 HEAD 的完整检查，没有跳过测试。先前取消的过时 CI 保留记录。构建保留既有 Vite/React/Actions 警告；成品启动有与0.10.98相同的 electron-log 重复 preload 初始化提示，随后明确 ready 且稳定退出检查通过，不宣称零警告。

没有真实模型、私人材料或真实双机验收；实验室私有仓库权限、1–300 MB PPT、真实任务和多人使用由负责人安装后验收。Git 只管理资料版本，不授予权限，仓库里的说明不能自动覆盖生效规则。

Git 外证据：`D:/deepseek-agent/.runtime/release-0.10.99-20261109`，主要文件 build-source.json、integration-validation.json、ui-result.json、windows-build.log、installer-audit.json、packaged-cache.json、electron-smoke.log、main-ci-final.json、release-public-verified.json、anonymous-verification.json。审核说明见 [规则与资料整合](../development/constitution-library-integration.md)及[团队资料开发说明](../development/team-library-git.md)。本回执在公开核验后通过纯文档 PR 补入，tag 保持真实构建提交。
