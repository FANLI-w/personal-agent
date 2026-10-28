# AcceptCat 0.10.61 合并发布准备

2026-10-28，负责人明确要求合并此前修改并上传 Release。独立工作副本 release/chat-integration-20261028 从 PR126/36b30bf 保留后台修复，再普通合并 PR125/6e6f58c；整合提交447fab0，产品代码无冲突，current-state/project-log 两份文档保留双方记录。

本次候选客户端版本递增至0.10.61，不能覆盖已公开0.10.60的安装包或更新清单。远端实际最新main、PR检查和版本占用须在发布前重新核对；准备时GitHub直连与本机既有代理TLS超时，连接器同样不可用，因此不声称已合并main或已发布。

范围：统一聊天输入工具栏和消息右键菜单，群内成员/Agent提及、引用关系、逐助手状态、历史定位与阅读位置恢复；文件另存及保存后定位；合入SQLite争用下worker租约与结果保存修复。详见[聊天体验](../development/chat-conversation-experience.md)与[中断修复](../development/chat-worker-interruption.md)。

后台与客户端独立：已知线上为PR126产品a174c17叠加镜像160805d4、contract0.34/schema027。本次没有新的后台操作。PR125的业务消息撤回、持久回复关系及OpenIM撤回同步需要contract0.35/schema028和配套服务更新；新版客户端保留旧后台兼容回退。发布安装包不代表这些后台能力已上线。

## 本机验证与安装包

产品及打包提交cc079be（版本递增和测试夹具修正包含在内），后续仅补交接文档。实际fetch确认main仍aaa0eea，公开Latest仍v0.10.60；整合分支已推送，正式合并与公开结果另记。

- 根冻结安装及完整CI通过：834项/65文件，生产入口3项、B0真实HTTP进程、Web生产边界、类型/构建/契约检查通过。
- 客户端冻结安装、renderer/Electron类型通过；聊天/构建相关80项、规划41项通过。其他打包守卫首轮119/124通过，5项服务状态测试因新截图/文件桥的夹具注册缺失而失败；补齐两个无关桥的替身后该文件5/5通过，权限断言不变。原失败日志保留，总计245项覆盖。
- 根desktop:win完成NSIS、4项包内入口守卫；check-windows-update验证版本/文件名/大小/SHA512及公开GitHub更新源通过。没有执行安装器。

安装包：D:/deepseek-agent/.runtime/release-chat-20261028/windows/AcceptCat_0.10.61.exe，88,252,826字节，SHA256 `f30a75fa7b0a1191a991f4f4377c4085d20b7f6f49e9022445007409a865df74`。同目录包含blockmap、latest.yml和SHA256SUMS.txt。证据目录：D:/deepseek-agent/.runtime/release-chat-20261028。未代用户安装或运行真实账号、私人资料、模型验收。
