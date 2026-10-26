# AcceptCat 0.10.53 本机候选交付

2026-10-26（北京时间）。负责人要求补齐删除联系人和Agent的方式。本批源于main/d25781d，功能分支feat/contact-agent-removal；产品固定e947fb26c42a94d5401974e11428ecbe5200245e，c7351c1仅把新客户端边界测试接入Windows CI。后续交付文档不改变安装包产品源码。[PR113](https://github.com/luoyan96/personal-agent/pull/113)已创建并附到当前任务，状态open、目标main、未合并；main合并/公开Release/后台升级分别处理。GitHub自动检查仍运行，不能把本机通过写作远程全部完成。

## 用户行为

通讯录名片、详细资料和聊天右键菜单直接提供删除入口。“删除聊天”仍是独立操作。真人及别人拥有的Agent是“删除联系人”，仅撤销关系，账号、历史消息、群和课题组成员身份、原有任务保留，之后可以重新申请添加。自己创建的专门Agent是“删除 Agent”，保留历史聊天并变为只读，原有任务、资料与成果保留；系统个人助理不提供删除。

本人版本确认后逻辑删除，拒绝他人、过期版本和对系统身份的删除。停止该Agent进行中的回复、绑定规划和定时工作，拒绝迟到内容/提议落盘，保留实际返回用量；待发提醒/周期运行消息标记denied，已发记录不撤回。清除外部服务密钥，私人Skill只解除该Agent绑定，内容、修订、来源、其他绑定保持。活跃额度释放，新建获得新身份，旧模板复用不会复活删除身份。详见[设计](../development/contact-agent-removal.md)。

## 实际检查

- 根完整ci最终799项/63文件、2项真实本机生产CLI/HTTP、B0进程与生产边界通过；包括适配器构建/类型及缺凭据边界，没有真实模型调用。
- 本机实际HTTP/SQLite合成检查9项覆盖026重复迁移保全、本人/他人/系统/真人权限、版本/幂等重放、历史/记忆保留、外部密钥与定时工作取消、Skill解绑且源/修订保全、另一Agent定时工作及已发/未发周期记录隔离、进行中迟到回复与用量、绑定规划及已确认真实任务保全、活跃额度/重新创建、联系人删除与重新添加。
- 客户端123项/17文件通过，其中6项新检查覆盖正确目标/档案和关系版本、稳定幂等key、账号/页面切换及迟到响应、服务失败和列表刷新失败区别；新检查已接入Windows工作流。renderer最终及Electron类型通过。
- 冻结安装后依次build两个共享包、客户端冻结安装、Web/Electron/NSIS通过，4固定SDK资源、55运行依赖和既有4启动入口守卫通过，未使用force安装。更新EXE/blockmap/latest.yml的版本、大小与摘要一致。未额外执行手工ASAR载荷验收。
- 保留初稿迁移漏登记导致5失败、规划用例误设初始fence导致1失败、旧迁移夹具/计数导致9失败，以及第二轮797项通过后生产CLI仍断言schema26的失败。补登记、调整合成降级准备和当前schema/contract计数，不删原有数据/权限断言，不跳过测试/提高预算或业务时限。增加两项清理检查后最终799及生产入口全通过。

未代安装、原生启动、浏览器产品、真实联系人/Agent删除、真实模型、私人材料、飞书或双机体验。实际安装及使用感受由负责人检查，不把构建成功写作功能体验通过。

## 安装包与证据

桌面：C:/Users/luo/Desktop/AcceptCat_0.10.53.exe。源包：clients/openim/release/Base/0.10.53/AcceptCat_0.10.53.exe。

大小 **88,222,763字节**；SHA256 **ba6ceb2ecd4fd427a20880548deb88f11d8ed781786f6bcfa8ca37db67224a9e**。桌面复制摘要一致，旧包保留，没有自动安装或公开上传。

Git外D:/deepseek-agent/.runtime/contact-agent-removal-20261026保留root-install、共享包准备、首轮/诊断/最终9项API、旧迁移修复、三次完整ci、客户端123项、双类型、desktop-win、windows-update、delivery和notes；构建产物及运行证据不入Git。

## 后台兼容与升级边界

contract0.33.0新增POST /api/v1/chat/agents/{id}/delete，schema027新增deleted_personal_agents。既有Contact/Conversation、消息持久结构和allowedActions枚举保持；老客户端不会收到陌生删除枚举。旧迁移及校验和不修改。

当前线上仍research-openim-api:research-colleagues-20261026 / acf4b711，contract0.32/schema026，本批未连接生产Workbench或运行服务操作。旧后台没有自建Agent删除接口，必须另行升级API/worker和显式迁移027，安装新版客户端本身不会完成该升级。公开Latest复核仍v0.10.52/423781483，未改tag、Release或README公开下载入口。

升级时须重新核对当时生产镜像/Compose链、排空并备份，独立恢复验证原有表/行/原件/配置与迁移checksum保持，验证027只增加空删除表，然后配对切API/worker。不能用当前main全部覆盖此前生产叠加基线及运营配置。实际执行前仍需负责人单独授权。

一旦产生删除记录，直接回退旧镜像会忽略逻辑删除，可能使旧Agent重新可用；采用保留027约束的修复版本。禁止回灌旧数据库覆盖后续消息、任务和其他业务。此处是升级/恢复要求，未冒称已经在生产执行。注册超时根因仍未定，飞书仅本人试点，安装或入组不共享授权和私人资料。

GitHub连接器创建PR返回403 Resource not accessible by integration，改用本机已登录gh CLI成功创建PR113，未扩大权限或绕过审批。文档初次diff检查仅发现日志EOF多一空行，保留证据并修正；358份Markdown/19方法内容检查通过。
