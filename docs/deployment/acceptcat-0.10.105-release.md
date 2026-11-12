# AcceptCat 0.10.105 发布回执

北京时间 **2026-11-13T00:09:48+08:00**，Windows **0.10.105** 已公开发布并设为 Latest：[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.105)。tag固定实际构建main **49d55697cf7fad443b006f732b0c3e027239149f**。

本地安装包 `D:/deepseek-agent/acceptcat-group-invite-fix/clients/openim/release/Base/0.10.105/AcceptCat_0.10.105.exe`；桌面副本 `C:/Users/luo/Desktop/AcceptCat_0.10.105.exe`，均 **421239209 字节**，SHA256 **16edb7141d3ed71fe41b7803493fa19c0fe15b8587c78adf1c83aead2e131c23**。EXE、blockmap、latest.yml、SHA256SUMS.txt四附件的大小/digest与本机一致；匿名Latest、公开清单字节和EXE HEAD检查通过，旧0.10.104附件保持。

## 整合与功能

PR206最终5501899经三个Foundation和Windows打包CI成功后，以a9685ae普通合并；保留原8e06d29及测试0600修正/兼容提示提交。PR207/347e0cb仅版本和准备文档，经四项CI成功后普通合并为49d5569；合并树与受审发布树完全一致，两项HEAD均为实际构建main祖先。最终main四项CI也成功。PR204任务直接文件提交、PR205微信分享仍独立，未擅自合入。

群聊改造为真人成员和每群固定一个群助理；规则来源为平台与选定课题组，私人规则、偏好、私聊不进群。群主管理、归属审计、实名notify/ask及排队/进入会话/回应/撤回卡片已实现；assign本批不开放。已有任务承接保留。旧后台按真实版本显示升级说明，不伪装已启用固定群助理。

**配套后台仍0.45/034，本批没有生产部署或迁移。固定群助理、新建群聊和实名转达需0.46/035后生效，旧群尚未清退其他助手。** 安装包不自动升级后台。现有聊天、私人助理、任务和工作台继续使用既有服务。035需另行授权备份、恢复副本两次迁移及保全检查，不能只换旧镜像回退；详见[群助理交接](../development/group-assistant-governance.md)。

## 检查与边界

- 根本地完整CI954项测试/3生产入口/B0与生产Web通过；本批最终PR206、PR207和固定main各四项远端CI成功，Windows客户端双类型及工作流定向检查通过。新增凭据文件测试仅将合成临时文件设为0600，不放宽产品保护。
- 本地33项群/版本兼容检查通过；隔离Edge真实目标组件搭配合成0.45/0.46接口，验证真人选择、群设置、继任选择、转达撤回以及旧后台不调用新增接口。没有真实账号、真实模型或真实IM双机验收。
- 冻结 **1742** 份Git源码输入，重新执行冻结依赖安装和完整Windows构建；从实际EXE提取8项载荷，**135** 份资源与本机构建逐字节一致，群助理/升级提示/通知路由及既有页面标记核对。11项必需入口、PE/asar版本、更新清单、原生CJS加载、旧上下文和规则/交接回归通过；无rcedit残留tmp。
- 内置DSH0.2.1-rc.3、科研插件0.4.0、Tectonic0.17.0固定；原task-decomposition Skill、桌面原生层、聊天编辑器、DSH集成、Skills与锁文件相对0.10.104保持。
- 实际成品Electron在临时独立profile启动READY/exit0；EXE提取的SQLite实现用实际成品Electron、分开进程和禁网合成数据，验证完整正文/引用持久化、账号/服务隔离、撤回防回写、分页和删除。未代安装或操作用户正在使用的客户端。

构建仍有既有Antd use-client/chunk提示和electron-log重复初始化提示；保留日志，不宣称零警告。失败尝试包括初次Linux测试密钥权限、连接器合并403后改用现有授权CLI、显式fetch未生成跟踪ref后按固定SHA合并、draft按tag读取404后按ID核验，以及只读网络EOF重试；未覆盖旧附件或强推。

证据目录 `D:/deepseek-agent/.runtime/release-0.10.105-20261112`：pr206-final-ci-final.json、pr207-ci-final.json、main-ci-final.json、integration-proof.json、build-source.json、windows-build.log、installer-audit.json、pe-version.json、update-check.log、electron-smoke.log、packaged-cache.json、desktop-copy.json、release-public-verified.json、anonymous-verification.json、failed-attempts.md及ui-compat。代码、安装包生成/启动、公开发布与真实业务验收分别记录。
