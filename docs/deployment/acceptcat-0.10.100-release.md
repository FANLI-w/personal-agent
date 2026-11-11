# AcceptCat 0.10.100 发布回执

北京时间 2026-11-11T11:57:37+08:00，Windows **0.10.100** 已公开发布并设为 Latest：[Release](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.100)。固定源码/tag 为 main **acffd5e4119602e881922714c4107b73d40e97ee**；同事PR195经审核修正后通过整合PR196合并，保留原提交历史。

本地安装包：`D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.100\AcceptCat_0.10.100.exe`；桌面副本：`C:/Users/luo/Desktop/AcceptCat_0.10.100.exe`。两份均为 421232628 字节，SHA256 `66070e060c834edcf29b2920867469d62a01490424abff0308406d82d5bc572e`。EXE、blockmap、latest.yml、SHA256SUMS.txt 四附件远端大小/digest与本机一致；匿名Latest、小文件字节与EXE HEAD核对通过，0.10.99资产保持。

## 审核与内容

保留PR195/60f1fb06的六条平台规则v2、权限主体/候选审核、规则分层回执与只读记忆指针总览。详见[审核记录](../development/constitution-195-review.md)。

修正事实段误套个人偏好预算：原PR的3500字节事实段确实漏掉有效近4KB交接。工作台保留32KB事实段，服务端个人偏好仍3500字节/12条；新增任务记忆与交接跨会话/重启回归。成员规则仍进入candidate；任务转交后原承接人不能修订/撤回/批准候选方法，来源发起人即使不是负责人仍可审核。constitution共享包独立修改也触发Windows打包CI。

## 检查

最终PR HEAD四项GitHub检查和固定main四项检查全部成功。本地根完整CI为78文件/935项，另生产CLI3项、B0进程和Web生产检查通过；客户端双类型与工作流403项回归通过。50项共享/API定向、23项工作台定向与完整检查有交集，不能相加为独立覆盖数。原PR/修复后装配对照、规则/记忆演示脚本均通过。

冻结1712份源码输入；最终EXE提取8项载荷与win-unpacked核对，134份构建文件逐字节一致。直接运行EXE提取的原生CJS模块，核验个人规则/方法、问候、超预算失败，以及近上限交接和任务记忆共同保留。更新清单与成品Electron空profile启动通过；提取的SQLite缓存模块用实际成品Electron、独立进程、禁网验证完整正文/引用、账号服务隔离、撤回与分页。

内置DSH 0.2.1-rc.3、科研插件0.4.0、Tectonic0.17.0固定不变；原task-decomposition Skill与源码逐字节一致，文件/PDF、模型配置及本地聊天缓存入口保持。未使用生产账号、私人文件或模型密钥验收。

## 后台与边界

**本批未部署后台。** 公网只读ready仍为contract0.45.0，database/storage/authentication全ok，harness为not_verified；服务器沿上批cc04d955/schema034。不新增迁移，不清库。平台规则v2及服务端权限/回执需另行部署API/worker；客户端继续读取当前后台返回的平台规则，不能将安装新包当成后台已更新。

主体权限框架只接入部分写侧，其他接口继续现有ACL；跨层自动冲突检测、读侧身份继承仍未完成。不能据本批宣称完整全软件权限引擎已经实现。真实模型遵守率、科研任务、私人仓库与团队双机体验由负责人验收。

## 运行记录

Git外证据：`D:/deepseek-agent/.runtime/release-0.10.100-20261111`。主要文件root-ci.log、client-checks.log、budget-regression.json、build-source.json、windows-build.log、installer-audit.json、electron-smoke.log、packaged-cache.json、main-ci-final.json、release-public-verified.json、anonymous-verification.json。构建/启动中的既有第三方警告保留在原始日志，不用通过结论覆盖警告。初次保存GitHub返回时误用不支持的gh --output参数，未写入或修改远端，随后改为正常重定向。

隔离启动日志仍出现与0.10.99一致的 `log.initialize({ preload }) already called` 提示，随后明确输出 `OPENIM_ELECTRON_READY` 并通过稳定启动检查；本批未修改该日志初始化路径，不宣称零警告。

回执在公开附件核验完成后通过纯文档PR补入，发布tag保持实际构建提交。
