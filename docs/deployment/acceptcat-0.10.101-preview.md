# Windows 0.10.101 本机任务界面试用包

2026-11-11，按负责人“先改出来安装看看”制作。**仅本地候选，未合并main、未创建tag或公开Release，未部署后台。** PR #200（包含PR #199资料页闪动修复）。

## 安装包与固定源码

- 产品提交：`e4c8fc562cb92e9b8fdce56de73541e90549222f`，`feat/task-views-unified`。构建前工作目录干净；后续仅补记录。
- 桌面：`C:/Users/luo/Desktop/AcceptCat_0.10.101.exe`。
- 原始产物：`D:/deepseek-agent/acceptcat-group-invite-fix/clients/openim/release/Base/0.10.101/AcceptCat_0.10.101.exe`。
- 大小：421230065字节。SHA256：`0d1545a975c9fcc88a5c77bd2439571ce3b7a4868588c2e9ac78b868d913191d`。桌面副本摘要一致；安装器ProductVersion/FileVersion和app.asar均为0.10.101。
- 使用既有固定Electron43.8.4、DSH0.2.1-rc.3、科研插件0.4.0、Tectonic0.17.0；未浮动依赖或运行时下载插件。

退出原客户端后运行安装器，登录后进入「任务」。本次没有代安装或操作正在使用的客户端。

## 可以检查什么

我的待办/团队任务共用左侧列表、任务卡片和右侧详情，两页都保留新建入口。团队按计划分组，阶段、搜索、待审/截止、可见范围和成员分工仍可查看；分工从摘要旁展开。点击团队任务留在团队视图，不再打开另一套详情弹窗。新建课题组任务使用原有两态规划助手，未改模型、提示词或规划规则。

我的待办科研条目按服务器既有scope=mine返回的获准任务ID筛选；个人事项/定时安排沿用既有权限。分页收齐后过滤，读取失败不回退全团队。卡片和我的科研列表各最多读取10页×100条，截断会明确提示；不是无限任务量/离线任务库的验收。真正的旧后台不支持我的科研范围时保留原任务列表。

资料入口同时包含PR199：未知契约版本显示等待/重试，已经确认的公共版本不随会话刷新清除，避免新旧资料页闪动。业务数据和权限校验保持。

## 实际检查与边界

- 客户端/主进程双类型，363项脚本检查执行及单独44项本地DSH检查通过（脚本间含重复覆盖）；包括任务归属、翻页、断网失败、取消、计划分组/验收、规划和原生权限边界。
- `corepack pnpm@11.21.0 run desktop:win`：冻结准备、完整Web和NSIS构建通过，11项必要运行入口及固定DSH载荷校验通过。`check-windows-update.mjs`确认本机EXE/摘要/版本/blockmap匹配；生成的latest.yml没有上传。
- 成品核验：app.asar中64份应打包Web资源与本次dist逐字节摘要一致；任务视图/分工/个人分页及资料等待状态标记均在包内。两份根目录Web WASM按原有native桌面配置排除，不是本批删文件。
- `electron:smoke`：全新临时user-data目录隔离启动，收到`OPENIM_ELECTRON_READY`，进程启动检查通过，退出码0。没有使用私人登录态。既有electron-log重复preload提示仍在，之后READY成功；不将其说成零警告。
- 隔离Playwright/无头Edge（Browser插件未列出）：1440×960、1100×800，实际DesktopWorkbench/团队/共享列表/store/读取hooks，验证归属、切换、搜索、待审、scope=mine、成员分工抽屉、计划记录、新建入口、保持团队URL和共用详情容器，无页面横向溢出或运行时异常。业务API、规划与任务详情叶组件为明确合成夹具，**不能当作真实账号/完整任务执行/双机验收**。已有Antd findDOMNode弃用和Router未来版本提示保留记录。

证据：`D:/deepseek-agent/.runtime/task-views-preview-20261111`，含client-checks.log、local-dsh-tests.log、windows-build.log、artifact-proof.json、update-check.log、electron-smoke.log、browser-result.json与截图。首次类型边界、检查启动命令、夹具取消按钮、ASAR脚本路径/Web WASM排除处理失败日志保留，修正后通过；未据此修改产品构建/打包配置。

生产仍为`acffd5e`、contract0.45/schema034/116表，无新接口/迁移，**无需更新后台**。公开Latest仍0.10.100。下一步由负责人安装候选，验收自己的任务归属、团队分组与详情操作；根据反馈再决定合并和公开发版。
