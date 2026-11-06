# AcceptCat 0.10.97 预发布回执

> 后续部署更新：2026-11-06 11:35:11北京时间，配套后台0.43已上线；可以用0.10.97开始真实任务验收，客户端仍为预发布、96仍Latest。见[后台部署回执](planner-skeleton-20261106.md)。下列“后台仍0.42”是10:42公开安装包时的历史记录。


北京时间 2026/11/6 10:42:54 已公开手动安装预发布 [v0.10.97](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.97)，Release ID 436038237，**v0.10.96仍为自动更新Latest**。原同事PR176已合并；范围修正PR183已合并，实际构建/tag固定 **de0d55a5f6a00b391365ff7bd0fd6e6e6bbf12a7**。

- Windows x64安装包：[AcceptCat_0.10.97.exe](https://github.com/luoyan96/personal-agent/releases/download/v0.10.97/AcceptCat_0.10.97.exe)，421224775字节。
- SHA256：371e28cf75ce680e9c2d5d4365b39a0d2fa1373c35adb485789ba6e17b449896。
- 本地路径：D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.97\AcceptCat_0.10.97.exe。
- DSH0.2.1-rc.3、科研插件0.4.0、Tectonic0.17.0保持；插件原包SHA256 583de48caac441a2fe97c316a09e08fa13b23af512a7b9b7435643316b594585。

## 按最新指示收窄范围

按负责人最新要求只补第二项：只有显式待定/阻塞且带missing的模型项可缺省goal、deliverable、acceptanceCriteria，落库为未确认占位；可执行与旧无状态项仍严格。原schedule/inputArtifactIds等条件写回不动，讨论态不能建任务，失败保留原方案。

第一项兼容层和第三项预览/指纹/布局补修均已撤回；九个相关源码文件与同事a528c292逐字节一致，包括提示词、Skill、客户端API/预览/讨论卡/样式、原服务端server/collaboration/execution-worker。补充信息不向前面预览继续传递是有意边界，保持原设计。 原PR176两态、三项粗骨架、一个必要问题与可选候选、交付/结论类型及outcome/supplements的服务端设计不替换。

原解析模块的直接负向验证说明：原日期/文件归一化本来就生效，三个研究字段的标题骨架则在worker特殊写回之前触发invalid_type；修复不要求模型编造事实。真实worker验证保留原明确日程、拒绝伪造文件授权、未完成不可确认、失败不改旧版本。详见[解析条件与原边界](../development/planner-skeleton-conditions.md)。

## 检查结果

根70文件880项、3项生产/B0/Web、28项解析与真实隔离HTTP/SQLite/worker、44项客户端规划/依赖图、类型及实际组件桌面/窄屏检查通过。冻结1657份输入，直接解包EXE核对129份构建文件，成品缓存跨进程/插件离线升级/原生DSH加载、隔离启动与更新清单通过。最终构建main四项CI成功；公开四附件digest、匿名预发布下载及96资产/Latest保留核对通过。

| 检查 | 结果 |
| --- | --- |
| 实际模型解析边界 | 原a528c292解析模块负向验证；现条件骨架接受，状态不提升 |
| 特殊字段写回 | 真实隔离HTTP/SQLite/worker保持日程、清理未授权原件引用；讨论不可确认，失败不改原计划 |
| 原始设计一致性 | 构建捕获执行九文件git diff --quiet；提示词/Skill/API/预览/卡片/样式和原worker与同事原版一致 |
| 实际界面 | 临时/workbench路由，PlanningAgent→原预览→PlanningDiscussion、useResearchRead/DependencyGraph/SCSS；1440×980与1024×768；有内容、无框架错误覆盖层，候选只填草稿，两态保持 |
| 数据边界 | 服务端夹具保留三条supplements，但前面预览有意不接入，按负责人设计明确断言；不是要求旁支在预览出现 |
| 控制台 | 页面异常0，已有Router future警告保留；API/store/目录为合成边界，无私人账号或模型 |
| 成品检查 | EXE解包核对129份文件与1657份冻结输入、新原规划代码、旧缓存误报文字缺席、原完整缓存/IPC、插件/DSH/许可和更新清单；没有rcedit临时文件 |
| 运行检查 | EXE提取SQLite模块在随包Electron独立进程验证正文/引用/分页删除/账号服务隔离/撤回，网络0；EXE提取插件模块使用随包pnpm空store/offline升级旧GitHub锁及.ignored，保留其他插件/配置/会话/材料；独立DSH加载、匿名403/临时会话读取200，重复不重装 |
| 发布检查 | 草稿与公开四资产大小/digest匹配；匿名tag可下载，EXE HEAD200；96附件ID/大小/digest和Latest入口保持 |

执行根ci、客户端类型与规划测试、外部原解析模块探针、现有Playwright1.61.1/headless Edge（Browser插件未提供）和根desktop:win；成品核验使用本批verify-installer/packaged-cache/packaged-upgrade/run-native/electron-smoke等脚本。保留Vite/AntD既有构建提示与electron-log重复初始化警告，最终ready通过，不称零警告。

## 被撤回方案与失败记录

首轮PR182/f34b027包含第一和第三项补修，负责人随后收窄，0.10.97当时没有tag、上传或公开；该候选标记在release-0.10.97-20261106/SUPERSEDED.txt。通过PR183正常追加恢复，不重写同事历史或main，新包从修正main重新冻结构建。

首轮Windows根882项和类型/界面通过，但Ubuntu两矩阵的新增兼容夹具创建个人模型返回503；该夹具写测试密钥未设置受限mode，Linux原权限保护拒绝，Windows通过。原log在planner176-fixes-20261106/pr182-foundation-failed.log与first-main-foundation-failed.log。兼容层/夹具随用户范围撤回；最终条件写回测试复用原0600夹具，不关闭保护、不放宽期限。原界面选择器漏计标签文字和随后发现的材料覆盖标题也留证，这套布局补修同样撤回，不混入最终方案。

初次gh创建PR182返回502，查询确认不存在后重试成功，无重复PR。几处读取时PowerShell花括号/旧文件名错误已更正，无产品或生产影响；记录见项目日志。新范围检查以planner176-skeleton-only-20261106为准，不能引用三项方案通过数替代。

## 上线与验收边界

后台仍contract0.42.0，database/storage/authentication为ok、harness为not_verified，schema沿既有032；本批没有部署后台。0.43新规划须配套后台升级，第一项版本兼容不在本批，部署前协调客户端。新字段写入后旧0.42服务不能直接读取这类计划，应前滚或用兼容镜像。未使用私人账号、材料或模型密钥，实际安装/模型与多客户端体验由负责人验收。 因此本次只作为公开预发布手动安装，不提升为Latest、不让自动更新提前带入新规划协议。后台就绪及真实体验通过后，再由负责人决定转正式。

原Windows96的完整聊天缓存、群聊、任务与工作台DSH能力保留。旧版仅存指针或本机未读过的正文首次仍需联网，科研插件Office/WPS需要本机软件；本次不修改其原80MiB上传范围或资料目录归属。

证据：D:/deepseek-agent/.runtime/planner176-skeleton-only-20261106 与 D:/deepseek-agent/.runtime/release-0.10.97-skeleton-only-20261106。关键文件：parse-boundary.json、targeted-first.log、full-ci.log、ui-result.json、build-source.json、windows-build.log、installer-audit.json、packaged-cache.json、packaged-upgrade.log、native-plugin.json、main-ci-final.json、release-public-verified.json、anonymous-verification.json。
