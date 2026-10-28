# 群聊中断后台故障修复

2026-10-27，负责人要求立即开始修复并打开ECS后台。本批从main/aaa0eea独立分支修复，产品a174c1729b52d041144ff807cc15bb847508d87b，[PR126](https://github.com/luoyan96/personal-agent/pull/126)待审。仅将本次worker故障修复叠加原生产镜像，不带入聊天界面PR125及schema028。

## 切换结果

北京时间**22:35:12–22:35:34**完成排空、停写备份、独立恢复核验和API/worker配对切换。旧镜像`sha256:28ee6231937556fda148308d9ee8576e859e7f0595fd99b50e1cca3af6874e21`更新为`research-openim-api:chat-worker-interruption-20261027` / **`sha256:160805d491fc81af3cbb5de39ed245ca51477b246a435f63753a93f1b91a7859`**。

contract0.34/schema027保持，没有迁移。API healthy、worker running（无独立healthcheck），均restart0；公网ready200，数据库/存储/认证ok，受保护接口401。Harness仍not_verified，未进行真实模型调用。

22:39:21再次核对（上线后约3分47秒）：API/worker仍为新镜像，均restart0，worker日志无生产失败事件，ready仍ok；观察窗口内也没有BUSY退避日志。该短时空闲健康观察不等于真实聊天或长时间负载验收，截图与可见输出记录保存在Git外。

本机冻结完整CI826项/65文件、生产入口3项/B0/Web/类型/构建通过；原代码两项新增SQLite锁竞争回归失败，修复后相关14项通过。服务器新镜像网络隔离、1536MiB、单测试worker下123项/9文件通过。5份源码/部署入口增量、194份编译、568份基线、48份方法及76份角色文件核验通过；运营seed、18角色/38旧默认映射/19方法及角色摘要保持。

停写快照和独立恢复核对104张表、8个原件的结构/数量/摘要、完整性与外键一致；恢复副本只验匿名HTTP边界，不调用用户模型。27份配置/密钥输入备份及摘要保持，账号、私人档案/偏好、模型设置、飞书来源和授权范围不变。其他6服务和API/worker运行设置一致；广场同步disabled/nextCheckAt=null，entries11/candidates19。

## 备份和回退

备份：`/srv/research-openim-backups/chat-worker-interruption-20261027-20261027T143516Z/research.tar.gz`，SHA256 **`87d884a54a8dbcbfc2943cdcffdc6a6b2b09c46b4df7ec6bfaa723b41120add4`**。备份位于同一ECS，已独立恢复核验，不代表异地灾备。

运维目录：`/opt/research-openim/ops/chat-worker-interruption-20261027`。完整Compose链在原chat-context-output-reserve-20261027/images.yaml之后追加本目录images.yaml。必要时停止新API/worker，沿原完整链配对恢复28ee6231镜像，保留当前数据；不能回灌旧快照覆盖后续写入。无schema变更，本批未触发回退。

## 诊断和证据边界

现场worker曾累计重启29次，当天6条中断请求未保存模型回执；旧生产日志仅有通用错误，没有可还原的异常堆栈。因此本次修复有旧代码可复现的锁竞争证据，但不能声称已证明所有历史退出均由同一原因引起。新增诊断仅保留阶段、受限错误类/SQLite码及项目源码位置，不输出异常正文、SQL、聊天或凭据。

没有重放旧请求、修改其结果或将未知用量当零，没有操作现用客户端或代做真实群聊验收。原中断记录继续显示；下一次新请求走修复后的后台。此次无需Windows新安装包，未合main、公开Release或修改更新清单。

本机Git外`D:/deepseek-agent/.runtime/chat-worker-interruption-20261027`保存UI可见诊断、运维脚本及回执。紧凑部署回执SHA256为`acb6379dc606234efa00b82bf93ee2544400366a7bf588a8c36a177a6679430d`，从Workbench可见输出提取并核对服务器字节长度/摘要，运行数据库和私有配置未下载。

首次Dockerfile使用本地镜像ID作FROM被误当远端仓库，隔离构建在停写前失败；改用已有标签且保留镜像摘要前置核验。原包133104字节/SHA256 `30896a3b350f83b41d99cf6e6a675383052e3cbaf604a8f1cf99deb8bed9dc56`，实际构建唯一更正Dockerfile的SHA256为`5a64f90e3ab3f8e3e2fae2096b80bdc0d2707d010dd8457f0a7ad0ef763fc507`。一次辅助脚本转义错误及首次失败日志保留，未影响生产；修正后构建/隔离回归/部署成功。
