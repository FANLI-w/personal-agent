# Windows 0.10.33：课题组创建、邀请与成员管理

2026-10-22，北京时间。产品提交 **c46295f58d613b97f8b2a97e37290edb861b22db**；分支feat/lab-membership，目标主仓库main。fetch时main仍b7f5742，从main新建分支后快进纳入PR84/85/87至c6c2efd的未合并依赖；不在旧功能分支直接堆需求，不改共享main。

## 客户端与源码

「我的 → 课题组」可用当前账号创建组，按AcceptCat号邀请已有账号并由本人接受/谢绝，也可生成/撤销邀请码供新用户注册或已有账号确认加入。显示实际成员、待接受邀请与邀请码使用/过期状态；可切换个人空间/多个已加入的组、修改所负责组的名称，负责人移除普通成员、普通成员退出。每账号当前最多负责一个组；负责人暂不直接退出/转让，仍承担未完成任务发起/审阅职责的成员须先完成或取消相应任务。这些限制明确显示，不把自动交接或解散算作完成。

原账号home ID、私人会话和联系人ID、模型Key/默认设置及飞书密文范围保留。新建/加入不默认分享私人资料；课题组任务和共享资料基于实际成员授权，跨组/退出/移除/读取中撤权受后端限制。移除后结束普通分工、收回旧任务权限，本人共享库改私人，后续重加不恢复旧授权；旧组模型兼容使用也停止。详细接口、数据及权限边界见[实现说明](../development/lab-membership.md)。

## 实际检查

- 根pnpm11.21 frozen安装、最终完整pnpm run ci成功：58文件/**749项**；另2项生产CLI/HTTP检查、B0两次实际HTTP启动、生产无夹具检查通过。包含11项本地HTTP/SQLite成员管理检查，以及20项合成Feishu源检查中的2项新成员跨home加密/查询中移除场景。合成模型与资料不当作真实科研或飞书授权效果。
- 025从模拟024升级和重复迁移：成员、账号、会话、私人模型密文/默认值及集合原行保持，旧共享映射与兼容成员、完整性/外键检查通过。初始源码交付阶段尚未操作生产；后续单独授权的生产025迁移见下文。
- 客户端corepack pnpm10.28 frozen安装，最终渲染TypeScript、主进程TypeScript、2项service与3项auth自动检查通过；无锁文件/依赖改动。安装时Husky因目录所有者检查跳过，未修改全局Git信任或声称hook安装成功。
- 最终生产Web与固定4项SDK资源检查、Windows x64 NSIS打包通过，55个装配运行包，--publish never。首包后修正切换课题组时保留私人写操作重试键，按最终提交重打；首包保留Git外，不作最终交付。
- 按用户安排，未追加浏览器/真实账号、私人资料或实际模型、安装器载荷提取、原生启动/安装后体验验收；类型、文件哈希及打包成功不代替实际产品体验。

Git外 **D:/deepseek-agent/.runtime/lab-membership-20261022** 保存所有日志、失败证据、首包、最终delivery.json及后台候选。首次重复导入导致测试收集失败、夹具POST空body、移除任务时事件枚举不合法及其修复、403断言纠正和合成旧模型表夹具列数错误均保留；最终完整CI通过，不删除失败记录或将其描述成已执行的真实验收。

## 本机安装包

**C:/Users/luo/Desktop/AcceptCat_0.10.33.exe**，**87,433,858字节**，SHA256 **e3bdde49eeef858469b49528bbd66b123ac9bea8bcb2e14e1ae62df71e1028e3**。源文件与桌面副本哈希相同，已放桌面、未代安装；旧包保留。没有上传公开Release、打标签或修改自动更新源，公开版本沿已记录的v0.10.29。

## 后台：用户单独授权后已部署0.29/schema025

用户随后明确表示“阿里云页面已经打开了，你升级吧”。沿Edge既有Workbench同实例、同root连接完成升级，没有新增SSH/Key、端口、飞书成员或授权。实际维护北京时间 **2026-10-22 12:16:24—12:16:44**（UTC04:16:24—04:16:44）。API/worker当前 **research-openim-api:lab-membership-20261022-v2** / **sha256:0212513c5e9d4109cba892462c4953f9c440e96dc13007178635aca6c58395fb**，两者running/restart0、API healthy，公网HTTPS ready200/contract0.29.0。三条未登录受保护入口401；schema025。DSH0.2.1-rc.2、对应API Key适配器及Cordis4.0.5保持，Harness仍not_verified，不声称真实模型效果通过。

部署增量对应产品c46295f，在595bed13实际组合镜像上仅覆盖27份已审源码，使用固定旧镜像内的Linux编译器离线构建，无新依赖或网络安装。103份基底源守卫及50项规范化编译检查通过，其他源/旧24迁移及运营种子保持；两实际运行容器的27份源码精确哈希、50项编译检查均匹配。Linux隔离检查 **2文件/31项** 通过。最终源码候选backend-candidate-v2.tar.gz为 **137,971字节**，SHA256 **4b79b9d4903d4995ce81d894cdc4864dee7f3d4bdfadc02a5500186082d98a08**；运维包7,270字节，SHA256 **4bbccafba8dbc74d170bdab5eb0f5d9a2693242b7f9851b929275ce105d8e069**。

先停API接入，execution/chat的queued/running均0后停worker，进行一致备份。独立解包恢复与迁移前在线数据核对原95表结构/行数/全行哈希、7份原件内容/权限哈希、旧24迁移checksum、integrity与外键通过；再在恢复副本执行025、隔离启动API，ready200/0.29及未登录401正常，没有创建账号/会话或访问模型/外部连接。正式迁移也逐项确认原95表、7原件及旧校验和保持，新增5表共100表。15份既有配置/密钥文件在服务器备份，源文件与备份哈希/权限保持，内容不输出或下载；个人/团队模型凭据与默认值、Feishu连接/来源及集合范围保持，现有1个源仍owner_private，未替用户共享。

备份 **/srv/research-openim-backups/lab-membership-20261022-v2-20261022T041627Z/research.tar.gz**，SHA256 **efbccd218027ef6d7769ef030314cd675bf14ffb876527d450720217382ea4498**。同目录含受限config-inputs副本与校验清单；备份仍在同ECS，未验异地或整栈恢复。其余6服务的容器ID/镜像/状态保持；API/worker环境哈希、挂载、端口、命令、内存、网络、重启策略保持。广场开关仍GITHUB_CATALOG_SYNC=0，实际enabled=false/state=disabled/nextCheckAt=null，11项收录/19候选和原缓存保持，正常用户提醒/科研调度未停用。

有效Compose沿用47c42ac基础/production、私有images、community/key-preview/feishu/harness/bitable/http400/library-sharing覆盖链，在末尾追加 **/opt/research-openim/ops/lab-membership-20261022-v2/images.yaml**；env仍/srv/research-openim/compose.env。完整参数见该目录deploy.sh，不能省略原功能覆盖。原current指针、Nginx和静态网页不变。

失败/修订证据保留：首714,405字节候选（SHA256 e62de30b06bb560bad31fc3a22e8a2b62a8cfcfc02752ad74b11274e386620c4）因community-catalog-seed.ts与现产运营版本不同在停机前被守卫阻止；核对后保留生产种子，以源码增量离线重建，没有跳过差异。审计脚本在上线前规范化SQLite空原型行/对象；初次空库演练误把审计回执放在被审目录内，文件对比失败，改为外置后024→025隔离演练通过。两者均发生在生产停写前，没有生产迁移失败或回退；原归档/脚本/失败日志不删除。

服务器实际回执/日志/逐表文件哈希在 **/opt/research-openim/ops/lab-membership-20261022-v2**，首守卫失败同级lab-membership-20261022；Git外本机 **D:/deepseek-agent/.runtime/lab-membership-20261022/backend-deploy-v2** 留部署摘要、脚本和deployed-proof.png。最终审计audit-normalized.mjs SHA256 **df31d37511d4b5af996011985622932fdb01bc70436d785dcbbc0b5bf61b17a7**；deploy.sh实际引用此文件，初稿保留。

025旧镜像不能直接读取。部署脚本仅在新API/worker尚未启动、无新写入时允许配对恢复原停写数据库；一旦尝试启动新服务，失败路径会停服务并要求保留新数据前向修复，绝不自动覆盖快照。实际部署成功，未触发回退，不称已演练。现在已有新写入可能，后续应先考虑兼容025的代码修复；若需恢复旧数据，须单独协调写入保全及兼容数据库/原件/镜像，不能直接换024镜像或回灌旧备份。

本批没有重打/安装0.10.33、合并main、创建公开Release/标签或改自动更新源。实际功能与安装后体验由用户检查，未追加真实账号、私人材料/模型、浏览器产品或原生验收。

飞书直接OAuth仍仅本人试点，共享只作用于明确选择的表，不替代飞书网页权限或扩大应用可用人员。注册超时旧问题仍未定根因。PR、安装包、生产部署与公开发布分别记录，[PR88](https://github.com/luoyan96/personal-agent/pull/88)已推送并附当前任务，负责人审阅后决定合并。
