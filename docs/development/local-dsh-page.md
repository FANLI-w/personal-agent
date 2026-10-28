# Windows 本地 DSH 页面（首批试用）

2026-10-28，功能分支 `feat/local-dsh-page`，从实际最新 `main/93da480` 开始，独立目录 `D:\deepseek-agent\acceptcat-chat-experience`。此分支与群成员身份修复 PR129 独立，不自动包含未合并的 PR129。Windows 候选版本为 **0.10.63**；公开 Latest 仍是 0.10.61。本批不合并、不公开发布、不部署后台。

交付：[PR130](https://github.com/luoyan96/personal-agent/pull/130)，产品提交 `d55375d6229a8b611c976f76ff5138eebfca1f85`。后续仅文档回填不改变安装包源码。

## 如何试用

1. 保留已经安装的 `D:\0cat\dsh`。本批核验其 DSH 产品版本为 `0.2.1-rc.3`、构建修订 `be72761ee1a6736ebcdf4f3739363b083ae53c98`。安装根目录的 `version` 文件是 Electron 版本 `44.7.0`，不是 DSH 产品版本。
2. 安装本批 AcceptCat 候选包，登录后点击左侧 **DSH → 启动 DSH**。安装在别处时，先使用「安装目录」选择文件夹。
3. 按 DSH 自身界面配置模型和工作目录。AcceptCat 不会复制平台模型密钥、你单独使用 DSH 的账号配置或私人资料。未配置模型时，界面会要求登录 DeepSeek 或添加 API Key。
4. 可进入 DSH 的会话、工作区、模型/工具设置和插件管理界面。本批没有代用户安装第三方插件，也没有用真实密钥发起模型调用。
5. 切换到 AcceptCat 聊天时保留本地进程，返回 DSH 恢复原页面。「停止 DSH」有中断任务确认。退出登录、主页面重载或退出 AcceptCat 会停止本批拥有的 DSH 进程树。最小化/关闭到托盘不等同于退出。

旧工作台继续保留，现有个人助手与群聊仍走原来的业务后台。这里是独立本地工作区，尚未接管现有 Agent 聊天和课题组任务。

## 接入方式与边界

- 使用官方安装包的命令入口：`DeepSeek Harness.exe --expose-internals resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js web --no-open --host 127.0.0.1 --port 0`，子进程设置 `ELECTRON_RUN_AS_NODE=1`。依据安装包 `resources/runtime/cli/bin/dsh.cmd` 和[官方 Desktop 命令文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#bundled-command-runtime)，未抽取或修改上游源码。
- DSH 本体仍由独立安装供应；AcceptCat 安装包不捆绑这份 DSH，也不在启动时下载新运行时。只接受已核验的产品名和 `0.2.1-rc.3`；升级 DSH 后须重新验证再放开版本。
- 本地适配实现位于 `integrations/deepseek-harness/desktop`。构建成独立 CommonJS 文件进入 `dist-electron/main/localDshRuntime.js`，归档验证检查该文件存在，避免安装后依赖开发目录。
- 数据目录是 Electron `app.getPath("userData")/local-dsh/home`，与独立 DSH 的默认 home 分开。按本机 Windows 用户保存，并非按 AcceptCat 账号分区；换用同一 Windows 用户下的其他 AcceptCat 账号后，仍是这个本地工作区。请勿将其当成课题组共享账号隔离机制。
- 随机本地端口、官方 Web token 鉴权；入口 token 留在主进程和隔离的 DSH 页面，状态 IPC 不返回 URL/token。不继承环境中的模型密钥、`NODE_OPTIONS` 或其他 DSH 覆盖项。
- 仅受信任的 AcceptCat 主文档可以管理运行时，启动/显示要求当前路由为 `#/dsh`。安装目录只能经原生文件夹选择器修改，渲染层不能提交任意命令。
- 使用独立、临时 session 的沙箱 BrowserView，关闭 Node integration，没有 AcceptCat preload/IPC。禁止外部页面在此容器内导航，HTTPS 外部入口交系统浏览器。DSH 自身后端仍按其权限模式执行用户授权的文件和工具操作；BrowserView 隔离不等于给 DSH 工具执行提供系统级沙箱。
- AcceptCat 保持 Electron `22.3.27`。真实启动先发现 `Promise.withResolvers`、`AbortSignal.any`，随后发现 `Array.toSorted` 的兼容问题。对 DSH 独立文档注入浏览器兼容代码：复用已有锁文件固定的 core-js `3.49.0`（MIT，完整许可随适配模块保留），补充 AbortSignal.any。不会修改聊天页面全局对象，不关闭 Web security，不升级 OpenIM/Electron ABI。
- 「运行」只表示官方 CLI 已报告本地服务启动；「pageReady」只表示文档载入。本批没有把它们宣称为模型验证成功。启动超时 90 秒，失败可重试；停止只按本批创建的 PID 清理进程树，不查找/终止用户独立 DSH。
- 原生视图在路由切换、全局弹窗/抽屉/Popover 展开时隐藏，关闭覆盖层后恢复；窗口缩放/布局变化会同步边界。

## 开发与构建

沿用仓库 Node/pnpm 约定，先按 CONTRIBUTING 完成依赖安装和共享包构建。客户端未增加运行依赖或改锁文件。

```powershell
cd D:\deepseek-agent\acceptcat-chat-experience
corepack pnpm@11.21.0 run build:desktop-deps
cd clients\openim
corepack pnpm@10.28.0 run dev
corepack pnpm@10.28.0 run test:local-dsh
corepack pnpm@10.28.0 run test:build
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run build:win
```

`build:win` 包含 Web/Electron 构建、运行依赖整理、NSIS 打包与归档入口检查，固定 `--publish never`。新 clone 可使用根目录 `corepack pnpm@11.21.0 run desktop:win` 执行完整冻结安装流程。复用已有 node_modules 时须遵循其 pnpm store，不能为了临时环境不匹配删除锁文件或强制安装。

## 验证与证据

- 客户端与 Electron 类型检查；本地 DSH/构建边界定向测试 14 项。
- 使用安装的真实 DSH、独立测试 home 和 Electron 22 渲染，启动、连接、默认工作区与插件页面通过。没有模型调用。初次不兼容输出和后续修复输出均在运行证据目录保留。
- 集成夹具复用实际 `LocalDshPage`、主进程管理器与 preload IPC。只替换 AcceptCat 窗口身份/设置存储，不连接真实账号后台。验证启动、独立沙箱、边界、切换聊天/返回、全局弹窗遮挡、缩小到 1024×726、停止、重启和退出登录，共 15 项。
- 原生窗口画面通过 Computer Use 观察：DSH 显示在 AcceptCat 页头/导航下，初次说明和配置入口可见。自动父文档截图不包含 BrowserView，不能把父文档截图的空白区域当成 DSH 渲染失败或完整原生截图。
- 无应用 JavaScript 异常；开发环境保留 Ant Design `findDOMNode` 弃用警告，以及 DSH 上游 Web CSP 的 Electron 开发警告。未修改上游 CSP。
- 本批仅有桌面适配与客户端变化，没有修改共享业务包、Skill、API、数据库和后台运行链；执行客户端定向检查，没有冒充通过全仓 CI 或真实账号验收。
- 证据：`D:\deepseek-agent\.runtime\local-dsh-page-20261028`。`native-incompatible.json` 为最初失败，`native-probe.json` 为修复后真实 DSH 页面结果，`qa-results.json` 为集成检查，`build-win-final.log` 为候选构建日志。最终安装包与校验值在该目录的 `windows` 中记录。

最终候选安装包：`D:\deepseek-agent\.runtime\local-dsh-page-20261028\windows\AcceptCat_0.10.63.exe`，88,306,454 字节，SHA256 `2e95d2807002404128be9b3aa0d41bd4def8eed263d5a97880ea064a282209f7`。Web/NSIS 构建及五个归档入口检查通过，归档内另行确认运行时版本限制、子进程退出保护和 core-js 完整许可存在。独立用户数据目录的打包程序启动冒烟输出 `OPENIM_ELECTRON_READY` 并通过；保留既有 electron-log 重复初始化警告，未将其写成“无任何日志警告”。没有执行安装器或替换负责人正在使用的客户端。

## 下一批

先由负责人安装候选包，配置自己的 DSH 模型，验证实际聊天、工作目录、工具授权和插件安装。通过后再设计 AcceptCat 个人 Agent 路由到本地 DSH、任务/产物关联、按账号隔离、共享任务权限与离线执行方式。替换旧工作台、统一任务流以及无独立 DSH 安装的一体化分发均未实施。DSH 的独立桌面专用原生能力（例如原桌面 Browser bridge）不因嵌入 Web 而自动具备。
