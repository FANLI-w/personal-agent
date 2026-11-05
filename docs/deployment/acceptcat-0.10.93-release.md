# AcceptCat 0.10.93 发布回执

负责人于 2026-11-04 明确授权合并已修改部分、检查并发布。北京时间 **13:19:36** 已公开稳定 Latest [v0.10.93](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.93)，Release ID **433540893**。没有覆盖 0.10.91 公开资产或原 0.10.92 本机测试包。

## 来源与合并

- PR168 四项 CI 通过后普通合并为 `216464ca1a072d7549c7c0ed4394c304b46ffd2e`；PR165、166、167 随提交历史整合，均已 MERGED。
- PR169 最终受审 head `5a04fb0277bbad56a1abec96cd27b604900d00bc`，四项 CI 全成功，普通合并为 **`3c6c8584ef8f6b4949e5e70aa07a4da5ca88fafb`**。合并树与受测树逐字相同，main 自身的 Foundation 与 Windows package 也通过。
- 从重新 fetch 的上述 main 提交构建，tag `v0.10.93` 精确指向实际构建提交。记录 1,639 个已跟踪输入的 SHA256，构建后再次核对均未变化，Git 工作区干净；未借同事目录打包或覆盖其工作。
- 该提交保留同事 PR163 的三个提交，含两态规划、结构化问题向后兼容和移除客户端 single 合并。PR169 是额外的旧状态恢复和确认检查，不能以它代替对 PR163 成品是否纳入的检查。此前 0.10.91 漏打包的复核见[说明](../development/planner-two-state-compatibility.md)。

仅已提交源码归档 `source.tar.gz` SHA256：`8a29ecdd19d54d9e603517ab5b77d91e9e78e99dbe101d8a3ece75ab0fff6036`。归档及运行证据在 Git 外 `D:\deepseek-agent\.runtime\release-0.10.93-20261104`。

## 构建与成品检查

根入口 `corepack pnpm@11.21.0 run desktop:win` 退出 0，使用根 pnpm11.21.0、客户端 pnpm10.28.0 的冻结安装。旧 dist、dist-electron、运行包目录先移到受控 set-aside 目录保留，完整构建共享包、Web、Electron 和 NSIS；未仅重新封装旧页面。Electron43.8.4、electron-builder23.6.0 与内部组件版本核对通过。

直接从新 **EXE** 提取归档与关键资源，检查结果：

- `app.asar` SHA256 **`231b902932c15a3d33951b35c55fe23e1ec9e0ea2a10c3928a917a1887395365`**，与 win-unpacked 相同。
- **129 个**包内构建文件与本轮 dist/dist-electron 逐项一致；真实代码含讨论组件、一个问题/候选回答、粗骨架规则、旧状态提示和重新梳理入口，样式含 discussion-flow/option 与中性未知状态；无旧“合成一项”指令。
- 包内任务拆解 Skill 与本次 agents/skills 源文件逐字一致；CommonJS、原生 DSH 桥接、SDK 静态资源与 HTML 引用检查通过。
- EXE 与应用 FileVersion 均为 **0.10.93**；内置 DSH **0.2.1-rc.3**，已核对固定运行包与完整资源树。EXE 内 DSH app.asar、CLI 入口及标记与构建目录相同。
- 内置科研插件 **0.3.3** tarball 与固定 SHA256 一致，tectonic 实际输出 **Tectonic 0.17.0**；这里证明安装包内置资源，不声称负责人真实 profile 的插件已经升级成功。
- 无 rcedit 残留 tmp；更新清单的版本、名称、SHA512、大小、blockmap 和公开 GitHub 更新源通过检查，无嵌入凭据。

功能检查：根 70 文件 / **870 项**及生产入口、客户端类型和相关规划/聊天/DSH/构建回归通过远端 CI；本轮规划修复另有 46 项客户端检查、隔离真实 HTTP/SQLite 与合成模型、讨论组件的合成交互证据，范围见修复说明。

**启动失败留证：** 首次本机隔离启动与 EXE 解包检查并行，原脚本在 15 秒时停于 `native-sdk-loading`，记录于 `electron-smoke-first.log/.exit`。随后未修改程序或阈值，单独按原脚本两次检查均通过（`electron-smoke-retry.log/.exit`、`electron-smoke-confirm.log/.exit`）；不能据此断言首次超时的具体根因。隔离临时 profile、隐藏窗口，未登录或操作负责人客户端。日志保留既有 electron-log 重复 initialize 告警，未宣称本次修复该告警。

## 发布资产与公开复核

四附件先上传草稿，全部 uploaded 且远端 SHA256/大小与本地相同后才公开为稳定 Latest；`gh release create` 使用 `--notes-file`，tag 已核对实际源码。

| 附件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.93.exe | 418882614 | `e0bd3378b99c6a9bf8bf6c96ec0845d66e7891cf6a943bcf1380ec44380f6240` |
| AcceptCat_0.10.93.exe.blockmap | 431412 | `81a692ceab52a27353444eb0d42ef2f35f252562c465fd8c1b112d8023efba31` |
| latest.yml | 341 | `5d8c2183e246c8998d5d150a79c87037571078869da62145e7939bac2bcdf315` |
| SHA256SUMS.txt | 262 | `36f6325f72ffd0bd2d610d3f50776b9d90fd9b65e0865141100f80180faa8c68` |

公开后匿名 GitHub Latest 为 v0.10.93、非草稿/非预发布；实际匿名下载 latest.yml 与 SHA256SUMS.txt 并核对摘要一致，EXE 的公开 HEAD 返回 200、Content-Length 为 418882614。没有重新下载整份 EXE；上传后远端 SHA256/大小与匿名下载可达性分别核验。证据包括 installer-audit.json、built-assets.json、windows-update-check.log、release-draft/public-verified.json、anonymous-verification.json 与两个匿名下载的小附件。

草稿上传中一次只读按 tag 查询得到 404；列表可见预期草稿，之后用其实际 ID 433540893 核验，没有重建 Release 或增加权限。`draft-tag-lookup-first.log` 记录该探针失败；上传与正式发布本身均成功。构建中既有 Vite/Ant Design 提示保留于 windows-build.log。

## 后台与验收边界

13:19 的发布阶段只合并、构建和公开安装包，没有顺带部署 ECS。负责人随后单独授权，**15:03:21 已从同一固定提交 3c6c858 更新配套 API/worker**，PR169 的服务端 system、确认接口与动作投影已在线；见[后台部署回执](planner-two-state-20261104.md)。契约仍 0.41.0、schema032，无新迁移，群邀请修复保留。公网 database/storage/authentication 均 ok，harness 为 not_verified。Release 说明同步补该事实，四附件未变。

未运行真实账号/付费模型、代建群、代创建科研任务或安装到负责人客户端。原生启动与合成流程不能代替真实规划效果、双账号群聊或安装体验。未纳入手机 PR90 或负责人排除的 PR35。

用户安装后重点验收：旧计划重新梳理保留内容和 ID；问题候选只填输入框；全部可执行再明确确认，创建数量与草案一致；同事在群内邀请自己的助理及联系人。完整服务端规划验收需配套后台更新。
