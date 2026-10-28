# 建群成员身份与真实群主

2026-10-28，基于 main/93da480，独立 clone `D:/deepseek-agent/acceptcat-chat-experience`，分支 `fix/group-member-identities`。原桌面开发目录未改动。候选客户端 0.10.62，公开版本仍为 0.10.61。

## 原因与边界

`apps/api/src/chat.ts` 创建群时已把 `ownerMemberId` 和 owner 成员设置为创建群的真人。受邀人通常处于 invited 状态，须在通讯录的群邀请中接受；公共智能体等可直接加入的情况仍以后台返回为准。`openim-bridge.ts` 则为消息传输使用 imAdmin 技术群主，只同步已加入成员。旧详情页直接读取 SDK 名单，造成 imAdmin 加创建者、选中的同事消失的误解。

本次不转移或删除技术账号。现有 OpenIM 回调依赖技术群主来守住成员/角色变更边界；直接赋予真人原生群主会改变权限模型。本次仅改客户端展示与操作衔接，不修改后台/API/数据库，也不自动接受他人的邀请。

## 实现

- 建群与邀请共用联系人/智能体选择器；读取业务通讯录 mine 和 directory 的完整分页并去重，按权限过滤，显示助手归属、支持搜索和跨分类选择，提交真实 contactId。
- 群详情和标题人数读取 `chatConversation` 与已加入的 `chatConversationContacts`。待接受身份只按现有 ACL 读取 `chatContact` 资料，不进入可 @ 的已加入名单。群主必须同时符合 owner 角色、真人身份和 ownerMemberId，未知资料不冒充确定身份。
- 已加入和待接受邀请分开显示；邀请页禁止重复选择这两种身份。真实群主的管理入口按 allowedActions 展示，移除/取消邀请调用既有 revokeChatMember，再同步通信名单。普通成员没有管理入口。
- 创建业务群成功后保留 ID；通信同步失败保持窗口与错误说明，只重试同步。提交防重复点击，账号/会话切换拒绝迟到操作和结果。成员读取失败清除旧事实并提供重试，不回退到技术账号名单。
- 不再显示后台不接收的建群头像上传控件。普通 SDK 模式不受这些业务分支影响。置顶、免打扰、搜索、任务资料入口保持现有逻辑。

## 检查与复现

在 `clients/openim` 执行：

```powershell
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
node --test tests/group-members.test.mjs tests/contact-directory.test.mjs tests/group-mentions.test.mjs tests/group-outbox.test.mjs tests/conversation-actions.test.mjs
```

双类型通过，45/45 定向检查通过；新增身份/分页/权限测试加入桌面 CI。修改仅涉及客户端及其打包检查，未改共享业务代码。本批 Web 构建通过，最终安装构建另记。

隔离 Playwright/Edge 使用实际选择器、详情抽屉、成员组件和读取钩子，网络与账号为合成替身（Browser 插件在本会话不可用）。10 项交互覆盖分类、同名助手归属/搜索、精确 ID、同步失败后不重复建群、真实群主与待接受展示、禁止重复邀请、接受后轮询更新、成员移除、非群主权限、读取失败和紧凑桌面。零应用错误；既有 Ant Design findDOMNode 弃用警告保留。1280×1000、1000×820 截图已检查。

证据在 Git 外 `D:/deepseek-agent/.runtime/group-identities-20261028`：`focused-final.log`、`types-final2.log`、`build.log`、`ui-check-final2.log`、`ui-results.json`、`picker.png`、`pending-detail.png`、`picker-compact.png`。早期两个 UI 脚本因按钮定位不匹配失败的原日志保留，修正定位后通过。合成测试不是生产邀请、真实 OpenIM 或模型验收。

根目录的安装构建命令：

```powershell
corepack pnpm@11.21.0 run desktop:win
node clients/openim/scripts/check-windows-update.mjs
```

产物默认生成于 `clients/openim/release/Base/0.10.62`（Git 忽略）。本批不合并、不公开发布、不部署后台；安装包完成后的路径和摘要另补。

## 下一步

由负责人安装候选包，用两个真实账号核验：创建者显示为群主；同事先显示待接受，在通讯录接受后成为正式成员；自己和对方的助手归属正确，未接受的助手不能被 @；普通成员没有群主操作。真实环境尚未验收。技术群主仍在传输层存在，业务身份与权限只由后台决定。群主转让、改名、解散等新业务能力不在本批范围内。
