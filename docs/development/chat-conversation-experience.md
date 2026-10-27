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

本机没有生成本批 Windows 安装器或 APK，没有安装/操作正在使用的客户端。Windows 打包由 PR 既有 CI 单独执行，必须核对本次 head 的完成状态和 artifact；上一版 PR 的绿色状态或安装包不能替代本次验证。手工打包命令为根目录 `corepack pnpm@11.21.0 run desktop:win`，默认输出 `clients/openim/release/Base/<version>`，不是公开发布。

合并、后台部署、内部安装验收和公开 Release 分开处理，Windows 更新清单/发布通道未改动。手机后置。

接下来用负责人提供并操作的测试账号验收“两个人、各有一个 Agent、同一群”的四个身份：叫自己/对方的共享助手、同时叫两个、引用追问、逐助手失败恢复、切换会话、重连和权限变化。真实 OpenIM 时序、多设备同步、真实模型、长时间运行及原生安装仍未通过实际环境验收。本次没有读取真实私人资料或模型密钥。

### Windows 打包前回归补充

首次远端 d3ad075 在打包前的图片操作测试失败：编译夹具缺少新 timeline/roster 导入，且图片专用右键菜单仍需隔离。产品修正 `7504d0dcbdffc234e878f5e83bd3f8ffc8ad39c4` 保留图片自己的右键菜单，统一转发/多选通过独立“更多”入口使用；同时阻止旧会话异步创建的转发消息进入新操作缓存。更新夹具为按菜单 key 检查复制动作，并将新旧后台兼容测试纳入远端打包守卫。

本机重跑完整 Windows 打包前测试集合：构建失败守卫9、规划/依赖41、客户端操作182，共232项通过，原有图片复制/另存/OCR/选择文字保护继续成立。记录在 `package-build-guards.log`、`package-planner-guards.log`、`package-client-guards.log`；远端原失败保存在 `remote-package-failure.log`。最终安装包仍以修正后的 PR head 构建为准。
