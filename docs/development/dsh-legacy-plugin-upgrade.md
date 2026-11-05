# 旧GitHub科研插件依赖的离线升级修复

2026-11-05，负责人在0.10.94工作台看到pnpm退出码1，错误指向GitHub上旧3d2805c依赖。该提交是0.3.1；包内虽已有0.4.0，旧profile升级仍失败。这是客户端安装适配错误，与后台、模型Key或账号数据库无关。

## 原因与修复

0.10.94使用`pnpm add file:<tgz> --offline --ignore-scripts`。DSH附带pnpm11.28.5在已有同名GitHub依赖时会先尝试恢复旧包；旧GitHub tarball不在store就抛ERR_PNPM_NO_OFFLINE_TARBALL，甚至可能把旧模块移入node_modules/.ignored。新建profile没有旧依赖，因此上一轮新profile安装检查通过，不能代表旧profile升级通过；这是上一批验收遗漏。

改为`pnpm add dsh-research-workbench@file:<tgz> --offline --ignore-scripts`，明确替换这一条依赖来源，由pnpm更新manifest和lock。没有删除整份锁文件、清空profile或改用户其他插件，仍核对实际安装版本并保留更高版本。没有启用网络取旧包、关闭完整性检查或放宽安全设置；单独设置verify_deps_before_run=false的隔离实验仍失败，不作为修复。

打包前固定并校验官方插件版本和tgz；用户启动新版时，只将缺失或较旧的这一条依赖切到已内置包。安装器的新资源与用户已有profile是两个位置，打包不能代替用户profile升级。CI现于插件检查前准备已固定DSH和桌面工具，避免仅靠未运行真实包管理器的夹具通过，也保证CI安装包有实际内置工具。

## 检查

- 直接从公开0.10.94 EXE提取的补装模块运行新回归：旧GitHub锁和上次失败后模块在.ignored两种情况均重现同一离线tarball错误；日志保留。
- 修复后的相同检查使用真实DSH附带pnpm、独立空store、--offline，以及公开旧GitHub依赖元数据。两种情况都实际安装0.4.0，旧GitHub记录被替换，其他本地插件、bundle/自定义配置、会话与资料哨兵逐字节不变；重复补装不重装。
- 单元/资源/真实升级共19项通过。既有DSH检查、类型和成品构建结果另随本批发布回执记录。新测试纳入Windows工作流，其他平台明确跳过Windows二进制测试。

所有profile与数据是独立合成夹具，没有读取或修改负责人的实际profile、会话、资料或Office进程。证据在Git外`D:/deepseek-agent/.runtime/dsh-legacy-plugin-upgrade-20261105`。客户端候选版本0.10.95；此文不表示已合并或发布，发布以当批回执为准。后台0.42、科研插件0.4.0资产及聊天缓存实现均不变。
