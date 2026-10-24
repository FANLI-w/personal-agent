# Windows 0.10.43：统一可编辑的科研同伴

2026-10-25，北京时间；本批从10月24日开始。负责人要求所有Agent都有同事感并能在前端调整。核对干净目录、origin主仓库并fetch后，从main/c971d9c新建feature/unified-colleague-agents，普通merge PR102固定fbc462a保留展开布局；产品 **b16cbd610b16d6b07aeed2708579d19e2233b05f**，没有提前合入main。

## 变化与边界

任务规划复用本人“研究方案助手”联系人，读取其实际名称、角色和获准记忆；普通聊天、规划和资料页共用助手设置，打开原角色档案/私人记忆编辑器。已有自改档案保留；规划内明确交流偏好指令沿现有确定性保存/撤回服务，不另调用模型，并读取真实保存回执。输入在准备助手期间改变时保留新草稿，切账号不继续创建或打开旧账号对话。[设计与明确限制](../development/unified-agent-colleagues.md)。

planRequest增加可选colleague引用，contract **0.31.0**；字段缺省保持缺省，避免改变旧请求的幂等摘要。后台独立核验本人站内专用助手及本人拥有、该助手已加入的直接会话，只读取获准档案/记忆，并在调度、心跳/回写重新核对摘要；修改人设/偏好后旧结果停止，用量保留。不授予新工具、材料或任务确认权限。原方案版本、明确日期、重试与创建确认保持，工作台本机线程尚未与联系人日常聊天合并为跨设备历史。

schema026保持，无迁移、依赖或锁变化。**新客户端的统一规划需要配套0.31后台**；旧后台下明确提示升级，保留原消息、方案和任务，不冒称新规则已生效。

## 实际验证与交付

- 完整根CI **776项/60文件**、2项生产CLI/HTTP、B0及生产边界通过；40项API定向包含新4项真实HTTP/SQLite加合成模型检查：同一档案/私人记忆和重启、跨账号/会话拒绝、排队人设变化、在途偏好变化及实际用量保留。
- 客户端 **36项**模板/准备流程/规划/依赖检查、renderer与Electron双类型通过，含旧/自改档案复用、错误身份拒绝、切账号阻止后续写入及旧幂等形状。最初类型检查因可变变量在回调内未收窄失败，改用已确认ID后通过；原失败保留。未放宽类型、预算、权限或断言。
- 根desktop:win冻结准备、两共享包先构建、客户端安装/工具链、生产Web/4 SDK、55运行包、NSIS/成品4入口及更新清单检查通过；既有构建警告保留。
- 桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.43.exe**，**87,407,785字节**，SHA256 **47d9a9d2848ac0a1e6d0d210e4dcaf9eca20c8fc1b0d5765230c2ce6e3df7fd1**，桌面复制摘要一致，旧包保留。
- Git外证据 **D:/deepseek-agent/.runtime/unified-colleague-agents-20261024**保存各检查/失败、打包、更新清单和delivery.json；[8个语言情境](../../evaluations/fixtures/unified-agent-colleagues.md)未实跑真实模型。实际安装/启动、浏览器产品、私人账号材料模型与双机体验按负责人要求未代验。

## 配套后台已上线（2026-10-25）

负责人明确要求“后台开始升级”后，重新核对Workbench、线上367367ea镜像及contract0.30健康状态、可用空间约9GB。上传前发现v3准备脚本仍检查更早的planning-reply标签，与367367ea基线不一致；该包未上传或执行。v4修正为实际research-colleague-20261024标签，保留原包/回执，路径/归档、Python及Bash语法重新核对通过。

实际上传 **unified-colleagues-b16cbd6-20261025-v4.tar.gz**，**100,919字节**，SHA256 **e960198f73e747c75b730eeface703eb9e5df218e2834fa44f3c6475bf9b7312**。Workbench上传至/tmp后，服务器复核SHA256、27个普通文件及安全相对路径，再解压新目录 **/opt/research-openim/ops/unified-colleagues-20261025**。不包含数据库、材料或密钥。基于固定生产367367ea镜像离线构建，不重新安装依赖；181份源/方法基线、10份叠加（5 API/5契约）、175份编译、32个方法文件/11方法及新旧运营种子源/编译摘要核对通过。**77项/4文件**服务器隔离检查全部通过，才进入停写流程。

北京时间 **2026-10-25 00:24:18—00:24:38**排空并停止API/worker，创建一致备份、独立恢复副本，核对103表全行与7原件摘要、26迁移checksum、SQLite完整性/外键，副本HTTP ready200/0.31及受保护接口401通过。没有执行迁移或创建测试账号/会话，也未连接外部模型/资料源。

- 产品 **b16cbd610b16d6b07aeed2708579d19e2233b05f**叠加已校验生产367367ea基线；新镜像 **research-openim-api:unified-colleagues-20261025** / **sha256:de6dce92354c90a7b29ba50f220cbd03d0f8cad8d1e01411cf4e42894d4e9c86**。
- 备份 **/srv/research-openim-backups/unified-colleagues-20261025-20261024T162420Z/research.tar.gz**，SHA256 **8071ed30a1c8d9a8729ca80ab4829355d21783e732631c9f16bf02d8cea95515**；配置输入随备份保存在config-inputs。备份仍在同一ECS，本批验证独立副本恢复，未验证异地或整栈灾备。
- 103表/7原件、20份既有配置/密钥输入的哈希与权限保持；个人模型默认、飞书连接/来源与私人集合范围、目录缓存保持，其他6服务ID/镜像/状态及API/worker运行设置保持。配置输入计数比前次多1是包含上次部署的images.yaml。
- 两服务同镜像running/restart0，API healthy，公网ready200、contract0.31.0，四个受保护接口匿名401。schema026、DSH0.2.1-rc.2、Cordis4.0.5保持，Harness仍not_verified。
- 广场同步仍GITHUB_CATALOG_SYNC=0，enabled=false/state=disabled/nextCheckAt=null，11条收录/19候选缓存保持。没有重新启用每日抓取或改变正常用户定时任务。

服务器摘要及各回执保存在上述运维目录；本机Git外证据目录补存deployment-summary.json、server-preparation-proof.png、deployment-proof.png。head **ef458eb**的Foundation三平台（40110621008）和Windows package（40110621009）四项检查均success；后续纯文档提交的自动检查另计，不把旧head结果算作新运行通过。桌面0.10.43原包摘要不变，未重新打包、代安装、进行私人材料/真实模型或双机体验验收。

## 回退与交付边界

当前生产Compose链是在上一批research-colleague-20261024/images.yaml之后追加本次目录images.yaml，同时指定API/worker；完整旧链保存在本次deploy.sh，不能仅用最早基础Compose文件启动。保留旧367367ea镜像和全部历史运维目录/备份。

回退保持当前schema026与上线后数据：先停止新API/worker，用本次cancel-bound-planning.mjs取消活动的colleague绑定规划并提升fence、保留实际用量，再用完整旧链恢复367367ea配对服务。必须核对取消回执；失败则保持停止并排查，不能让旧0.30 worker忽略新绑定运行。不能将备份数据库回灌覆盖上线后写入。本批成功，未执行生产回退；本机合成SQLite演练只取消活动绑定规划，旧规划/已完成/其他执行及用量保持。

最初运维包因Windows文本CRLF在归档前停止；v2显式字节写入，v3增加运营种子摘要比较，v4修正旧标签守卫，各原目录/失败/归档保留。初次本机Bash路径不存在，随后实际Git Bash语法检查通过；未把未执行步骤算作通过。

[PR103](https://github.com/luoyan96/personal-agent/pull/103)仍开放，未合main；本批没有公开Release，重新读取公开Latest仍[v0.10.37](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37)（422478602）。后台配套已上线，新界面使用桌面0.10.43候选包；注册超时未定因、飞书本人试点、原件在线/10MiB/无TURN及本机规划历史等边界保持。
