# PR176粗骨架条件解析配套后台0.43部署回执

2026-11-06 **11:35:11北京时间**，负责人授权更新后，API/worker已成对上线固定源码 **de0d55a5f6a00b391365ff7bd0fd6e6e6bbf12a7**，与0.10.97预发布安装包/tag一致；契约**0.43.0**，schema**032**、**113表**保持。 部署通过已登录的Edge阿里云Workbench原实例root shell完成，没有新建SSH凭据或更改安全组、端口、Nginx、证书。代码、客户端包、后台部署分开记录；本次没有重新打包安装包或将预发布转为Latest。

## 固定源码与镜像

| 项 | 实际值 |
| --- | --- |
| 代码范围 | PR176原两态规划 + PR183仅第二项补修；九份原设计源码与a528c292逐字节一致 |
| 实际源码 | de0d55a5f6a00b391365ff7bd0fd6e6e6bbf12a7；服务器 /root/personal-agent-de0d55a，git rev-parse HEAD精确匹配、checkout干净 |
| 新镜像 | research-openim-api:planner-skeleton-20261106 |
| 完整镜像ID | sha256:45290283bd36d6410eb9c09671e2a49b49d31c424f6d1dfefc800b39e2c638a6 |
| 旧API/worker实际镜像 | research-openim-api:chat-transcript-20261104 / sha256:0e2837232c5b5d019a27c3ad96d0915823fa316119b3c563fe68fb2a5c5494e3 |
| 本批运维目录 | /opt/research-openim/ops/planner-skeleton-20261106 |
| 构建日志 | /opt/research-openim/ops/planner-skeleton-20261106/build.log |
| 切换入口 | bash /opt/research-openim/ops/planner-skeleton-20261106/run-deploy.sh；实际命令保留deploy-command.txt |

复用chat-transcript-20261104/Dockerfile，SHA256 7a482c69373be322c6d9d1e76531b21959c22933eb8e31702ea1190437d5666b；先编译research-skills。保留025迁移LF/2111与旧CRLF/2144字节双向断言，032仍LF/652字节；没有修改指定checkout、迁移文件或schema_migrations。构建前保留原3GiB空间门禁，切换前保留2GiB门禁；构建后观测约3.7GiB可用，未清理旧镜像、卷或备份。

493份构建输入与Git逐一匹配，镜像revision标签一致；运行中两容器的ai/collaboration/execution-worker/planning-output/chat/group-membership/chat-transcript与内置Skill摘要再次匹配新镜像。chat、群权限、transcript三个编译模块与旧0.42字节相同，保留本地聊天缓存增量接口和群邀请修复。九文件原设计守卫也在本机再次通过。

## 切换与数据保全

完整Compose链沿当前chat-transcript-20261104实际config_files，在其images.yaml之后追加本批images.yaml；只启停research-api research-worker，启动带--no-build --no-deps，没有覆盖其他六容器。互斥锁、实际旧镜像、完整config_files、磁盘和运维脚本摘要均在排空前检查。

- worker停止：2026-11-06T03:34:43Z（北京时间11:34:43）。
- API停止：2026-11-06T03:34:44Z（11:34:44）。
- 最终可用：2026-11-06T03:35:11Z（11:35:11）。
- 备份：/srv/research-openim-backups/planner-skeleton-20261106-20261106T033451Z/research.tar.gz。
- 备份SHA256：5792d9f8e2267f178fec1093fff310c4745a8b187f5fb77e23a9f2894c536a64。

新镜像内5文件100项隔离规划/HTTP/SQLite/聊天/OpenIM测试通过（network none、无生产挂载、合成身份/模型），493份镜像输入匹配固定源码。静止一致备份、实际恢复副本/正式库各两次幂等迁移、旧计划新版本解析及全部旧表行摘要/迁移历史/完整性/外键、9份原件/模式核对通过；39份既有配置和secret输入未变。API healthy、worker running，restart均0；其他六容器ID/镜像/状态、API/worker环境哈希/挂载/启动配置均保持。服务器与本机独立公网ready200，database/storage/authentication为ok，受保护接口匿名401；harness仍not_verified，真实账号/模型体验待本人验收。

数据库032→032、113→113，无新迁移；副本启动前逐条用0.43 Plan校验全部既有plans/plan_versions，未修改原记录。完整行摘要、配置/secret与原件的基线只留服务器受限目录，不进入Git。社区同步仍关闭，私人模型设置和飞书资料范围保持。

其他六容器（OpenIM、MinIO、etcd、Kafka、Mongo、Redis）的others.before与others.after均为SHA256 **83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922**，ID/镜像ID/状态逐字相同。API容器ID 9e6b459e79686c09d214626208e6ff5e22c33f9212e885286fff85c1427a035a；worker 5af240794e1753ce693deaf977ab4815d1ab94551ad140838921cad42d135d6d，均使用上述新镜像，restartCount=0。

## 公网原始返回与行为边界

服务器及本机独立GET /api/v1/health/ready均HTTP200，原始body：

```json
{"data":{"status":"ok","contractVersion":"0.43.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名会话、session、资料索引、transcript增量、计划确认与邀请均401。本机匿名GET /api/v1/auth/session的原始body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"05156e94-33a5-4d5a-8bb4-3c364b706fd0"}}
```

匿名transcript增量HTTP401原始body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"c045d410-64b3-480b-9fb7-1ec2d96bcca7"}}
```

**真实行为待负责人验收**：使用0.10.97，在规划对话提供信息不足的研究目标，确认待定/阻塞的下游可以保留粗骨架、已知日程保持、不编造文件/分工、讨论态不能建任务；补齐后再确认。没有创建合成生产账号、任务或消息，没有借用真实账号或发起模型请求；隔离测试通过不能替代真实规划效果。

仅部署已审PR176与范围修正PR183：标题骨架在模型解析之前的必填冲突按明确待定/阻塞条件修复，原提示词/Skill/界面/特殊字段写回与同事原设计一致，第一/第三项补修没有重新带回。未清除或回填账号/消息/资料，未操作负责人客户端或使用私人模型密钥。0.10.97保持手动安装预发布、0.10.96仍Latest；有0.43新计划字段的使用者须升级配套客户端，新字段写入后采用兼容前滚，不能直接回0.42。 详情见[解析条件说明](../development/planner-skeleton-conditions.md)和[客户端预发布回执](acceptcat-0.10.97-preview.md)。

## 故障处理与失败留证

启动0.43前的恢复副本使用旧0.42镜像只读检查迁移历史和Plan，结果old042Compatible=true；这只证明切换前旧数据，不证明0.43开始接受新字段后的回退安全。切换脚本在starting/checking阶段故障时禁止自动回0.42，保留现状并前滚修复；不能恢复旧备份覆盖新写入，也不重跑一次性deploy.sh。本次未发生切换失败、回退或生产数据恢复。

source/build/preflight/isolated-tests/deploy/post-check最终均退出0。构建保留npm依赖下载速度警告；未放宽锁、权限或测试期限。两次旧Windows窗口读取被浏览器URL检查终止，发生在此前两个回合，均未执行服务器命令；本回合改用能明确识别当前URL的浏览器控制入口后正常完成。最初本机运维探针误用Skill中不存在的原句，上传前已改为原Skill实际文字并通过语法检查，没有改产品提示词。长预检粘贴曾呈现延迟，截图确认一次完整启动，未重复运行。

本机Git外证据：D:/deepseek-agent/.runtime/planner-skeleton-deploy-20261106，包含辅助脚本、preparation-notes.txt、preflight-observed.txt、独立公网原始响应、脱敏receipt.json、deployment-proof.txt/png；receipt SHA256 40df8437c4f5e0d783263ca01091911ba693e58c3b6880c013f828c25fa0a59b。服务器保留source/build/preflight/isolated-tests/deploy/post-check各日志及退出码、完整Compose命令、source/compiled manifest、备份与恢复/保全结果、其他容器/运行设置对比与behavior-validation.json。敏感基线与配置只留服务器，不输出compose.env或密钥。
