# 0.10.93 配套两态规划后台部署回执

2026-11-04，负责人要求更新后台并重新打开已登录的阿里云 Workbench。通过原 ECS 的 root shell 完成构建、备份和切换，**北京时间 15:03:21 核验通过**。仅更新科研 API/worker，没有新建 SSH 凭据、修改安全组/端口/Nginx/证书、关闭 callback 校验或操作负责人真实客户端。

## 固定源码与镜像

| 项 | 实际值 |
| --- | --- |
| 配套客户端 | 已公开 Windows 0.10.93 / PR168、169 |
| 部署源码 | `3c6c8584ef8f6b4949e5e70aa07a4da5ca88fafb`，与安装包实际构建提交相同 |
| 服务器源码目录 | `/root/personal-agent-3c6c858` |
| 运维目录 | `/opt/research-openim/ops/planner-two-state-20261104` |
| 新镜像 | `research-openim-api:planner-two-state-20261104` |
| 新镜像完整 ID | `sha256:ba0be028d75f7b070b524831b009d6c3e0660719829daad1659a1c5301bd14a6` |
| 实际上一对镜像 | `research-openim-api:group-member-invites-20261104` / `sha256:96f0ea92ca9c758a3856923b121debed17faa7f2902b4c53f1584b7455308bc1` |

服务器直接 fetch 公开 tag v0.10.93，`git rev-parse HEAD` 精确匹配上述提交，工作区干净。没有将本机未提交文件覆盖进生产；运维辅助脚本独立存放。复用上一批修好的 Dockerfile（SHA256 `7a482c69373be322c6d9d1e76531b21959c22933eb8e31702ea1190437d5666b`），先编译 research-skills，再编译 API；保留 025 的 LF/2111 字节与旧 CRLF/2144 字节双向断言。032 仍是 LF/652 字节，未修改 checkout 或 schema_migrations。

新镜像标签 revision、**492 份**构建输入与固定 Git 源码逐一核对。另检查新编译的 `ai.js`、`collaboration.js`、`execution-worker.js`：统一讨论/粗骨架提示、确认判断与动作投影已在镜像内；运行中的两个容器再次核对相同文件及内置任务拆解 Skill 摘要。`chat.js` 和 `group-membership.js` 的编译摘要与上一批完全一致，保留已上线群邀请修复。

新镜像内 **4 文件 / 47 项**规划输出、真实 HTTP/SQLite 规划确认和群权限回归全部通过。测试容器 `--network none`、不挂载生产库，使用隔离合成账号/模型；没有生产测试账号、计划、任务或付费模型请求。根 CI 与客户端检查范围另见[0.10.93 发布回执](acceptcat-0.10.93-release.md)。

## 切换链与数据保全

沿用 `group-member-invites-20261104` 的完整 Compose 覆盖链，在其最后追加本批 images.yaml；只启停 `research-api research-worker`，启动带 `--no-build --no-deps`。旧完整链、旧镜像、fallback 标签和实际命令保留，切换脚本和保全脚本与已审阅版本的摘要一致。

获得原部署互斥锁并核对实际旧镜像/config_files 后排空队列：

- worker 停止：`2026-11-04T07:02:58Z`（北京时间 15:02:58）。
- API 停止：`2026-11-04T07:02:59Z`（15:02:59）。
- 全部切换检查完成：`2026-11-04T07:03:21Z`（15:03:21）。

静止一致备份：

```text
/srv/research-openim-backups/planner-two-state-20261104-20261104T070300Z/research.tar.gz
SHA256 2f40b1e52c5df2c7be0d9ba0641be36f49909ec2fd7b458059552e2d86f39be2
```

备份校验并实际解包恢复，在恢复副本和正式库各执行两次幂等迁移。**schema032 → 032、113 表 → 113 表，无新增迁移**；数据库完整性、外键、全部原表行摘要、迁移历史、9 份原件及文件模式均与静止基线一致。37 份既有配置/secret 输入备份并核对未变，没有输出任何值。社区同步仍关闭，私人凭据/默认配置、飞书连接、集合及范围保持。

API healthy、worker running，两个实际镜像均为新 ID、restartCount 均为 0。环境哈希、挂载、启动命令、重启策略、内存、端口和网络与切换前相同。

其他六个服务（OpenIM、MinIO、etcd、Kafka、Mongo、Redis）的容器 ID、镜像 ID、状态逐字相同，服务器 `others.before` / `others.after` 均为：

```text
SHA256 83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922
```

## 公网与运行核验

服务器及本机独立 GET `/api/v1/health/ready` 返回 HTTP 200，原始 body：

```json
{"data":{"status":"ok","contractVersion":"0.41.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名会话、session、资料索引、任务确认与邀请接口均为 401。有效格式但无账号的 POST `/api/v1/plans/deployment_probe/confirm` 原始返回：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"69592fa0-5fcb-414a-a863-71d75d21718e"}}
```

未伪造真实行为请求/返回。真实验收待负责人用 0.10.93 在旧计划点击「按新版规则重新梳理」，确认保留内容和计划 ID、按问题/候选继续、全部可执行后明确确认且任务数量与草案一致。部署不会自动改写旧计划或代调用模型；`harness: not_verified` 不表示真实模型效果已验收。

## 回退与失败留证

无新迁移，旧镜像保留为本批 fallback；恢复副本上使用该旧 0.41 镜像的只读迁移历史/Plan 校验通过。需要回退时仍先校验现库兼容性，再按完整覆盖链成对停 API/worker、切回旧镜像；不能直接重跑一次性 deploy.sh，不能恢复旧备份覆盖升级后数据。若兼容检查失败，采用兼容前滚，不得退到不认识 032 的 0.40 镜像。本次没有执行实际回退。

| 尝试 | 实际结果与证据 |
| --- | --- |
| 负责人重开 Workbench 前的旧标签/浏览器连接 | 旧标签失效、读取超时，浏览器安全检查终止该轮操作；当时只读，没有停容器或修改数据。重新登录后恢复，事后摘要在本机 preparation-notes.log |
| 运维文件只读清单与多行输入 | 清单中的 *.js 无匹配、多行输入未提交，仅影响准备；改用单行命令读取，不修改生产数据，摘要同上 |
| npm 下载重试 | 两个依赖下载出现 error(23) 后由 pnpm 自动重试并成功，build.log 保留原警告；未改锁文件、切换依赖或放宽校验 |
| 部署证明截图 | 两次 Page.captureScreenshot 超时，未生成可交付截图；现场容器/公网断言已通过，终端文本和脱敏 JSON 回执已保存，摘要在本机 preparation-notes.log |
| 源码/构建/隔离/切换/最终核验 | source、build、preflight、isolated-tests、deploy、post-check 的 .exit 全为 0，无正式部署失败或回退 |

服务器运维目录保留 Dockerfile、source/build/prepare/preflight/deploy/post-check 脚本及日志、实际镜像和命令、manifest/source/artifact 检查、静止基线、备份路径、恢复/正式库迁移与保全、其他容器/服务配置比对、公网原始响应、receipt.json 和 behavior-validation.json。敏感完整基线只留服务器。

本机脱敏证据：`D:\deepseek-agent\.runtime\planner-two-state-deploy-20261104`，包括 receipt.json、独立公网请求、辅助脚本和 deployment-proof.txt；现场证明脚本重新断言容器实际镜像/健康/重启、其他六容器状态及公网 ready 后生成终端文本。截图捕获两次超时，未以不存在的图片作证。0.10.93 Release 说明已补独立后台部署状态，四个既有附件的大小/摘要保持不变；未重新打包或发布另一个客户端版本。
