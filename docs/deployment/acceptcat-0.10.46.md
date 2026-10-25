# AcceptCat 0.10.46 本机交付

2026-10-25，北京时间。分支feature/agent-role-skills从fetch后的main/fb2150b建立，保留PR105/b5b72ca；产品 **ccbc411dd76d32f4504cf76c261a78a4a4bdf0a4**，双方既有聊天、资料、课题组和任务功能保持。

十类默认角色统一为meta.json、persona.md、work.md、SKILL.md和manifest，唯一内容源在agents/roles，桌面/API同版编译使用。默认人设不再散放前端TS；新默认角色注册后自动出现在添加列表，自建/导入角色沿同一角色解释与导出器。设置页可查看/编辑Markdown、分别保存和导出完整角色包，兼容旧JSON。27份历史默认档案仅精确匹配时投影新版，存储记录、用户自改档案、联系人/会话及私人偏好保留；角色不扩大权限、工具、预算或任务数量。

## 实际检查与安装包

完整根CI **787项/61文件**、2生产CLI/HTTP及B0/生产边界，客户端 **60项**（含2项真实本机HTTP/SQLite单项创建回执）、renderer/Electron双类型通过。冻结顺序两共享包先构建、Windows Web/4SDK/55运行包/NSIS/4启动入口及更新清单通过；成品ASAR另逐字节核对 **44份角色原文与2个角色模块**。

桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.46.exe**，**87,372,525字节**，SHA256 **b8d2f7b87a4ff6d8b16c2fa4e2d0e315341fd4bdad51abe84ee9d098947585de**，复制摘要一致，旧包保留。构建目录clients/openim/release/Base/0.10.46。更新清单SHA512、文件名/长度、blockmap和公开GitHub更新源验证通过，没有上传Release或发布附件。

首轮共享构建的Windows换行检查、直接JSON模块导入修正后通过；首轮定向及中止的全量暴露4000预算/历史/文件切换和2899剩余重试问题，缩短默认个人助理与重复协议，保留原断言、完整用户人设和预算后重跑完整CI通过。诊断仅使用合成内容和字节计数，临时调试代码已移除。既有Node模块类型、AntDesign/Vite打包警告保留，未升级工具链来隐藏警告。

未代安装、原生启动、浏览器产品、真实模型/私人材料或双机体验；合成模型只证明加载与业务边界，同事交流质量仍由负责人检查。

## 后台、合并与发布

配套API/worker源码有变化，**需要单独升级后台**才采用新版共同规则、默认角色投影和无绑定规划/证据审阅角色。contract **0.32.0**、schema026、现有接口、依赖锁保持，无数据库迁移；本批未部署、做新线上探测或更新服务器canonical/私人Skill。线上沿已部署0e78530/7d75165a，广场同步沿关闭记录。源码尚未合main、0.10.46未公开，重新读取公开Latest仍 **v0.10.37/422478602**。

升级需要配对API/worker和research-skills生成目录、同schema停写备份/恢复检查与明确切换记录；先排空旧请求，上下文摘要变化会阻止旧角色结果回写。回退保持当前数据库与用户写入，不能回灌旧备份覆盖新资料。尚未执行服务器构建、隔离检查、备份或切换，不冒称运维包已验证上线。

新客户端沿现有0.32接口可查看/编辑角色，但旧后台不会自动采用新的默认投影与共同规则，不能将前端展示当成线上模型已经换人设。外部服务的真实人设由远端维护。

来源、文件组织与新增规范见[设计](../development/agent-role-skills.md)、[角色目录](../../agents/roles/README.md)和[评价情境](../../evaluations/fixtures/agent-role-skills.md)。证据 **D:/deepseek-agent/.runtime/agent-role-skills-20261025** 保存root-ci-final、client-final、双类型、desktop-win、windows-update、asar-roles、delivery及原失败记录。注册超时、飞书试点、原件互传和历史边界不因本批改变。

[PR106](https://github.com/luoyan96/personal-agent/pull/106)已创建并挂接，目标main，OPEN/MERGEABLE；首次head6da3514读取GitHub检查尚未出现，后续自动检查另计，不能当作已通过。GitHub连接器创建返回403后沿本机已登录CLI提交，未改权限或绕过保护。尚未合main/公开Release或部署后台。
