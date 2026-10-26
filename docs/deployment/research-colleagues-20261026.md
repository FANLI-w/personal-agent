# 0.10.52科研同伴角色配套后台升级

2026-10-26，北京时间。负责人在PR112合并、0.10.52公开后明确同意“后台可以升级一下，我已经登录了”。本批仅升级配套API/worker，不重打安装包、不移动发布tag。

## 版本与范围

固定[0.10.52合并提交667bc34](https://github.com/luoyan96/personal-agent/commit/667bc34fea851fea0c929e975f3467474eedcc71)，在已校验的生产镜像7d75165a上叠加8份API源文件及统一角色/方法包。新镜像 **research-openim-api:research-colleagues-20261026** / **sha256:acf4b711a791d4110f20b3c63af99456df54c187c875e5a18f8bfe7700b959d2**。保留生产运营种子及此前飞书、资料、课题组、聊天和规划修复，不用整仓覆盖现有生产基线。

18类角色、37份旧默认档案的精确只读投影和19方法的共同加载现已进入后台；保留用户编辑、私人偏好、联系人身份及已安装私人Skill版本，不批量重写角色或自动安装方法。contract **0.32.0** / schema **026**保持，无迁移。角色和方法不增加浏览器、生图、脚本或PPTX执行工具。

## 构建、隔离检查与失败记录

先确认API/worker仍为7d75165a、running/restart0，公网ready200/0.32，磁盘约9GB空闲。固定公开源码归档 **37,224,249字节**，SHA256 **de6707bba3efb06b63073960a67d8662e23b702ae5cc47d17fa0e1dc10b55d52**，本机与服务器一致。仅按清单提取普通文件并逐个核对摘要，不直接展开归档中的任意路径或链接。

部署运维包v2 **37,376字节**，SHA256 **1b708f12c6e23a5cdca93145310e65b46e5eb56419c8ac8d7d587deea683d22e**。文件管理上传因会话过期在选择文件前失败，已连接终端仍可用；改从终端传入同一归档，大小/摘要、安全13文件和117份叠加源/10份测试提取均核对后才运行。首版本地包漏选README、初次只读探针用错容器短名/端口等记录保留，没有切服务。

现有依赖离线构建，pull=false/network none，不force安装、不拉新基础镜像。构建前183份基线源/方法摘要符合预期；构建后117份叠加源、183份编译文件、76份角色文件、48份方法文件与受测源码/成品一致，两个生成目录均逐字核对。18角色/37旧档案/19方法、roleCatalogDigest **3d8c7e10f8df34f23ef2d46f5a10a9e50af367a7f07b5c50e3a88cfe5138b920**确认，运营种子源及编译摘要保持。

首轮在构建后校验失败：旧保全清单包含dist/skills的旧摘要，与本次合法生成内容冲突。保留first-prepare/build/source-check及原探针后，仅修正运维探针的摘要映射：本次编译/方法文件对照0.10.52精确摘要，未改动文件仍对照旧基线；构建前基线守卫不变。没有改产品、测试、权限、预算或时限，失败发生在隔离测试与服务切换之前。修正探针SHA256 **57f535858f31eb87c61fa239f1d8138294042f15272e15b46484f1ee2b0e3bc4**。

服务器 **127项/10文件**隔离检查全通过，含聊天、个人助理、连续上下文、规划输出/私人模型、资料权限、角色导入/旧默认复用和方法私人安装/绑定/选择。测试容器network none、无生产数据挂载，只用合成模型与临时库；prepare.exit=0/PREPARATION_OK后才进入部署。

## 停写备份、恢复核对与上线

北京时间 **10:02:14—10:02:36**排空请求并配对停止API/worker写入。停写时execution/chat均无queued/running工作；完成数据库与原件一致备份、配置备份及独立恢复核对：schema026迁移checksum、**103张表**结构/全部行、**7个原件**摘要/权限、integrity/外键均保持。恢复副本HTTP ready200/0.32、受保护接口401，没有创建账户或会话；HTTP检查后重新核对恢复副本及上线前原库。

备份 **/srv/research-openim-backups/research-colleagues-20261026-20261026T020217Z/research.tar.gz**，SHA256 **1ea691d7210b59cf271b2465c6d71c0b0bc06e4ccfbd16fb6be9c1bea25e16ea**。**22份配置/密钥输入**的摘要、权限及受限备份一致，不输出正文。数据库及备份仍在同一ECS；独立恢复核对不代表异地或整栈灾备。

API/worker以同一新镜像配对启动，均running/restart0，API healthy，公网ready200/contract0.32，四个受保护接口匿名401。原环境、挂载、命令、资源/重启/端口/网络配置及其他6服务ID/镜像/状态保持；账号/模型默认值、角色档案、私人记忆、飞书连接与资料范围摘要保持。本次已有1个飞书集合为lab_shared，切换前后相同，没有自动扩大共享。GITHUB_CATALOG_SYNC=0，实际enabled=false/state=disabled/nextCheckAt=null，11收录/19候选保持。DSH0.2.1-rc.2/Cordis4.0.5保持，Harness仍not_verified。部署exit=0/DEPLOY_OK。

## 回退与证据

运维目录 **/opt/research-openim/ops/research-colleagues-20261026**。完整旧Compose覆盖链末尾在planning-conversation-20261025/images.yaml后追加本目录images.yaml，只切API/worker，Nginx、current及静态网页保持。

本批与原7d75165a同契约/同schema，角色投影只读；若需回退，先配对停新API/worker，再用原完整Compose链配对启动旧镜像，核对健康及配置。**不取消原有任务，不回灌旧数据库覆盖切换后的消息或任务**。本批未实际触发回退，不能把预设恢复脚本说成执行过的回退演练。

原始日志、deployment-summary.json、配置摘要、备份及success.txt留服务器受限目录。本机Git外 **D:/deepseek-agent/.runtime/research-colleague-backend-20261026**保存运维包/源码摘要、首轮记录、修正探针、preparation-proof.png、deployment-proof.png及按可见回执整理的observed JSON；文件管理过期，未冒称下载原始服务器JSON。密钥、用户材料、运行库及构建产物不入Git。

本批没有重打或改动0.10.52安装包/公开Release，也没有代安装、原生启动、真实模型、私人材料/飞书、双机或绘图/PPT实际导出体验验收。检查使用数据摘要确认保全，不读取用户材料正文作评价。他人真实注册超时根因仍未确定；飞书本人应用试点及原件互传在线/10MiB/无TURN等边界保持。
