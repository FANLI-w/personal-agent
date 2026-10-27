# 桌面统一聊天体验：人与人、人与 Agent、群内多 Agent

## 基线与交付

2026-10-27，继续独立 clone `D:/deepseek-agent/acceptcat-chat-experience`、分支 `feat/chat-conversation-experience` 和 [PR125](https://github.com/luoyan96/personal-agent/pull/125)。开始与交付前 fetch 的 main 均为 `aaa0eea`。首批代码 `6a3d62d`，本次整体扩展代码 `7504d0dcbdffc234e878f5e83bd3f8ffc8ad39c4（主体实现 280f8ea）`。原桌面开发目录保持原状。

本次按负责人新要求完成桌面五项工程改造，手机适配后置。保留 React/Electron、OpenIM、业务后台与 DSH 执行链。没有移植微信二进制或私有协议；Agent 的参与仍由明确提及、引用接续及既有授权规则驱动。

## 五项范围与验收对应

| 方向 | 当前实现 | 工程验证 |
| --- | --- | --- |
| 统一布局 | 会话标题、消息区、输入和消息操作保持一致；搜索放标题区；群协作/任务/材料、助手资料移至详情；长 Agent 回答采用足够宽的正文区域 | 实际消息区、Markdown、详情和输入组件；renderer/Electron 类型及 Web 构建 |
| 群内提及与追问 | 句中按身份选择真人、自己的/其他成员已共享助手；同名显示主人；多选、删除和草稿恢复；引用回答默认接续原助手，可仅引用或改接收者；不可用原因及处理提示 | 15 项输入/状态交互；UTF-16、同名、权限变化与逐助手重试回归 |
| 消息呈现与关系 | 最终回答显示作者/归属和可点击的原问题；每位助手独立状态/流式正文；代码、表格、来源和附件沿用授权渲染；向上阅读不被新消息拉走 | 12 项完整消息区交互包含搜索跳转、历史分页、切换恢复、来源定位和富文本 |
| 真实状态与恢复 | 发送即时显示待确认；保留原请求核对重试；晚到消息按会话隔离；文本/引用草稿在同一标签页恢复，退出/换号清除；撤回取消依赖原消息的在途请求，晚到模型输出不能发布 | 829 项共享测试，其中新增 5 项真实 HTTP/数据库/合成模型检查；客户端 65 项定向回归 |
| 日常功能 | 人/Agent 共用引用、更多菜单、多选、转发、本机删除；业务消息可撤回；搜索定位；保留图片查看/文件收发、群成员管理、免打扰、置顶与通知 | 实际转发/撤回/详情组件，丢失回执不重复转发、删除恢复、免打扰/置顶、管理权限；附件/通知既有定向检查 |

所有“通过”均指下述工程与隔离检查，不代表真实多账号和多设备已经验收。

### 操作规则

- 输入 `@` 可在句中按 contactId 选择对象，展示姓名和主人；工具栏名单包含不可用原因。普通聊天和引用中未选中的 `@` 不调用助手。旧的开头纯文本提及保持兼容，同名需从候选选择。
- 同一助手重复提及只请求一次，每条最多 5 个助手、20 位被提及成员。授权群名单按页读取，最多 2000 人，超过时明确报错，不默默漏掉成员。
- 一个问题保留一个人的消息，助手分别回答。发起者可逐助手停止/重试，其他成员读取可共享状态；私有执行细节按原权限保留。
- 引用正式回答继续追问时保留助手身份和消息关系。引用草稿与文字草稿同属标签页 sessionStorage；最长 24 小时、最多 50 条，失败有提示。刷新不会自动发送。
- 搜索和引用可定位原消息；一次定位最多读取 100 页、2000 条 SDK 历史，超出或未同步会明确提示。阅读位置按账号/会话保存，切换回来恢复；“回到最新消息”明确恢复跟随。
- 多选最多 50 条。普通消息/图片/文件采用 SDK 转发；业务消息重新鉴权读取后只转发署名正文，任务按钮、资料权限和可执行指针不会被复制到目标群。未知协作卡片明确拒绝转发。转发失败在当前弹窗继续核对同一 SDK 消息，跳过已确认项；关闭或刷新弹窗后需要先查看目标会话，当前没有跨重启的批量转发队列。
- 本机删除调用 SDK 本地删除，并按账号/会话保存最多 2000 个隐藏 ID；不撤回别人收到的内容、不取消任务。发送结果未确认的消息必须先处理原发送记录。
- 本人业务消息可在两分钟内撤回，真人 SDK 消息遵循 OpenIM 的撤回校验。业务撤回保留审计原文，读取投影变为撤回提示；取消依赖该输入的在途助手请求。已生成回答、已执行任务、已转发/下载副本保留。
- 群内共享助手的作者/归属和群协作详情共用已授权名单；管理操作在提交前核对原账号/会话，并继续由后台执行权限校验。群成员邀请/移除沿用业务记录与 OpenIM 同步链。

## 接口与旧客户端兼容

React 18.3.1、CKEditor 43.0.0、OpenIM SDK `3.8.3-patch.15.1` 保持；没有新增依赖、锁文件或客户端版本变化。共享契约升级到 **0.35.0 / chatProtocol 1.13.0**，数据库增加 **028**：

- `chat_message_relations` 存储同会话回复关系。
- `chat_message_retractions` 存储撤回操作，不重写历史审计消息。
- `chatMessageDetails`（GET `/chat/conversations/{id}/messages/{messageId}/details`）返回授权正文、引用来源、撤回状态、版本和允许动作。查询模型输出的原问题时不暴露私有 turn 预算或执行记录。
- `withdrawChatMessage`（POST 同路径 `/withdraw`）使用 expectedVersion 和幂等键，核对身份、两分钟窗口、当前权限，并停止相关在途请求。
- `sendChatMessage` / `agentChatMessage` 可选 `replyToMessageId`；服务端要求来源可读、同会话、先于当前消息且未撤回。

**既有 ChatMessage 响应结构不增加字段**，旧客户端继续严格解析原协议。新版客户端遇到详情接口 404，会在成功读取旧消息接口后回退；不把 403 当成旧后台或复用过期内容。仅确认后台支持新接口后发送新引用字段。旧后台仍可正常聊天，但新业务撤回与持久回复关系需要本批后台升级；不会把本地 UI 当成已部署成功。

账号 Cookie/CSRF、资料/群权限、模型密钥和 DSH 管理方式保持。后台上线需另行备份数据库、执行 028 迁移并更新 API/worker；本次没有执行这些生产操作。交接记录仍是已部署 `798f77c/28ee6231`、contract0.34/schema027，本次没有重新连接生产服务核验。

## 开发、构建和复现

根目录 Node >=22.19，根 pnpm11.21.0，客户端 pnpm10.28.0：

```powershell
corepack pnpm@11.21.0 install --frozen-lockfile
corepack pnpm@11.21.0 run desktop:prepare
corepack pnpm@11.21.0 run ci
# 以下命令在 clients/openim
corepack pnpm@10.28.0 run dev
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run build:web
node --test tests/group-mentions.test.mjs tests/group-outbox.test.mjs tests/chat-quote-recovery.test.mjs tests/chat-image-submission.test.mjs tests/chat-attention.test.mjs tests/send-recovery.test.mjs tests/desktop-transport.test.mjs tests/desktop-proxy.test.mjs tests/chat-message-compat.test.mjs
```

本机最终验证：根完整 CI **829/829**；OpenIM 生产流程检查 **2/2**、B0 进程和 Web 生产夹具排除检查通过；客户端定向 **65/65**；renderer/Electron 类型检查通过；Web 构建通过，包含四份固定 SDK 资源、静态入口检查。构建产物在 `clients/openim/dist` 和 `dist-electron` 的 Git 忽略目录。

隔离界面复现（clients/openim，两个终端设置同一输出目录）：

```powershell
$env:ACCEPTCAT_CHAT_UI_OUTPUT='D:\deepseek-agent\.runtime\chat-unified-desktop-20261027\ui'
node tests/chat-experience-ui/serve.cjs
# 另一个终端
node tests/chat-experience-ui/interaction.cjs
node tests/chat-experience-ui/timeline-interaction.cjs
```

地址 `http://127.0.0.1:4389`，完整消息区用 `?timeline`。实际生产组件 + 合成 API/SDK/身份，页面有明确标注；Sass/Tailwind/CSS Modules 均编译。Browser plugin 不可用，使用 Playwright 隔离无头 Edge；可通过 `ACCEPTCAT_CHAT_UI_BROWSER` 指定已安装浏览器通道。输入回归 **15 项**、完整消息区 **12 项**通过。桌面 1280x960 截图已检查，包括宽正文、来源、历史定位和统一群详情；保留旧 390px 输入回归，但本次不承诺手机适配。

Git 外证据：`D:/deepseek-agent/.runtime/chat-unified-desktop-20261027`。最终根记录 `root-ci-3.log`，客户端 `client-focused-final.log` + `message-compat.log`、`client-types-complete.log`、`electron-types.log`、`client-build-complete.log`，界面 `ui-timeline-complete.log`、`ui-existing-complete.log` 和 `ui/`。此前迁移测试基线失败、历史恢复缺陷、夹具样式/选择器修正与其他过程日志保留；既有 Router/Ant Design 开发警告、第三方构建提示不作应用通过证据。

## 交付与下一步

普通 IM 文字/提及镜像的撤回另需升级 OpenIM 派生镜像并启用 `afterRevokeMsg`。上游固定 SHA `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7` 的撤回回调只提供会话/序号，发送回调在入队后触发，不能假定发送时已有可配对序号。本 PR 的既有派生补丁从服务端查到的原消息补充 SendID/ClientMsgID；API 校验可信操作人、自己的原消息和业务会话，幂等更新镜像，并持久记录撤回先到的情况。固定版本回调名称为 `callbackBeforeAfterMsgCommand`，单独分流，不能误走 before 授权逻辑。没有原消息标识的旧服务端回调不会按猜测撤回业务消息；其他人/管理员撤回不在本次开放范围。部署须同时更新 API、迁移028、派生镜像和 webhook 配置，本轮未执行。

本机没有生成本批 Windows 安装器或 APK，没有安装/操作正在使用的客户端。Windows 打包由 PR 既有 CI 单独执行，必须核对本次 head 的完成状态和 artifact；上一版 PR 的绿色状态或安装包不能替代本次验证。手工打包命令为根目录 `corepack pnpm@11.21.0 run desktop:win`，默认输出 `clients/openim/release/Base/<version>`，不是公开发布。

合并、后台部署、内部安装验收和公开 Release 分开处理，Windows 更新清单/发布通道未改动。手机后置。

接下来用负责人提供并操作的测试账号验收“两个人、各有一个 Agent、同一群”的四个身份：叫自己/对方的共享助手、同时叫两个、引用追问、逐助手失败恢复、切换会话、重连和权限变化。真实 OpenIM 时序、多设备同步、真实模型、长时间运行及原生安装仍未通过实际环境验收。本次没有读取真实私人资料或模型密钥。

### Windows 打包前回归补充

首次远端 d3ad075 在打包前的图片操作测试失败：编译夹具缺少新 timeline/roster 导入，且图片专用右键菜单仍需隔离。产品修正 `7504d0dcbdffc234e878f5e83bd3f8ffc8ad39c4` 保留图片自己的右键菜单，统一转发/多选通过独立“更多”入口使用；同时阻止旧会话异步创建的转发消息进入新操作缓存。更新夹具为按菜单 key 检查复制动作，并将新旧后台兼容测试纳入远端打包守卫。

本机重跑完整 Windows 打包前测试集合：构建失败守卫9、规划/依赖41、客户端操作182，共232项通过，原有图片复制/另存/OCR/选择文字保护继续成立。记录在 `package-build-guards.log`、`package-planner-guards.log`、`package-client-guards.log`；远端原失败保存在 `remote-package-failure.log`。最终安装包仍以修正后的 PR head 构建为准。

### 最终撤回同步与安装包核验

产品源码最终为 `7352c5bcbb84510fafa1f133f4aa52edd083f71a`，后续只补验证文档。原生撤回桥接新增1项综合回归，检查重复、乱序、错误操作人/会话和旧上游缺少消息标识；OpenIM 定向15项通过。最终本机完整 CI 828/830通过，两个已有聊天测试超过15秒上限；保持原时限，单独重跑2项均通过，不将这次本机全量写成全部通过。完整 CI 以同一产品提交的 [Foundation 40491790829](https://github.com/luoyan96/personal-agent/actions/runs/40491790829) 为准，Linux Node22.19/24两路已通过。过程证据 `root-ci-final.log`、`chat-timeout-recheck.log`、`native-revoke-tests.log` 均保留。

固定 OpenIM 官方 SHA 的干净源码通过 `git apply --check`。用 Git 外便携 Go1.27.3/Windows 实际编译 `internal/rpc/msg` 并运行 `TestRAPRevokeCallbackOriginalIdentity` 通过，`go mod verify` 通过；首轮检查暂停、后续限制并发完成，日志分别保留为 `go-revoke-test.log`、`go-revoke-test-bounded.log` 和 `go-module-verification.log`。派生 Dockerfile 仍固定 Go1.22.12，已纳入该包测试；本轮没有 Docker 镜像构建或服务启动结果。

产品提交7352c5b的 [Windows CI 40491790846](https://github.com/luoyan96/personal-agent/actions/runs/40491790846) 已通过类型、232项打包前检查、NSIS及包内CommonJS检查、安装器/更新元数据一致性检查。下载的内部测试包：

- `D:/deepseek-agent/.runtime/chat-unified-desktop-20261027/windows-7352c5b/0.10.60/AcceptCat_0.10.60.exe`
- 88,236,573字节；SHA256 `300a0741719b980bf87517c3899573ed45e009974f64f7d813cbac31f326acf3`。
- SHA512已与同一artifact内 `latest.yml` 比对一致，记录 `installer-verification.json`；没有执行安装器。

因此“工程可编译、Windows测试安装包已生成”已有证据；“新后台已部署、真实两人两Agent群聊、多设备和安装体验已通过”仍没有实际验收证据。原版本号0.10.60只用于内部构建，不代表新的公开版本，不能把artifact的latest.yml上传到现有更新通道。手机仍后置。

最终核对：Foundation40491790829已全部成功，Linux Node22.19、Linux Node24和Windows Node24三路完整CI均通过；与Windows打包组成四项绿色检查。完整远端记录保存为 `remote-final-foundation.log`，安装器校验另存上述JSON。本次最后仅提交文档，产品和安装包受测源码保持7352c5b。

### 2026-10-27 输入区工具栏纠正

本节为上述7352c5b之后的产品改动。负责人提供的微信截图明确指出工具组织偏差，旧实现把图片、粘贴图片、文件、本地目录分析和群提及混排，且仍使用悬浮大圆角和箭头发送。本次桌面统一为表情、扩展、文件夹（发送文件）、剪刀及下拉（截图/粘贴）、麦克风（语音消息），右侧文字发送；接收对象不改变常用图标位置。图片选择、群成员/助手选择、本地目录分析、报告/协作入口移入扩展，原权限与输入@不变。扩展关闭销毁子弹层，选定助手后回到编辑器。

`captureChatScreens` 是新增的窄 Electron IPC：可信前台窗口触发，隐藏当前窗口250ms后通过固定Electron22.3.27的desktopCapturer获取屏幕快照，15秒超时并恢复窗口。最多8屏、总dataURL64MiB；选择屏幕后框选或选整张，PNG不超过既有10MB限制，加入ImagePasteTray，仍需手动发送。截图操作绑定账号代次/会话/路由，取消或切换不注入新会话。没有常驻录屏、落盘、剪贴板读取或自动模型请求。没有微信式全屏覆盖标注、全局截图快捷键和语音转文字；不将这些能力画成可用按钮。此处麦克风沿用录制语音消息，未改成语音转文字。

检查：`pnpm typecheck`、`pnpm typecheck:electron`、`pnpm build:web`通过；`node --test tests/chat-screenshot.test.mjs tests/chat-image-submission.test.mjs tests/chat-image-actions.test.mjs tests/image-paste.test.mjs tests/chat-quote-recovery.test.mjs tests/group-mentions.test.mjs` 58/58通过。截图6项覆盖可信/前台边界、成功/失败/空结果恢复、超时、并发和导航丢弃，已纳入Windows打包CI。共享业务代码未变，未重复根全量CI。

UI验证改用本轮可用的IAB，`tests/chat-experience-ui/serve.cjs`新增`?toolbar`使用合成electron桥但实际ChatFooter/SendActionBar/ScreenshotAction/CKEditor和原生样式。1280×720下检查群聊/私聊固定工具栏、表情插入、菜单/输入@选择同名助手、两助手合成发送状态、语音面板、截图裁剪为PNG暂存、失败提示及切换丢弃；实际截图为合成画布，附件接收器为测试桩，未声称真实桌面捕获或上传通过。原有交互回归脚本更新了移入扩展后的选择路径，本轮未重跑整套旧脚本。对照图和检查笔记在Git外`chat-toolbar-correction-20261027`，用户原图不进入仓库。旧版可见高度不足与残留二级菜单经实际渲染发现并修正。

产品提交0619c98170ce285b320d0b65963560e24d40c7ef，本机`pnpm build:win`生成NSIS并通过包内入口守卫，`node scripts/check-windows-update.mjs`通过；另外核对包内main与preload的capture-chat-screens桥接。新的内部测试安装包保存至 `D:/deepseek-agent/.runtime/chat-toolbar-correction-20261027/windows-0619c98/AcceptCat_0.10.60.exe`，88,242,587字节，SHA256 `d20b226eb37e8eb44e3895be23d3d509114b8b3a2552c20368b41420f1e877a1`。同目录保留blockmap/latest.yml用于核对，未上传更新通道。它替代本批验收用途的旧7352c5b包，未安装或公开发布。个人助手合成会话也已复核固定工具栏，实际原生捕获及安装体验仍待负责人检查。

### 2026-10-27 消息右键操作纠正

负责人再次指出消息下方“引用/更多”和割裂的菜单不符合微信操作。移除重复行内按钮，MessageItem提供同一份消息动作给文字/Agent/文件/图片；图片弹层与预览保留复制原图/另存/OCR，同时接入转发、多选、引用和删除。公共菜单采用紧凑矩形、固定图标列、操作分隔线、末尾红色删除。复制在适用类型中放首项，引用Agent继续传递原contactId，普通成员引用不自动调用Agent。当前菜单没有编辑、收藏、提醒、系统打开方式和通用文件复制，这些未实现，不提供装饰性按钮。删除仍走原本机删除确认和持久隐藏逻辑。

FileMessageRender右键提供原生“另存为”，双击/Enter也可保存；保存成功才出现“在文件夹中显示”。新增save-chat-file/reveal-chat-file IPC，复用authority可信窗口边界、系统保存对话框及覆盖确认，严格限制64MB字节输入，文件名去路径/非法字符并拒绝设备名。主进程仅接受自己签发的保存token定位文件，最多128记录、30分钟过期，不接受renderer指定任意磁盘路径。下载omit凭据、64MB真实流量上限、60秒取消，并沿用AgentChatOperation阻止切换后落入另一会话；renderer短期token按账号代次/IM身份/会话/消息区分，以承受虚拟列表卸载，不持久化私有文件路径。

验证：renderer和Electron类型通过，`node --test tests/chat-image-actions.test.mjs tests/chat-file-actions.test.mjs tests/chat-quote-recovery.test.mjs tests/chat-message-compat.test.mjs` 32/32通过，包括7项本批新增的菜单/原生文件测试；`pnpm build:win`和`node scripts/check-windows-update.mjs`通过。此前第一次类型检查发现AntD菜单联合类型没有共同type字段，已修正并通过复查。IAB在`?timeline&toolbar&menus`运行实际虚拟消息列表与组件，验证右键文字/Agent/文件/图片菜单、文件引用、Agent引用保留追问对象、图片多选、文件保存完成后显示文件夹入口。原生保存/定位使用合成桥，Node测试使用模拟系统对话框/文件系统，未操作私人文件或正在使用的客户端。定位菜单选项时IAB语义点击未命中，依据截图坐标完成动作并验证结果；没有把无结果点击算通过。已有timeline自动化脚本已适配右键入口，本轮未整套复跑。

证据：`D:/deepseek-agent/.runtime/chat-context-menu-20261027`，包含类型日志、focused-tests.log、build-win.log、installer-verification.json、真实组件截图与仅用于本机的参考对照。用户截图不提交Git。新安装器`windows/AcceptCat_0.10.60.exe`为88,251,913字节，SHA256 b75cc15779540843e467cf7361a5d87a3478eff44a5c5369334591ce45f9d2d1，未执行安装、未发布或改更新通道。未新增后台要求，仍通过PR125交付。
