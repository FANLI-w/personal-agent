# 原生文件预览与课题组工作台首批适配

2026-10-29，负责人要求先恢复 DSH 原生文件/PDF，再适配课题组工作。基于 main/2d0091c，独立分支 `fix/dsh-native-files-workbench`；候选 Windows0.10.72，固定官方 DSH0.2.1-rc.3。

## 原因与修复

1. 原生 Desktop 通过 `__DSH_HOST_PATHS__.pathFor(File)` 取得本人选择/拖入的路径，非图片走文件引用。AcceptCat 未提供桥接，PDF 走成了上传附件卡片。新增独立 sandbox preload，使用 Electron `webUtils.getPathForFile`；合成浏览器 File 和图片继续走原生附件路径。
2. Electron22/Chromium108 将 `dsh-resource://file/...` 的 hostname 解析为空，资源注册表找不到 file provider。启动前只注册此逻辑 scheme 的 standard 属性，没有网络处理器、文件权限或 CSP 绕过。
3. 地址修正后，原生 PDF 脚本仍因新正则语法在旧内核报 `Invalid regular expression flags`。固定升级到 Electron43.8.4/Chromium150。曾试44.7.0，其剪贴板类型不兼容既有图片读写，未选择。没有改写 DSH 源码、PDF.js 或发行资产。

新增 `__DSH_DIRECTORY_PICKER__.pick()` 接原生文件夹选择。只接受当前账号所拥有 DSH 主 frame，弹窗前后验证账号及连接；取消不创建目录。DSH 文档不获得 AcceptCat 主 preload、任意 IPC 或 Node API。打包守卫要求新 preload 进入成品 ASAR。

## 工作台使用

中央保留原生对话、模型/推理、引用、右侧文件树与阅读器、插件入口。标题区收窄，“任务与交付”按需读取已有待办/进行中，“共享资料”打开现有资料页。任务抽屉打开时临时隐藏原生视图，关闭恢复同一视图。列表只导航，不自动承接、提交、验收或调用模型。

从任务进入携带 taskId/kind，提供“返回当前任务”；仍按任务页提示选择对应 DSH 会话。**本批没有自动切换会话，返回链接不表示当前 DSH 会话已绑定任务。** 资料取用、归档及规则/记忆仍在任务工作页；独立聊天的文件引用不自动上传。

Mimir、SciencePrism、AgentTeams 尚未安装。下一批集中验证“文献阅读→对照/笔记→组会材料→提交反馈”，再按官方扩展接口接入需要的科研能力，并映射现有任务和来源。

## 开发与验证

根 pnpm11.21.0，客户端 pnpm10.28.0，Node>=22.19。从根 `corepack pnpm@11.21.0 run desktop:prepare` 准备依赖；客户端运行 `corepack pnpm@10.28.0 run dev`。根 `corepack pnpm@11.21.0 run desktop:win` 生成候选，默认 publish never。

检查为客户端 test:local-dsh、双类型及 desktop-build/image-paste/desktop-transport/auth-input/research-service/workbench-links。新增伪造 File、其他 frame/窗口、取消与弹窗期间账号失效的负面用例。根 CI862项/68文件、生产3项、B0/Web通过；最终客户端、界面与成品回执补充于交付记录。

证据在 Git 外 `D:\deepseek-agent\.runtime\dsh-native-files-20261029`。实际官方 DSH＋隔离 Electron 使用合成 PDF/文本/图片；串联界面使用独立合成账号、本机业务 API，不调用真实模型。Browser 插件不可用，采用隔离 Electron/CDP/Playwright 工作流。初次空页面探针超时、引用选择器错误、旧内核解析/语法失败及缺少桌面 API 的界面夹具失败保留，不能计入通过。

无 API/契约/数据库迁移，无需后台部署；生产 contract0.38/schema030、公开 Windows0.10.71保持。真实模型、私人材料、多人双机及安装升级仍由负责人验收。

## 最终交付回执

产品提交 f160ee7，PR141（https://github.com/luoyan96/personal-agent/pull/141）。最终NSIS重新构建通过；一次包含旧路径适配的中间压缩主动中止并留日志，只以 build-win-delivery.log 对应包为准。成品包含新preload、逻辑scheme、聊天getFilePath与任务返回链接，ASAR/更新SHA512核验通过；隔离成品启动、主preload和OpenIM原生SDK初始化通过，不表示真实IM收发已验收。既有electron-log重复initialize警告仍在。

候选：D:\deepseek-agent\.runtime\dsh-native-files-20261029\windows\AcceptCat_0.10.72.exe，405060395字节，SHA256 8b73d92d661f12ed720578f8ef5ac33ea02b3e3cf82825b1655d6044c087c7a7。未代安装、公开发布或更新后台。

实际原生DSH四项检查覆盖PDF canvas、文本阅读、图片解码成功（naturalWidth=16）和模型/推理菜单。13项账号/业务API/原生视图串联通过；Playwright/Edge在1400×900和1024×768验证任务两分类、返回链接、共享资料导航、非空/无框架覆盖层、Console及截图，5项通过。浏览器测试中的DSH桥接为替身，真正的PDF和原生IPC由前述Electron测试验证。浏览器服务超时退出导致首轮连接拒绝，重启隔离夹具后通过；初版PNG夹具有误已换为真实编码位图并补解码断言，未修改产品图片显示逻辑。

客户端39项DSH＋34项桌面回归、双类型通过，最终路径变更后追加16项通过。根862项已通过，共享源码未再改动；最后内容检查和diff检查通过。受测产品f160ee7远端两项Linux和Windows打包通过，Windows Foundation结果以PR实时状态为准；后续交付文档提交只改变记录，不冒充新产品验证。
