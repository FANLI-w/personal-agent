# AcceptCat 内置 DSH 与账号接入

2026-10-28，PR130 / `feat/local-dsh-page`，内置首批 Windows 0.10.64，关闭预览弹窗修正版 0.10.65。继续在独立 clone `D:\deepseek-agent\acceptcat-chat-experience` 开发，实际 main 仍为 93da480。此批取代 0.10.63 的“另装 DSH、手动启动、单独填 Key”试用方式。原工作台和原聊天入口继续保留；不包含未合并的 PR129。

## 使用行为

安装包自带固定 Windows x64 DSH 0.2.1-rc.3 的完整发行文件，包括运行时、随发行版提供的依赖和许可。无需预装 Node、Python、pnpm 或 `D:\0cat\dsh`。首次开发构建需要联网下载，安装后的运行环境来自 AcceptCat 的 `resources/dsh`。

AcceptCat 恢复或建立登录后，主进程核验真实 Cookie 与后台账号/默认模型，自动启动本地 DSH。左侧 DSH 页面直接打开工作区，默认模型显示为“模型名 · AcceptCat”。无需第二个账号或再次填写模型 Key。0.10.65 起按负责人要求关闭内嵌 DSH 的首次预览说明：通过官方托管 overlay 设置 `ui-settings-general.welcomeNoticeVersion=2026-09-28.1`，与锁定 rc.3 的说明版本对应。新账号、已有工作区与重启均应用；不修改上游发行文件，不覆盖用户插件配置或放宽工具批准。升级 DSH 时需重新核对该版本字段。

使用 `userData/local-dsh/accounts/<sha256(服务地址,成员ID)>` 保存每个账号的工作区、会话和插件。登出、账号 Cookie 改变、主文档导航/崩溃或关闭应用时停止自己的子进程与模型连接；切换普通聊天页面保持运行。用户主动停止后可以重新连接。不会迁入 0.10.63 的公共试用 home、独立 DSH 的配置或原聊天记录。

## 调用与权限

```text
DSH 界面 → 本地 Agent 循环、工具与文件
          → 本机临时模型连接 → AcceptCat Cookie/CSRF 网关
                              → 当前账号配置的模型服务
```

真实提供方密钥只在后台解密。DSH 仅获得每次启动随机生成的 loopback 令牌，不能获得 AcceptCat Cookie、CSRF 或提供方 Key。该令牌随停止失效；本机同一 Windows 用户的工具能访问自己的运行环境，因此不是工具之间的安全隔离边界。文件及工具权限继续采用 DSH 原有工作目录与批准机制，未放宽默认权限。

默认模型权限采用既有私人工作 `planningModelRuntime`：本人个人配置优先；无个人配置时，旧实验室配置只允许有权管理该配置的管理员使用，普通成员不能继承管理员密钥。无可用默认模型时显示去 AcceptCat 模型设置处理的错误；旧后台缺少接口时明确要求升级配套后台。不会把未连接的状态显示为已接通。

新增两个接口，契约类型位于 `packages/contracts/src/local-dsh.ts`，不改变既有接口或数据库 schema：

- `GET /api/v1/local-dsh/configuration`：登录必需，返回本人的模型元数据、协议、配置指纹与上限，永不返回 Key。
- `POST /api/v1/local-dsh/completion`：登录、Origin 和 CSRF 必需。包裹 `{fingerprint, protocol, request}`，返回上游 JSON 或 SSE。只能调用当前选定模型和固定提供方地址；不支持任意 URL、服务端工具、文件接口、批处理或服务端保存请求。DeepSeek 使用 Anthropic Messages，Qwen/豆包使用 Chat Completions。

限制：2 MiB 输入、16 MiB 输出、每调用最多 8192 输出 token、120 秒；每成员最多 2 个并发/每分钟 30 次，单进程最多 16 个并发。每秒复核登录与模型配置，断开和失效取消上游连接。保留工具调用关联和模型用量流。网关不自动重发模型请求，托管 DSH 通道也关闭自动重试；流式失败由用户判断重试。限流为单 API 进程，暂不提供跨副本限流、持久计费账本或日额度；模型费用仍发生在已有模型服务，用量显示来自提供方返回值。

本机连接只监听 127.0.0.1，校验临时令牌、拒绝浏览器 Origin，只允许一种当前模型协议的完成接口。单次请求的实际 Cookie 在主进程读取和复核，renderer 声称的账号不作为权限依据。

## 官方扩展与版本

- DSH 产品 0.2.1-rc.3，发行包构建 be72761ee1a6736ebcdf4f3739363b083ae53c98；包含的 Electron 为 44.7.0，本项目界面宿主仍为 Electron 22.3.27。
- 官方 `dsh --profile web --patch <托管配置>`，使用 `@deepseek-ai/dsh-llm-pi-ai` 的自定义提供方和 `agent-default-model`。不改上游源码；托管 overlay 不覆盖用户的 `cordis.patch.yml` 或插件清单。
- `ACCEPTCAT_DSH_TOKEN` 仅传给受控子进程，普通父进程环境中的模型 Key、Node 注入参数和其他 DSH 配置不继承。
- 保留已有 core-js 3.49.0 的浏览器兼容层；Electron 22 不支持新版 Node 的 `closeAllConnections`，本机网关自行跟踪并关闭连接。
- 发行源、SHA512、大小固定在 `integrations/deepseek-harness/desktop/runtime-lock.json`。构建使用官方安装器下载后静态解包，不执行它；完整树校验防止漏包/混入其他文件。上游代码及二进制只进入被忽略的构建目录和安装包，不进入 Git。

官方参考：[Desktop bundled CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)、[官方源码仓库](https://github.com/deepseek-ai/deepseek-harness)、[固定 Windows 发行包](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.1-rc.3-win-x64.exe)。pi-ai 提供方配置以已校验发行包内 README 和实际接口为准，master 页面可能继续变化。

## 开发与构建

根工程 Node ≥22.19、pnpm 11.21.0；客户端 pnpm 10.28.0。先按 CONTRIBUTING 完成冻结依赖安装和共享包构建。Windows：

```powershell
corepack pnpm@11.21.0 install --frozen-lockfile
corepack pnpm@11.21.0 run build:desktop-deps
node integrations/deepseek-harness/desktop/stage-runtime.mjs clients/openim
cd clients/openim
corepack pnpm@10.28.0 run dev
# 必要检查和安装包
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run test:local-dsh
corepack pnpm@10.28.0 run build:win
```

`build:win` 会准备/校验内置 DSH。离线构建可设置 `ACCEPTCAT_DSH_INSTALLER` 为同一官方安装器绝对路径，仍须通过锁定 SHA512；不能指定任意用户安装文件夹。缓存 `.dsh-download` 和运行树 `.dsh-runtime` 不提交。已有未知目录不会被覆盖。Windows CI 也从固定官方 URL 下载；下载不可用应报告构建失败，不悄悄生成缺少运行时的包。

## 验证与交付边界

证据目录：`D:\deepseek-agent\.runtime\dsh-integrated-20261028`。仅使用合成账号、合成模型传输和自行创建的文本，不读用户真实资料，不调用付费模型，不安装到用户当前客户端。

已完成定向网关检查、客户端/Electron 类型和 16 项桌面定向检查；实际 Electron 22 + 内置 DSH + 当前 API 代码 + 合成模型验证了自动启动、无需第二个 Key、模型回复、真实本机 `read` 工具读入合成文件并回传结果、切换页面、账号隔离和登出停止。DSH 实际返回了工具调用，工具实际读到了测试文件；模型推理为合成，不能表述为真实 DeepSeek/Qwen 效果验收。

原生测试使用隔离 Electron 测试窗口与实际 BrowserView；Browser 插件不在本会话技能列表，普通网页截图无法包含原生嵌入视图。保留 `qa-results.json`、`model-calls.json`、`dsh-account.png`、首次失败记录和构建日志。首次发现关闭 API 兼容问题及 `store:false` 请求兼容问题，均已修复并复核，不删除失败记录。

产品提交 **2504dff60f5eddd638e58eca03a3ecb60e588ccb** 已推送 PR130。最终完整 CI **837 项/66 文件**、生产 3 项/B0/Web、16 项桌面定向与双类型通过。实际原生集成 11 项通过，覆盖窄桌面窗口和账号 A→B→A。修正 CJS 打包边界，共享模型契约随独立 runtime 打包，避免 Electron22 直接 require 仅 ESM 的 contracts 包；最终包启动冒烟返回 `OPENIM_ELECTRON_READY`，另从成品 `resources/dsh` 成功启动真实 DSH，不依赖开发目录或原外部安装。保留既有 electron-log 重复初始化警告及 DSH 开发探针 CSP 警告，没有把它们称为无警告运行。

最终 NSIS、包内五个入口、DSH 完整发行树哈希和更新清单校验通过：

- `D:\deepseek-agent\.runtime\dsh-integrated-20261028\windows\AcceptCat_0.10.64.exe`
- **366,806,984 字节**，SHA256 **880cffe8e41d7f6f14f6622ad450d6b49cfc3be807725616d8a073b0b18900aa**。
- 同目录含 blockmap、候选 latest.yml 和 SHA256SUMS.txt，均未上传公开更新通道。先前构建日志 `build-before-cjs-fix.log` 不代表该最终安装器。

代码合并、公开 Release 尚未执行，公开 Latest 此前核对为 v0.10.61。后台在2026-10-28 16:58:47按后续授权完成上线，见[部署记录](../deployment/local-dsh-20261028.md)；此前缺少接口的限制已解除，但未使用真实账号/模型验收。未运行安装器覆盖负责人客户端。

实际部署从原生产镜像叠加固定产品2504dff的两个新增文件及两个注册入口后重新编译，保留contract0.34/schema027，避免带入当前main尚未部署的schema028。备份恢复、新接口匿名401、隔离合成流式及取消检查通过。现有客户端继续使用旧接口；真实账号模型元数据和小请求由负责人在0.10.64候选客户端验收。

远端CI复核发现Linux测试合成密钥文件未显式0600，Windows服务状态测试遗漏新DSH桥替身。仅修正这两处测试后，本机完整CI837项/66文件与5项IPC串联检查通过；服务器原138项及修正后3项DSH用例通过，原失败证据保留。产品和候选安装器不变，新head远端状态另查。

## 0.10.65 关闭预览说明的验证

按负责人要求去掉内嵌启动说明，仅在托管配置中指定 rc.3 的已知说明版本；官方 `ui-settings-general` README 与实际 schema 声明了该字段。完整上游运行树、权限提示、模型连接与原用户配置保留。此改动只影响 Windows 本地客户端，线上接口无需重新部署。

本机根 CI 837项/66文件、生产3项/B0/Web，客户端与 Electron 类型、7项 DSH 定向测试通过。Browser plugin not available，因此使用 Playwright Electron，在隔离数据目录运行实际 Electron22 与内置 DSH；开发运行树及成品内运行树各验证首次打开、刷新、同目录重启、1024×726窄桌面和第二个工作区共5种场景。页面标题/loopback来源正确、非空、无错误遮罩、输入可编辑、没有预览说明或二次 Key 提示；没有发送模型请求。页面错误为0，仍记录开发探针的 CSP 警告，成品启动冒烟另保留既有 electron-log 初始化警告。

证据保存在 Git 外 `D:\deepseek-agent\.runtime\dsh-no-notice-20261028`，含两组结果/截图、完整CI和构建日志。首次 Playwright 启动因测试环境残留 `ELECTRON_RUN_AS_NODE`（空值仍生效）失败；仅清除测试子进程变量后通过，失败日志保留。未修改或启动负责人现用客户端，未做真实账号/模型验收；仍通过 PR130 交付，不自动合并或公开发布。

0.10.65 NSIS 与包内5个入口、成品启动、6项更新守卫及更新清单 SHA512 核对通过。安装器 `D:\deepseek-agent\.runtime\dsh-no-notice-20261028\windows\AcceptCat_0.10.65.exe`，366,805,432 字节，SHA256 `11ca3555b0ebcddc6ebb559e7cfcce55961e32de8d8d59e62149effb668198d1`。同目录保留 blockmap/latest.yml/SHA256SUMS.txt，未上传公开更新通道。更新守卫第一次命令在根目录找不到客户端测试文件，改为客户端目录后6项通过，错误日志保留。

## 后续

真实账号/模型验收、第三方插件实际安装和插件兼容性、长时间本地任务/机器休眠恢复待单独验证。Web 配置内的插件入口和原运行时保留；DSH 独立桌面的专用原生桥不因本次嵌入 Web 自动具备。现有个人助理/群聊消息路由、云任务分配、共享资料授权与本地 DSH 任务产物之间尚未整合；没有删除或替换原工作台。macOS 与手机不在本批范围。
