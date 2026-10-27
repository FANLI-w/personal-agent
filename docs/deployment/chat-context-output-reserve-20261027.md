# 群聊上下文与回复额度后台升级

2026-10-27。负责人明确同意现在升级[PR121](https://github.com/luoyan96/personal-agent/pull/121)配套后台。固定产品 **798f77c3cc7e7a52f9eaf61b0dbc46e99f2ba7f2**，受审文档head f9e5914的三个GitHub Foundation检查均success；本机冻结完整CI822项/64文件及2项生产入口、类型、契约、B0/Web边界通过。无客户端、契约或数据库迁移，现有0.10.59安装包保持；本批未合main或公开Release。

## 实际切换与验证

**2026-10-27 11:06:13–11:06:34（北京时间）**完成API/worker配对切换。原63d87995替换为 **research-openim-api:chat-context-output-reserve-20261027** / **sha256:28ee6231937556fda148308d9ee8576e859e7f0595fd99b50e1cca3af6874e21**，产品798f77c，仍为**contract0.34/schema027**，没有迁移。API healthy、worker running（无独立healthcheck），restart0；公网HTTPS ready200，数据库/存储/认证ok，受保护端点401。Harness仍not_verified，未做真实模型请求。

从已核验的group-agent-mentions-20261026生产镜像离线构建4份API源码增量；568份基线文件、191份编译产物、48份方法/76份角色文件、18角色/38份精确旧默认映射/19方法及catalog seed均核对，role digest保持120edc86b67b8120a6f8e2e67a81a1fd29ed1a5e2c5c28a42cf511062739b603。网络隔离、1536MiB及单worker环境中的130项/10文件合成回归通过。运维包153301字节，SHA256 d9638885dc7facade2648b9a884218a4557c1155d066cc09937c19e26a02d1e0，10测试及2份transitive支持文件均逐份核验。

预检通过后停API、排空并停worker；停写快照备份research目录及配置输入，独立恢复后104表、8个原文件的结构/数量/摘要、完整性与外键一致。恢复副本隔离HTTP检查与检查后复核、运行库启动前复核均一致；26份配置/密钥输入备份及摘要保持。私人档案/偏好、模型设置与凭据、飞书连接/来源和集合范围保持；其他六服务及API/worker原运行设置不变。广场同步仍disabled/nextCheckAt=null，catalog entries11/candidates19保持。

## 备份与回退

备份 **/srv/research-openim-backups/chat-context-output-reserve-20261027-20261027T030616Z/research.tar.gz**，SHA256 **ee585f43f3aa3f36249e49822ad81ba84fe476cb97cf20f47313a2c85cb77866**。备份在同一ECS，仅验证独立目录恢复，不代表异地或整栈灾备。运维目录 **/opt/research-openim/ops/chat-context-output-reserve-20261027**，在group-agent-mentions-20261026完整Compose链之后追加本目录images.yaml。

本次没有触发回退。两镜像均contract0.34/schema027；必要时停新API/worker，再用原完整Compose链成对恢复63d87995，并保留当前数据。不用旧快照覆盖后续业务写入，不改变其他服务或资料授权。

## 证据和边界

Git外D:/deepseek-agent/.runtime/chat-context-output-reserve-20261027保存运维包、原失败、检查日志、本机公网ready、完成截图和回执。服务器回执/root/acceptcat-chat-context-798f77c-deployment.json经Workbench编辑器复制，剪贴板CRLF还原LF后与服务器**4414字节/SHA256 587fb8d6cdda4731dcd972f7d7a6780d19636b420b1735d49914a7213b42d800**逐字节一致，没有复制运行数据库、用户材料或密钥到本机/Git。

初次上传旧OSS会话NoSuchKey，刷新并恢复同一实例已有免密连接后成功；初始只读多行终端输入串接、误开未提交反馈窗口、若干控件过渡失效及一次filechooser默认3秒等待超时均保留记录。没有在这些失败时停写；最终完整包与源码/测试摘要、LF/bash预检通过后才构建。首次服务器构建/隔离回归和部署均成功，没有跳过失败检查。

原用户真实会话与真实模型空回复未逐一复原，本批不代真实群聊、私人材料、安装器、产品UI或额外原生验收。公开Latest仍0.10.56，0.10.59本机包未重打或公开发布；PR121仍待审，部署不等于合main。
