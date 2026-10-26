# AcceptCat 0.10.59 群聊修复候选

2026-10-26。当前批次在fix/group-agent-mentions-and-visibility，从fetch后的main/c3f7d0f新建，普通merge保留PR119及其PR118图片操作依赖，未改main。

同时@多个已入群本地助手、按助手显示群内公开状态；当前群名单含没有加入自己通讯录的同事助手。私有请求详情不共享，已有材料ACL保持。新普通请求预算为每助手16000tokens/90秒，总额最多5份并均分；历史/显式请求与重试预算保持。详见[设计与边界](../development/group-agent-mentions-and-visibility.md)。

## 配套后台

本批新增agentContactIds/可选turns、会话成员公开档案与群内公开状态接口，**contract0.34.0/schema027**。旧单助手发送兼容，新客户端群聊功能需要配套后台。没有数据库结构、密钥或用户材料变更；不能只安装客户端就宣称群聊修复已在线生效。

当前线上仍为research-openim-api:task-flow-safe-recovery-20261026，镜像7720ec9b，产品04e184f，contract0.33/schema027。此批尚未部署、重启或变更服务器配置。

待单独授权部署后：核对在用容器/镜像和组合compose；备份当前运行数据与配置，验证恢复；从本批固定产品提交构建独立镜像，以隔离复制数据启动，检查健康及契约、schema和原记录；再切换原API/worker并记录实际镜像、时间与前后数量。rollback使用原7720ec9b镜像及原compose组合，不用旧备份覆盖新运行数据。不得在隔离库中自动运行正式模型、发消息或调度。

## 检查与交付进度

定向API/契约10项通过；客户端提及、状态、待发恢复和传输35项/5文件通过，renderer/Electron双类型通过。根冻结完整CI（819项/64文件、共享类型与contract0.34、2项生产CLI/HTTP、B0及Web边界）通过，安装包尚在准备，未代安装器、真实模型、产品UI、私人材料或额外原生验收。

首轮新增测试遗漏同实验室旧群仍需主人单独接受Agent邀请、SQL误用origin物理列、CHAT1端点数量误计，修正合成夹具和断言后通过；首轮renderer响应联合类型未显式声明可选turns，调整类型后通过。首轮完整CI仅Web契约版本断言仍为0.33而失败（818通过/1失败），同步到0.34后重新完整CI通过。原失败日志保留在Git外 **D:/deepseek-agent/.runtime/group-agent-mentions-20261026**，不能当作通过证据。

公开Latest已核对仍v0.10.56；v0.10.59不存在。本批尚未公开Release、上传安装包或合main。完成后补记实际产品提交、包摘要和PR。
