# 规则框架与团队资料后台0.45 / 034部署回执

2026-11-09 **18:43:55 北京时间**，负责人单独授权后，API/worker 成对升级到 **contract0.45.0 / schema034**，固定源码 **cc04d955dd03d3cf3a79ee1458f5b7d0e8088877**（与 Windows0.10.99/tag 一致）。恢复副本与正式库各执行两次迁移，**032→034、113→116表**，第二次未改变记录；完整性、外键、全部旧行及原件/配置保全通过。

通过已登录 Edge 的原阿里云 Workbench root shell完成。仅操作 API/worker，没有新建SSH凭据或更改安全组、端口、Nginx、证书；没有重新发布安装包、清理账号/消息或使用真实模型验收。

## 源码、镜像与构建

| 项 | 实际值 |
| --- | --- |
| 固定提交 | cc04d955dd03d3cf3a79ee1458f5b7d0e8088877 |
| 服务器 checkout | /root/personal-agent-cc04d95，rev-parse HEAD精确匹配，工作树干净 |
| 新镜像 | research-openim-api:constitution-library-20261109 |
| 完整镜像ID | sha256:434c60fa4ce0380981e319bc217e59594b39ff94a0191307468f491cf15520cb |
| 上一对API/worker实际镜像 | research-openim-api:planner-skeleton-20261106 / sha256:45290283bd36d6410eb9c09671e2a49b49d31c424f6d1dfefc800b39e2c638a6 |
| 本次运维目录 | /opt/research-openim/ops/constitution-library-20261109 |
| 构建日志 | /opt/research-openim/ops/constitution-library-20261109/build.log |
| 切换入口 | bash /opt/research-openim/ops/constitution-library-20261109/run-deploy.sh |

复制上一批运维Dockerfile（SHA256 `7a482c69373be322c6d9d1e76531b21959c22933eb8e31702ea1190437d5666b`），仅在research-skills后补constitution编译；新副本SHA256 `338fb35457d3276b22e84e72d9d0beac57eb38255300a2348716d363e33640f7`。保留025源码LF/2111字节→现网CRLF/2144字节的双向断言，032/033/034分别LF/652、290、732字节。没有修改指定checkout或schema_migrations。

镜像517份源码输入与固定Git内容逐一匹配（025仅按已验证历史字节处理）；运行中的API/worker各12份编译模块和task-decomposition Skill摘要再次匹配镜像。与旧0.43回执比较，原task-decomposition Skill一致；原角色/模型配置及密钥保持。新增分层规则按本批设计进入相应上下文，并非宣称所有上下文逻辑没有变化。

镜像内9文件93项隔离用例通过，network none、无生产挂载、合成身份和模型，覆盖规则范围/个人隔离、旧客户端投影、预算失败、方法来源/审核、资料仓库权限与032升级。对应固定提交的完整根CI及客户端构建记录见[0.10.99回执](acceptcat-0.10.99-release.md)，没有用合成测试冒充生产账号验收。

## 备份与迁移保全

完整Compose覆盖链从运行中API/worker的35份config_files取回、核对一致，在planner-skeleton-20261106/images.yaml之后追加本批images.yaml。实际命令保留deploy-command.txt；只启停research-api research-worker，up带`--no-build --no-deps`。使用既有互斥锁，构建前3GiB、切换前2GiB门禁保持；另核算约24.9MB科研目录的备份+恢复空间与额外余量，未清理旧镜像、卷或备份。

- 排空后worker停止：2026-11-09T10:43:31Z（北京时间18:43:31）。
- API停止：2026-11-09T10:43:32Z（18:43:32）。
- 可用：2026-11-09T10:43:55Z（18:43:55）。
- 一致备份：`/srv/research-openim-backups/constitution-library-20261109-20261109T104334Z/research.tar.gz`。
- 备份SHA256：`c7f368abe69ab2eec790e257fee8e2b2c2f0da8ff4b19e454ec53ead073b846b`。

停写后保存原032的全部表/行摘要、迁移历史、SQLite对象、原件哈希和文件模式。备份校验后实际解包恢复，在恢复副本连续迁移两次并启动隔离HTTP服务，验证187条plans/plan_versions档案由0.45契约正确解析，匿名请求401；副本没有创建账号、会话或调用模型。现场既有规则文档为0条，非空规则兼容由隔离用例验证，不声称生产中已验收过非空规则。

演练通过后才正式迁移，并再次连续执行两次。恢复副本及正式库均34条迁移、116张用户表（含schema_migrations），新增team_library_repositories、personal_work_rules、personal_work_rule_revisions及索引；新表在迁移后/服务启动前为空。001–032迁移记录、原表SQLite对象、全部旧行摘要、9份文件及模式均一致。integrity_check为ok，foreign_key_check为0。40份配置/secret输入完成受限备份并确认摘要/模式未变，不输出其内容。

API healthy，worker running，restartCount均0；其他六容器的ID、镜像、状态和重启数逐字相同。before/after摘要均 `8dd899f7ac6c98f20ea43cd2e221574fc30fde0839c359df4f95f8d7def8cd70`。API/worker环境哈希、挂载、命令、重启策略、内存、端口与网络保持。私人凭据/默认模型、飞书连接与资料范围、集合范围、社区同步关闭状态保持。

## 公网与行为边界

服务器和本机独立公网ready均HTTP200，原始body：

```json
{"data":{"status":"ok","contractVersion":"0.45.0","checks":{"database":"ok","storage":"ok","authentication":"ok","harness":"not_verified"}}}
```

资料仓库、个人规则、课题组规范（旧/新能力头）、索引、会话和session匿名读取均401；合法格式的个人规则/仓库匿名写入也401，没有业务写入。本机匿名session原始返回：

```json
{"error":{"code":"UNAUTHENTICATED","message":"Request could not be completed.","requestId":"631de172-d726-48e6-b756-76485f0f6807"}}
```

**真实工作流待负责人验收**：使用0.10.99测试个人规则修订、课题组方法来源/审核、Git仓库配置与资料取用。仓库绑定未代填、规则未代建；没有取用私人素材或真实账号/模型。旧客户端仍使用同一数据源/ACL的能力投影，Git文字不会自行扩权或覆盖生效规则。

## 恢复边界与失败记录

旧0.43镜像与fallback标签保留，但恢复副本已实际验证旧0.43拒绝034迁移记录；**正式迁移开始后不自动切回旧镜像、不恢复旧数据库覆盖新写入，采用兼容前滚修复**。仅在正式迁移前失败、原库仍032且通过旧代码只读检查时允许成对恢复旧服务。本批没有发生切换失败或恢复生产旧库。

source/build/preflight/isolated-tests/deploy最终均退出0。第一次post-check使用空POST请求体，被格式校验先返回VALIDATION_ERROR，探针期待401的断言失败；保留post-check-first.py/log/exit及*-first-public原始响应。改为合法请求格式后，全部匿名读写401、post-check退出0。没有改产品代码或放宽鉴权来让探针通过。本机生成辅助脚本曾有历史断言子串误匹配，上传前已修正；最初只读docker inspect使用短服务名未匹配，改用实际Compose容器全名；均未触碰生产。镜像构建保留依赖下载慢等警告。第一次证明截图因终端清屏时序只剩prompt，保存为empty-rejected，改读取原始post-check.log后截图验证，不拿空白图当成功证据。

Git外证据：`D:/deepseek-agent/.runtime/constitution-library-deploy-20261109`；脱敏receipt.json SHA256 `87265aa0bb10066fca60b47aa1bd67269d1589f0d5af5cd8941aa32061ca8d1e`，与Workbench输出摘要一致。本机另有独立公网原始body/headers、辅助脚本与deployment-proof.txt/png。完整数据库基线、配置/secret备份只留服务器受限目录；服务器保存source/build/isolated-tests/deploy/post-check日志、完整Compose链、镜像摘要、copy/live迁移与逐表/文件保全、其他容器及运行设置对比、behavior-validation.json。
