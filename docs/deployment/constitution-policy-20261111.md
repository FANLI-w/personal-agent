# 平台规则与权限后台更新回执（2026-11-11）

负责人在Windows0.10.100公开后单独授权更新后台。北京时间 **2026-11-11T16:32:10+08:00**，API/worker已成对更新到与该安装包相同的固定源码 **acffd5e4119602e881922714c4107b73d40e97ee**。平台规则 **v2 / 六条** 与PR195的服务端权限、分层/记忆调用回执已加载；契约保持 **0.45.0**、数据库保持 **034 / 116表**，没有新增迁移或清理账号数据。

通过用户已登录Edge的原阿里云Workbench root shell完成，没有新建SSH凭据、改变安全组/端口/Nginx/证书或操作使用中的客户端。安装包/公开Release0.10.100保持。

## 镜像与源码

| 项 | 实际值 |
| --- | --- |
| 源码与release tag | acffd5e4119602e881922714c4107b73d40e97ee / v0.10.100 |
| 服务器checkout | /root/personal-agent-acffd5e，rev-parse精确匹配，工作树干净 |
| 新镜像 | research-openim-api:constitution-policy-20261111 |
| 完整镜像ID | sha256:f3bdbf9fe016b499318d2c40a1831fbacff384e883fd5a653c59434e46de6d58 |
| 上一对镜像 | research-openim-api:constitution-library-20261109 / sha256:434c60fa4ce0380981e319bc217e59594b39ff94a0191307468f491cf15520cb |
| 运维目录 | /opt/research-openim/ops/constitution-policy-20261111 |
| 构建日志 | /opt/research-openim/ops/constitution-policy-20261111/build.log |
| 切换入口 | bash /opt/research-openim/ops/constitution-policy-20261111/run-deploy.sh |

原36层Compose链从API/worker运行标签取回并核对一致，追加本批images.yaml为第37层，只启停research-api/research-worker，up带 `--no-build --no-deps`。复制上一批已验证Dockerfile，SHA256 `338fb35457d3276b22e84e72d9d0beac57eb38255300a2348716d363e33640f7`；research-skills/constitution构建步骤、025原LF/2111字节与现网CRLF/2144字节双向断言原样保留。全部34份迁移与固定Git提交匹配；032/033/034保留LF/652、290、732字节，没有改schema_migrations。

镜像523份源码输入全部匹配，API/worker各13份编译模块及原task-decomposition Skill摘要匹配镜像。两容器均实际导入平台规则version2、六条，并确认constitutionRules开启；个人偏好3500字节/12条与工作台32KB事实预算分开。既有角色、Skill、模型配置及密钥没有改动。

服务器镜像内9文件97项隔离测试通过，network none、无生产挂载，覆盖规则范围、候选审核、转交后的作者权限、来源发起人审核、私人记忆及旧响应兼容。源码本地完整CI935项、客户端403项和固定main四项CI此前已通过，详见[0.10.100发布回执](acceptcat-0.10.100-release.md)，不冒称本次又重复执行全套检查。

## 备份与数据保全

- Worker排空停止：`2026-11-11T08:31:44Z`；API停止：`2026-11-11T08:31:45Z`；可用：`2026-11-11T08:32:10Z`（UTC）。
- 科研库一致备份：`/srv/research-openim-backups/constitution-policy-20261111-20261111T083147Z/research.tar.gz`。
- 备份SHA256：`d1e7df73970e63e97473210f1f30383fa62615026d5c50b8b95d20463777637a`。
- 数据库迁移记录 **34→34**，表数 **116→116**；恢复副本及正式库各执行两次migrate，第二次保持不变。
- 恢复副本确实从tar解包，完整性ok、外键0；新镜像和上一批0.45镜像分别通过隔离HTTP/契约检查。现存187份plans/plan_versions、3份规则/修订文档可解析，未创建账号、会话或模型请求。
- 正式启动前全部旧行、迁移历史、SQLite对象、9份原件及文件模式逐项相同；41份配置/secret输入受限备份后摘要/模式相同，不输出内容。私人凭据/默认模型、飞书连接和资料/集合范围、社区同步关闭保持。

沿用部署互斥锁、构建前3GiB与切换前2GiB空间门槛，另核算科研目录备份/恢复空间。未清理旧镜像、卷、备份或聊天记录。

## 运行与公网验证

API healthy、worker running，restartCount均0；另外六个容器ID、镜像、状态和重启数不变。前后证据摘要同为 `8dd899f7ac6c98f20ea43cd2e221574fc30fde0839c359df4f95f8d7def8cd70`。API/worker原环境哈希、挂载、命令、重启策略、内存、端口与网络保持。

服务器与本机独立公网ready均HTTP200，原始body：

```json
{"data":{"status":"ok","contractVersion":"0.45.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

资料仓库、个人规则、课题组规则旧/新能力头、资料索引、会话及session匿名读取均401；合法格式的个人规则/仓库匿名写入也401，没有业务写入。本机匿名课题组规则原始返回：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"1b6f1aa7-fe79-4379-9380-77df1ce5a2e1"}}
```

真实任务、模型效果与团队权限操作由负责人用0.10.100验收，本批没有代建规则、绑定私人仓库、使用私人研究资料或模型密钥。97项合成隔离验证不等于真实模型效果验收。

## 回退与运行记录

本次没有schema或数据形状变更，恢复副本已验证上一批0.45可读取当前034及现有文档。需要回退时停API/worker，使用本批保存的完整链与fallback-images.yaml成对切回原镜像，使用当前数据库，不先迁移或恢复旧备份。本批未触发回退。这不授权退回更早的0.43；旧0.43仍不认识034。

build/preflight/isolated-tests/deploy/post-check最终退出0。构建下载canvas依赖曾自动重试，随后完成；本机生成辅助脚本时一处补丁格式错误在上传前修正，未影响服务器或生产。所有日志/脚本在受限运维目录保留；本机对应证据位于Git外 `D:/deepseek-agent/.runtime/constitution-policy-deploy-20261111`。脱敏receipt.json SHA256 `50d0affe3427ecb86ea4310b7ef0d93a651bf5e5431b50f4895acc0097e50876`，从Workbench可见输出导出后校验一致；部署结果截图、独立公网原始响应也已保存。没有通过改产品代码或放宽鉴权让探针通过。
