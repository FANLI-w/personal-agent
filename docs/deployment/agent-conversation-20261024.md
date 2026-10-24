# 科研助手交流规则后台升级（2026-10-24）

负责人明确表示后台已登录并授权修改。本次沿现有阿里云 Workbench 连接部署已完成的0.10.39后台部分，没有合并PR或公开新Release。部署完成时间为北京时间 **16:23:50**；桌面界面、规划prompt和模板仍使用本机0.10.39候选包，真实使用体验由负责人检查。

## 版本与实际范围

- 产品源码：`e48852eda15e8512ef59ce3c9ddae1f8c2e1a6a6`，分支`fix/agent-conversation-flow`、[PR97](https://github.com/luoyan96/personal-agent/pull/97)，包含PR96；部署时两PR开放，随后获明确指令合入main/a08a63a，两PR均MERGED。
- 新镜像：`research-openim-api:agent-conversation-20261024-v2`，实际ID **`sha256:7fa2e86e6f8847e5341b35077b5cc75971af72a53800955af74722b6952ad376`**。
- 原镜像：`research-openim-api:peer-library-20261023`，ID `sha256:2677f6936ae5ff05c229a88a8a5c161c0f06570cb77096d57f60349d4304423c`，保留作同schema回退。
- contract **0.30.0**、schema **026**保持，**未运行迁移**。DSH0.2.1-rc.2/Cordis4.0.5及依赖保持，未升级框架或引入工具权限。

在实际生产镜像上覆盖10个API源文件、11个canonical方法正文和拆解方法README，并补齐当前产品中已有的`packages/research-skills/src/import.ts`边界修复，共23文件。离线构建research-skills再构建API；114个基线源码、125个编译文件、32个方法文件与本机受审内容逐项核对，11个方法可加载。生产专用community-catalog-seed源文件和编译文件原样保留。

日常聊天、个人助理/委派、助手创建、资料/Skill、记忆/提醒失败提示及外部当条请求的共用交流规则已随API/worker上线：先使用已知背景提供帮助，确需时只问一个简单必要问题，方法字段由助手整理，审阅给具体依据和修法。没有改变业务确认、预算、权限或共享范围，也不自动覆盖用户已安装的私人Skill版本。

## 隔离检查与首轮失败

部署前读取PR97/a7699b8的三平台Foundation（运行40064919999）和Windows package（40064919993），四项均success；本机前批762项根CI/71项客户端/双类型/NSIS结果仍按原交付记录，不为本次纯部署重复运行。

首轮候选隔离检查93项通过、1项失败：精确120,000字符正文的Skill修订返回400。实际ESM契约接受此长度，进一步核对发现生产镜像仍是旧Skill导入实现，将YAML头也计入根文件长度；首版运维覆盖包漏带了当前产品已有的导入修复。**当时尚未停止或切换线上服务。** 保留首版镜像、目录与失败日志，第二版补齐该源文件和共享包源码/编译哈希，并补跑导入版本与文本上限检查，最终 **114项/10文件全部通过**，原阈值和断言未放宽；无仓库产品源码变更，无需重打桌面包。

第二版文件上传遇Workbench文件传输session过期，沿仍有效的现有终端传送已校验增量包，未增加SSH密钥、端口或权限。增量包SHA256 `d24d4bfd5e757bab8b6625b036af3f7075b22d4a0bebdde3a96de023e0d1036a`；脚本Windows换行在语法检查阶段被发现，规范为LF后通过`bash -n`才执行。两项准备失败均发生在停服前，证据保留，不计为线上故障或成功上线。

## 备份、切换与保全

北京时间 **16:23:30—16:23:50**，停写、排空队列、备份/恢复副本验证并切换两服务，维护窗口20秒。操作前后实际103张表、7个原件；SQLite完整性、外键、迁移校验和、schema对象、所有表的行数/内容哈希和原件哈希/权限在停写快照与独立恢复副本间一致。恢复副本与启动前在线目录再次核对一致；没有把生产数据下载到本机或交给模型。

- 备份：`/srv/research-openim-backups/agent-conversation-20261024-v2-20261024T082333Z/research.tar.gz`
- SHA256：`ae6cded16e2c6f77af4845bf49b985712841cb8c65c7ac9c9d574100d27d520a`
- 17个原配置/密钥输入文件在服务器备份，哈希和权限保持；API/worker的环境、挂载、命令、重启策略、内存、端口与网络配置保持。
- 个人模型Key/默认值、飞书连接/命名来源、集合及目录缓存保持；1个飞书库仍为`owner_private`，未扩大共享。
- 其他6服务的容器ID、镜像和状态保持，静态网页与`current`未切换。

现有Compose配置链最后追加`/opt/research-openim/ops/agent-conversation-20261024-v2/images.yaml`；此前链末尾为peer-library-20261023-v2。部署脚本设有失败恢复旧镜像的保护，本次未触发。相同026结构可在排空并停写两服务后移除最后一层覆盖、按原链重启2677f693；保留当前数据库及切换后的新写入，不能用旧快照覆盖新数据，更不能回退到025镜像。

## 上线回执与边界

两服务均running/restart0，API healthy。公网`/api/v1/health/ready`返回200/contract0.30.0，数据库、存储、鉴权为ok；课题组、飞书、个人模型配置和资料请求的未登录探针均401。恢复副本同样ready200及受保护接口401，未创建账号/会话、调用模型或连接外部资料。

两服务均保留`GITHUB_CATALOG_SYNC=0`；广场实际`enabled=false`、`state=disabled`、`nextCheckAt=null`，原11条目录与19条候选缓存保持。Harness健康仍为`not_verified`，没有实际模型质量验收。注册超时未定因、飞书本人试点、资料直连在线/10MiB/无TURN等边界保持。

服务器证据：`/opt/research-openim/ops/agent-conversation-20261024-v2`，首轮为同级agent-conversation-20261024。本机Git外：`D:/deepseek-agent/.runtime/agent-conversation-deploy-20261024`，含两版包/增量、哈希、准备脚本、GitHub回执、脱敏deployment-summary.json和成功截图。备份及恢复检查位于同ECS，不称异地灾备。

本次没有合并main、重打或代安装客户端、公开Release。公开Latest读取仍v0.10.37，本机0.10.39成品哈希保持。按负责人要求未追加产品界面、真实账号/材料/模型、原生启动或双机体验验收；规则上线不等于真实科研交流质量已验证。

后续独立合并：负责人明确要求合并后，2026-10-24 16:48:58将PR97固定head6d4df11合入main/a08a63a，PR96于16:49:00自动标记MERGED；合并前四项GitHub检查通过，合并树与受审head相同。本次合并没有再次操作后台、数据库或安装包。
