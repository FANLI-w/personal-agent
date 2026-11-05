# 聊天记录本地优先配套后台 0.42 部署回执

2026-11-04，负责人明确要求更新后台。通过已登录的阿里云 Workbench 原实例 root shell 完成部署，**北京时间18:35:18核验通过**。只更新科研API/worker，没有清理账号、消息、资料，没有新建SSH凭据或修改安全组、端口、Nginx、证书。没有操作负责人正在使用的客户端或真实账号。

## 固定源码与镜像

| 项 | 实际值 |
| --- | --- |
| 功能PR | [PR172](https://github.com/luoyan96/personal-agent/pull/172)，仍未合并 |
| 部署源码 | `3aa30302d2c266722966a7145cc339af0c3759ce` |
| 产品实现 | 主修复f5093f6、客户端收尾d12858b；3aa3030是其后文档提交 |
| 服务器源码 | `/root/personal-agent-3aa3030` |
| 运维目录 | `/opt/research-openim/ops/chat-transcript-20261104` |
| 新镜像 | `research-openim-api:chat-transcript-20261104` |
| 新镜像完整ID | `sha256:0e2837232c5b5d019a27c3ad96d0915823fa316119b3c563fe68fb2a5c5494e3` |
| 实际上一对镜像 | `research-openim-api:planner-two-state-20261104` / `sha256:ba0be028d75f7b070b524831b009d6c3e0660719829daad1659a1c5301bd14a6` |

服务器fetch指定SHA，`git rev-parse HEAD`精确匹配，checkout干净。复用上一批修好的Dockerfile，SHA256 `7a482c69373be322c6d9d1e76531b21959c22933eb8e31702ea1190437d5666b`；先编译research-skills，保留025的LF/2111字节与现网CRLF/2144字节双向断言，032仍为LF/652字节。不修改指定checkout或schema_migrations。

493份镜像输入与固定Git源码逐一核对，revision镜像标签匹配。新编译chat-transcript.js及chat.js的路由接入存在，契约0.42.0；API/worker运行中的编译摘要再次与新镜像核对一致。ai、collaboration、execution-worker、group-membership摘要保持上一批值，保留两态规划和普通群成员邀请能力。

远端四项CI在3aa3030全部成功；本机完整根CI与客户端检查见[实现说明](../development/chat-transcript-local-first.md)。服务器新镜像内3文件/77项chat、planning-personal-model、openim测试全通过，`--network none`、无生产库挂载，合成身份/模型仅在隔离测试库中。没有生产合成数据或真实模型调用。

## 切换与数据保全

沿用planner-two-state-20261104完整Compose覆盖链，在其最后追加本批images.yaml；仅停止和启动research-api、research-worker，启动带`--no-build --no-deps`。脚本校验部署互斥锁、实际旧镜像与config_files、磁盘余量、新镜像、已审辅助文件摘要后才排空队列。

- worker停止：`2026-11-04T10:34:56Z`（北京时间18:34:56）。
- API停止：`2026-11-04T10:34:56Z`。
- 全部切换检查完成：`2026-11-04T10:35:18Z`（18:35:18）。

静止一致备份：

```text
/srv/research-openim-backups/chat-transcript-20261104-20261104T103458Z/research.tar.gz
SHA256 4c3a8a58b5170b5fd1acaf0b77ffc165d0d192ff8b94651d93c009b2f48ba267
```

校验备份并实际解包恢复；恢复副本、正式库各执行两次幂等迁移核验。**schema032→032、113表→113表，无新迁移。** 全部原表行摘要、迁移历史、完整性、外键、9份原件与文件模式与静止基线一致。38份既有配置/secret输入备份并确认未变，不输出任何值；社区同步仍关闭，私人模型凭据/默认设置、飞书连接/范围、资料集合保留。

API容器ID `8538b97bdb140cea43268193854f0f83574fe7ab5ef77290e22b31e8c2ecf6c4`，healthy；worker容器ID `9a444a137b5dba958934fb48fd3b9a08116113d1b85e8628b99e29dfed6b676e`，running。两者实际镜像均为新ID，restartCount=0；环境哈希、挂载、命令、重启策略、内存、端口、网络与切换前一致。

其他六个容器（OpenIM、MinIO、etcd、Kafka、Mongo、Redis）的ID、镜像ID、状态逐字相同。服务器others.before/others.after均为：

```text
SHA256 83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922
```

## 公网核验与验收边界

服务器和本机独立公网GET `/api/v1/health/ready`均为HTTP200，原始body：

```json
{"data":{"status":"ok","contractVersion":"0.42.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名GET `/api/v1/chat/conversations/deployment_probe/transcript-sync?known=[{"messageId":"deployment_probe","revision":null}]`（实际URL编码）为HTTP401。服务器最终原始body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"973abaca-c9cc-446a-8192-adb7f039e65b"}}
```

匿名资料索引、会话、session、任务确认、邀请也均401。新接口只读且逐项验权，按已知修订返回变化快照/不可读ID，不调用模型或创建业务数据。授权增量、引用/撤回、私人turn隔离由真实Fastify/SQLite隔离测试检查，未借用负责人生产账号伪造验收。

**公开Windows仍为0.10.93，PR172未合并，本批没有新安装包或公开Release。** 已安装旧客户端不会因后台升级自动获得完整本地正文与分页修复；后台0.42提供配套增量同步。下一步应审核交付PR172客户端，再由负责人验收系统级断网冷启动、真实双客户端撤回/状态更新和权限变化。未下载过的正文首次仍需补取。`harness:not_verified`保留，不能称为真实模型验收通过。

## 回退与留证

旧ba0be028镜像及本批fallback标签保留，恢复副本上的旧0.41只读迁移历史/Plan兼容检查通过。必要时先核对当时现库兼容性，再按完整链成对切回API/worker；不能重跑一次性deploy.sh或用旧备份覆盖升级后消息。没有实际回退或恢复旧生产数据。

source/build/preflight/isolated-tests/deploy/post-check最终退出码均0，无正式切换失败。首次只读post-check已输出DEPLOYMENT_VERIFIED，但外层shell提前展开退出码变量，产生空退出码文件；保留post-check-initial-wrapper.log/.exit与post-check-wrapper-note.txt，改用Python subprocess记录真实returncode后，同一只读核验再次通过。不重复切换或迁移。证明文本首次换行被写为字面转义，随后仅修正其排版；不是服务故障。期间本机一次读取误写不存在的旧文档路径，未影响部署或文件内容。

构建日志`build.log`、隔离`isolated-tests.log`、部署`deploy.log`、最终`post-check.log`及源码/镜像/manifest/编译摘要、备份/恢复/迁移/数据保全、其他容器/服务设置、公网原始响应、行为待验收记录均留在服务器本批ops目录。完整基线含私人数据，仅留服务器，不入Git。

本机脱敏证据在Git外 `D:/deepseek-agent/.runtime/chat-transcript-deploy-20261104`：已校验receipt.json（SHA256 `06da72cf9308ce34e0cd765ce3bb2aa0da4a9cd4c1739c96fc7158db37806787`）、独立公网原始响应、部署证明文本/截图、辅助脚本。截图仅截终端证明区域，未包含Workbench会话凭据。
