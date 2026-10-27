# 聊天体验第一批：群内提及、回复归属与追问

## 基线与范围

2026-10-27 从实际 fetch 的 main `aaa0eea` 建立独立 clone `D:/deepseek-agent/acceptcat-chat-experience`，分支 `feat/chat-conversation-experience`。原桌面开发目录及其他人的分支保持原状。

产品源码 `6a3d62d540c2106e109a75409d87a39813a680a1`，交付 [PR125](https://github.com/luoyan96/personal-agent/pull/125) 待审，合并由负责人决定。

本批直接改进已有 React/Electron/OpenIM 聊天，不移植微信二进制或协议。重点是群内人与多个 Agent 的交流；完整搜索、转发、群管理、任务与资料卡片整合以及移动端适配留待后续批次。没有新增 Agent 自动互相调用机制。

## 已实现

- 在句中输入 `@` 即可选择成员或助手；工具栏支持搜索姓名和所属成员。显示“我的助手”“某成员的助手”，同名助手按真实 contactId 区分。
- 编辑器保存身份标记和 UTF-16 文字位置，支持草稿恢复、表情、换行与 HTML 实体。发送前复核成员、名称、可用性和范围；同一助手重复提及只调用一次，最多五个助手、二十位成员。
- 未经选择的正文中间 `@名字` 和追加的引用文字不会触发助手。旧的开头纯文本 @ 保持兼容；同名时提示从候选列表选人。
- 一个群问题对应各助手的独立真实状态。流式气泡使用实际助手身份和原问题摘要；不再用群头像表示多个助手。最终消息同步仍沿用既有去重逻辑。
- 流式窗口最多展示最近八项进度；原消息上的各助手状态继续保留。大量并行请求的分组和分页不是本批完成项。
- 群中助手的正式回答支持“回复此助手”，后续问题自动按身份发回它；可以选择“仅引用内容”，或显式 @ 其他成员改变接收者。高级协作选项不能覆盖正文已选身份，其材料和预算仍用于本次请求。
- 发起者可分别停止、查看详情或核对剩余预算后重试某位助手；其他成员只读取公共回执。账号/会话切换继续隔离草稿、私有进度和迟到响应。
- 当前群共用一份权限范围内的成员读取结果，避免每条状态各自拉取成员名单。默认读取上限沿用现有 100 条；超大群分页仍需后续完善。

## 接口与兼容

依赖保持 React 18.3.1、CKEditor 43.0.0、OpenIM SDK `3.8.3-patch.15.1`，没有新增依赖或改动锁文件。提及使用已安装 CKEditor Mention 插件的定制转换器。

沿用 `sendChatMessage` 的 `mentions`、`agentContactId/agentContactIds` 及现有服务端范围校验；`chatMessageAgentStatuses` 读取公共状态，发起者使用既有 `chatTurn/chatTurnProgress/cancelChatTurn/retryChatTurn`。登录会话、CSRF、权限、DSH 模型链路及密钥管理不变。后台已支持句中身份范围，不需要新的 API、共享契约或数据库迁移。沿用交接记录中的 contract 0.34/schema027，本批没有重新核验或部署生产后台。

没有变更客户端版本、Windows 更新清单或发布通道，没有生成本批 APK、Windows 安装包或公开 Release。Web 构建产物仅在本工作目录的忽略目录中。

## 验证与复现

根目录先运行 `corepack pnpm@11.21.0 run desktop:prepare`；之后在 `clients/openim`：

```powershell
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run build:web
node --test tests/group-mentions.test.mjs tests/group-outbox.test.mjs tests/chat-quote-recovery.test.mjs tests/chat-image-submission.test.mjs tests/chat-attention.test.mjs tests/send-recovery.test.mjs tests/desktop-transport.test.mjs tests/desktop-proxy.test.mjs
```

上述 62 项回归、renderer/Electron 类型检查通过；Web 构建成功并通过四份固定 SDK 资源及静态入口守卫。仅客户端及文档改动，按 AGENTS 未重复本机根共享代码 CI；远端以 PR 实际 head 的检查为准。构建存在既有第三方 `use client` 和 bundle 大小提示。

隔离交互测试位于 `clients/openim/tests/chat-experience-ui`。终端一启动，终端二执行：

```powershell
# 两个终端可设置同一个 Git 外输出目录；缺省为系统临时目录。
$env:ACCEPTCAT_CHAT_UI_OUTPUT='D:\deepseek-agent\.runtime\chat-conversation-experience-20261027\repro-ui'
node tests/chat-experience-ui/serve.cjs
# 另一个终端（默认使用本机已安装的 Edge）
node tests/chat-experience-ui/interaction.cjs
```

测试地址 `http://127.0.0.1:4389`；浏览器可通过 `ACCEPTCAT_CHAT_UI_BROWSER` 选择已安装的 Playwright 浏览器通道。Browser plugin 不可用，因此使用 Playwright 的隔离无头 Edge，不接管正在使用的客户端或浏览器。测试复用实际编辑器、输入框、群状态、重试/停止和流式组件；账号、API、OpenIM 与附件/桌面能力为合成替身，页面明确标注。

15 项检查通过：同名身份、一次输入多助手、独立停止、定向追问/引用退出、搜索、390px 菜单、草稿恢复、Enter 选择不误发、Unicode 范围、高级选项、失败重试、账号切换及桌面样式下提及图标可见性。截图和结果保存在上述目录；浏览器保留 React Router future flag 与 Ant Design findDOMNode 开发模式警告，无应用运行错误。此前类型错误、夹具断言/选择器/过渡动画等待修正和终止的测试均保留 Git 外证据，不把中间失败当作验收通过。界面复查修正了 CKEditor UI reset 覆盖候选样式、桌面样式隐藏 @ 图标和图标默认零行高。

这只能证明工程可构建和合成环境中的组件交互通过，不能证明真实账号群聊、实际 OpenIM 重连/多设备顺序、模型回答、原生安装或 Android/iOS 已验收。本批没有读取私人资料或模型密钥。

## 下一批

1. 用测试账号验收真实群中两位同名助手、断网重连、五助手并发、权限撤回和消息同步；真实账号与设备由负责人提供并操作。
2. 把流式进度与最终回答进一步关联到原问题，补充长群聊定位、引用跳转和消息搜索，减少多轮交错时的阅读成本。
3. 完善人与人聊天的转发、撤回、群成员入口及键盘操作；逐项核对 OpenIM 现有能力。
4. 将任务/资料结果卡片与对话串联，明确多 Agent 协作的发起者、权限和执行边界，再同步移动端。
