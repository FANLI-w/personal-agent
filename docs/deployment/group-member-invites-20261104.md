# 群成员邀请后台部署回执（2026-11-04）

负责人在 PR #168 修复交付后说明「后台打开了」，授权使用已登录阿里云 Workbench 的原实例 root shell 更新本批后台。没有新建 SSH 凭据，没有改安全组、端口、Nginx、证书或 callback 校验；没有代操作真实客户端或创建生产测试账号、群、邀请和模型调用。

## 线上源码与镜像

| 项 | 实际值 |
| --- | --- |
| 源码分支 / PR | `fix/group-member-invites` / [#168](https://github.com/luoyan96/personal-agent/pull/168) |
| 部署提交 | `6359c2087a76db04ce9b2e37c6d6b79437d591df` |
| 独立源码目录 | `/root/personal-agent-6359c20` |
| 新镜像 | `research-openim-api:group-member-invites-20261104` |
| 新镜像完整 ID | `sha256:96f0ea92ca9c758a3856923b121debed17faa7f2902b4c53f1584b7455308bc1` |
| 上一对实际镜像 | `research-openim-api:library-index-20261101` / `sha256:b60dc27e68fa54b96a29f1df4a58dfa3cb7e52929843632c264f1bb58e4524ef` |
| 运维目录 | `/opt/research-openim/ops/group-member-invites-20261104` |
| 构建 / 切换日志 | 运维目录下 `build.log` / `deployment.log`，对应 `.exit` 均为 0 |
| worker 停止时间 | `2026-11-04T03:08:30Z` |
| API 停止 / 可用时间 | `2026-11-04T03:08:31Z` → `2026-11-04T03:08:52Z`（北京时间 11:08:31 → 11:08:52） |

服务器直接从 GitHub 获取分支，`git rev-parse HEAD` 精确匹配上述提交，工作区干净，无需源码包回退。该提交的三个 Foundation 检查（Linux Node 22/24、Windows Node 24）与 Windows 打包检查在部署前均 SUCCESS。镜像 label、492 份构建输入与指定 Git 提交逐文件哈希一致；运行中的 API 和 worker 均再次核对 `chat.js` 与 `group-membership.js` 哈希。

复用 `group-direct-join-20261031/Dockerfile` 运维副本：先构建 research-skills，再编译 API；保持 025 的 LF 源码 / CRLF 现网字节双向断言。032 仍为 LF / 652 字节，校验通过，未修改指定 checkout 或 schema_migrations。

相对旧线上 6c93fdc，运行逻辑主要为普通群成员邀请与社交群成员关系解析；同时包含已进入 main 的计划契约兼容扩展（可选 status/missing，问题兼容字符串或带 options 的对象），仍接受旧计划格式。部署不是将未提交补丁覆盖进生产。

## 完整覆盖链与数据保全

沿用 `library-index-20261101/deploy.sh` 的完整 Compose 链，在其最后追加本批 `images.yaml`。旧链本身包括基础生产 Compose 和全部历史覆盖，到 task-handoff、group-direct-join、task-invite-cards、lab-standards、library-index 为止；没有只用基础 Compose 重建服务。

本次参数由运维目录 `deploy.sh` / `deploy-command.txt` 记录；只对 `research-api research-worker` 执行 stop 和 `up -d --no-build --no-deps`。获得已有部署互斥锁后核对实际镜像及 config_files，排空队列，先停 worker 再停 API。静止基线中执行/聊天队列均为 0。

一致备份文件：

```text
/srv/research-openim-backups/group-member-invites-20261104-20261104T030832Z/research.tar.gz
SHA256 b367585d5fb9c4c4666ec0639e2b5363a58ecd545247744700fd65bc8ea0f510
```

备份校验通过，并实际解包恢复；没有恢复覆盖正式库。schema **032 → 032**，表数 **113 → 113**；恢复副本和正式库均迁移两次（`repeated=true`），完整性、外键、全部业务表行数据摘要、迁移记录、9 份原件及其他文件与静止基线一致。36 份配置/secret 输入完成备份及哈希保全，不公开任何值。社区同步仍关闭，飞书连接/资料范围、个人凭据/默认配置、集合范围均未变。

## 服务与公网原始返回

API healthy、worker running；实际镜像均为本批新 ID，restartCount 均为 0。其他六个服务为 openim-server、minio、etcd、kafka、mongo、redis；ID、镜像 ID、状态逐字一致，`others.before` 与 `others.after` 均为：

```text
SHA256 83bddb0a518402f5fbf7ef1d023e0bd8d75493ba30387ffbd4af5332bde50922
```

API/worker 的配置环境哈希、挂载、启动命令、重启策略、内存、端口与网络同样保全，settings.before.json/settings.after.json 通过 cmp。

公网 GET `/api/v1/health/ready`：HTTP 200，原始 body（服务器及本机独立请求均一致）：

```json
{"data":{"status":"ok","contractVersion":"0.41.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

匿名 GET `/api/v1/chat/conversations`：HTTP 401，原始 body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"992da688-b89a-4386-8639-4752549d6a96"}}
```

匿名 GET `/api/v1/auth/session` 和 `/api/v1/library/index` 同为 401。带合法格式及幂等头、无账号的 POST `/api/v1/im/conversations/deployment_probe/invite`：HTTP 401，原始 body：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"69c40155-430a-464f-9004-19b6e0a00b32"}}
```

这些探针没有认证会话，不会创建群或邀请。`harness: not_verified` 不是实际模型验收。

## 真实验收与回退

**待负责人真实验收**：让已经加入群的同事重新打开聊天详情，邀请其自己的个人助理和有权限的联系人；确认直接入群、目标会话立刻可见、正常发消息及明确 @ 助理后在原群回答。不会借 Agent 成员身份让未入群的所有者读历史，也不授予任务、资料或私人记忆权限。被移出群后不应再能邀请。行为记录 `behavior-validation.json` 明确 pending_owner，没有伪造请求/返回摘要。

没有新迁移；已保存旧 API/worker 的实际镜像，并创建本批 fallback 标签。恢复副本上用旧 0.41 做只读迁移历史和已存计划契约检查，返回 `{"schema":32,"old041Compatible":true,"readOnly":true}`，没有执行真实回退。若新版随后写入旧版不支持的计划格式，回退守卫会拒绝直接启动旧镜像并要求兼容前滚；不能仅凭契约版本相同就绕过校验，更不能恢复旧备份覆盖新数据。032 之前的旧 0.40 不在本批回退链中。

main 尚未合并，Windows 0.10.92 仍是本机候选，公开 Latest 仍 0.10.91；本次只部署配套后台。

## 失败尝试与证据

| 尝试 | 实际结果与保留证据 |
| --- | --- |
| 首次只读容器查询使用 local 前缀 | no such object；随后从 docker ps 确认 production 前缀，无线上修改。本机 preparation-notes.log 为事后摘要 |
| 首次匿名邀请 POST 探针缺少必填幂等头 | 返回 VALIDATION_ERROR，检查脚本断言失败；仅补探针的 Idempotency-Key 后得到 401，未修改产品代码或数据。运维目录 `post-check.py.first`、`post-check.log.first`、`post-check.exit.first`、`anonymous-invite-public.{json,headers}.first`、`post-check-first-note.txt` 保留 |
| Git 获取、构建、实际切换与最终复查 | source/build/deploy/post-check.exit 最终均为 0，没有部署失败或执行回退 |

服务器其余证据：rollback-images.txt、Dockerfile、build.sh/source.sh、source-head.txt/source.log、prepare-ops.py/preparation.log、manifest.json/source-check.json、artifact-check.json、new-image.txt/image-inspect.txt、deploy.sh/deploy-command.txt、baseline-summary.json（完整私有基线留服务器）、backup-path.txt、copy-migration.json/live-migration.json、copy-migration-preserved.json/live-migration-preserved.json、config-preserved.json、others.before/others.after、settings.before.json/settings.after.json、post-check.log、receipt.json、behavior-validation.json 以及各公网原始 body/headers。

本机 Git 外证据目录：`D:\deepseek-agent\.runtime\group-member-invites-deploy-20261104`，含脱敏 receipt.json、独立公网请求、辅助脚本和部署截图；没有上传配置文件或私人资料。
