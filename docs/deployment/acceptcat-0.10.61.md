# AcceptCat 0.10.61 合并发布准备

2026-10-28，负责人明确要求合并此前修改并上传 Release。独立工作副本 release/chat-integration-20261028 从 PR126/36b30bf 保留后台修复，再普通合并 PR125/6e6f58c；整合提交447fab0，产品代码无冲突，current-state/project-log 两份文档保留双方记录。

本次候选客户端版本递增至0.10.61，不能覆盖已公开0.10.60的安装包或更新清单。远端实际最新main、PR检查和版本占用须在发布前重新核对；准备时GitHub直连与本机既有代理TLS超时，连接器同样不可用，因此不声称已合并main或已发布。

范围：统一聊天输入工具栏和消息右键菜单，群内成员/Agent提及、引用关系、逐助手状态、历史定位与阅读位置恢复；文件另存及保存后定位；合入SQLite争用下worker租约与结果保存修复。详见[聊天体验](../development/chat-conversation-experience.md)与[中断修复](../development/chat-worker-interruption.md)。

后台与客户端独立：已知线上为PR126产品a174c17叠加镜像160805d4、contract0.34/schema027。本次没有新的后台操作。PR125的业务消息撤回、持久回复关系及OpenIM撤回同步需要contract0.35/schema028和配套服务更新；新版客户端保留旧后台兼容回退。发布安装包不代表这些后台能力已上线。

本轮验证结果与安装包摘要完成后补记。证据目录：D:/deepseek-agent/.runtime/release-chat-20261028。未代用户安装或运行真实账号、私人资料、模型验收。
